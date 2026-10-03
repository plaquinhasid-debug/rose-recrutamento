#!/usr/bin/env node
// M0-B.1 — GUARD de segurança da M0-C (reconstrução do banco em ambiente
// descartável). SOMENTE LEITURA: não inicia Supabase, não roda Docker run,
// não executa migrations, não altera arquivos, não chama rede.
//
// FALHA FECHADO: termina com exit != 0 se QUALQUER verificação falhar ou se
// não conseguir provar uma condição. Só termina com 0 quando tudo passou.
//
// Uso:
//   node scripts/m0c/m0c-safety-check.mjs
//       → verificações estáticas (repo, env, arquivos de env, link do CLI).
//   node scripts/m0c/m0c-safety-check.mjs --container <nome>
//       → também exige que o container do replay exista e esteja com
//         NetworkMode=none e sem nenhuma rede (`docker inspect`, só leitura).
//
// Ver docs/m0/M0-C-procedimento-fail-closed.md.

import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

// Ref do projeto Supabase de PRODUÇÃO da Tania (montado em partes para que o
// próprio guard não seja "achado" por buscas simples pelo ref).
export const PROD_REF = ["iaqzbern", "shmhkqznleye"].join("")
export const EXPECTED_LOCAL_PROJECT_ID = "tania-joias-recrutamento-local"

// Únicas migrations autorizadas a conter o ref de produção: são fonte
// HISTÓRICA (crons com URL fixa). O replay só é seguro porque roda sem rede.
export const HISTORICAL_PROD_URL_MIGRATIONS = [
  "20260730190153_schedule_daily_leads_report.sql",
  "20260815010000_add_lembrete_ficha_automatico.sql",
]

// Variáveis que NUNCA podem estar com valor no ambiente da M0-C.
export const FORBIDDEN_ENV_VARS = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "WHATSAPP_CLOUD_API_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_FICHA_TEMPLATE_NAME",
  "WHATSAPP_APPROVAL_TEMPLATE_NAME",
  "WHATSAPP_TANIA_NOTIFICATION_TEMPLATE_NAME",
  "WHATSAPP_AUTO_REPLY_ENABLED",
  "TANIA_WHATSAPP_NOTIFICATION_NUMBER",
  "TANIA_WHATSAPP_NUMBER",
  "RESEND_API_KEY",
  "META_APP_SECRET",
  "META_CONVERSIONS_API_TOKEN",
  "META_PIXEL_ID",
  "ANTHROPIC_API_KEY",
  "CONSIGGOLD_SUPABASE_URL",
  "CONSIGGOLD_SUPABASE_ANON_KEY",
]

// Variáveis que, se presentes, precisam apontar para localhost.
export const URL_ENV_VARS = ["SUPABASE_URL", "VITE_SUPABASE_URL", "DATABASE_URL", "SUPABASE_DB_URL", "PGHOST"]

// Arquivos de env que o Supabase CLI / edge runtime carregam sozinhos.
export const AUTOLOADED_ENV_FILES = [
  "supabase/.env",
  "supabase/.env.local",
  "supabase/functions/.env",
  "supabase/functions/.env.local",
]

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|::1|\[::1\]|host\.docker\.internal)$/i

export function isLocalUrlOrHost(value) {
  const v = String(value ?? "").trim()
  if (!v) return true
  try {
    const u = new URL(v.includes("://") ? v : `postgres://${v}`)
    return LOCAL_HOST_RE.test(u.hostname)
  } catch {
    return false // não conseguiu provar que é local → não é local
  }
}

export function mentionsProduction(text) {
  const t = String(text ?? "")
  return t.includes(PROD_REF) || /\.supabase\.co\b/i.test(t) || /taniajoiasmaua\.com\.br/i.test(t)
}

/** Lê pares NOME=valor de um arquivo .env (ignora comentários/linhas vazias). */
export function parseEnvFile(content) {
  const out = {}
  for (const raw of String(content).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  }
  return out
}

/**
 * Avaliação PURA (sem I/O): recebe um retrato do ambiente e devolve a lista
 * de resultados. Cada item: { id, status: "PASS" | "FAIL" | "WARN", detail }.
 */
export function evaluate(ctx) {
  const results = []
  const pass = (id, detail) => results.push({ id, status: "PASS", detail })
  const fail = (id, detail) => results.push({ id, status: "FAIL", detail })
  const warn = (id, detail) => results.push({ id, status: "WARN", detail })

  // G1 — config.toml local
  if (ctx.configToml == null) {
    fail("G1-config-toml", "supabase/config.toml ausente — não dá para provar configuração local")
  } else {
    const m = ctx.configToml.match(/^\s*project_id\s*=\s*"([^"]*)"/m)
    if (!m) fail("G1-config-toml", "project_id não encontrado em supabase/config.toml")
    else if (m[1] !== EXPECTED_LOCAL_PROJECT_ID) fail("G1-config-toml", `project_id inesperado: "${m[1]}"`)
    else if (mentionsProduction(ctx.configToml)) fail("G1-config-toml", "config.toml menciona produção (ref/supabase.co/domínio)")
    else pass("G1-config-toml", `project_id local "${m[1]}", sem referência a produção`)
  }

  // G2 — a CLI do Supabase não pode estar vinculada a NENHUM projeto remoto.
  // Semântica da CLI 2.119.0 (apps/cli/src/config/project-ref.layer.ts e
  // command-internal/temp-paths.ts), o ref do projeto vem, nesta ordem, de:
  //   flag --project-ref (por comando; o runner não usa a CLI — ver G6) →
  //   env SUPABASE_PROJECT_ID → arquivo supabase/.temp/project-ref (VÍNCULO REAL).
  // supabase/.temp/linked-project.json é só CACHE (`linkedProjectCache`), que
  // a CLI escreve apenas ao vincular a um projeto remoto — não existe cache
  // "local". Política conservadora: QUALQUER cache presente = FAIL.
  // SUPABASE_WORKDIR redireciona a CLI para outro supabase/.temp — ambíguo = FAIL.
  // Só passa quando o desvínculo é comprovado; qualquer dúvida falha fechado.
  {
    const link = ctx.cliLink
    const problems = []
    if (!link || !link.projectRef || !link.cache) {
      problems.push("estado do vínculo da CLI não foi coletado — não dá para provar o desvínculo")
    } else {
      const ref = link.projectRef
      if (ref.state === "present") {
        problems.push(
          mentionsProduction(ref.content)
            ? "supabase/.temp/project-ref aponta para a PRODUÇÃO (vínculo real ativo)"
            : "supabase/.temp/project-ref existe (vínculo real com projeto remoto)",
        )
      } else if (ref.state !== "absent") {
        problems.push(`estado de supabase/.temp/project-ref indeterminado (${ref.state}${ref.detail ? `: ${ref.detail}` : ""})`)
      }

      const cache = link.cache
      if (cache.state === "present") {
        problems.push(
          mentionsProduction(cache.content)
            ? "cache supabase/.temp/linked-project.json aponta para a PRODUÇÃO"
            : "cache supabase/.temp/linked-project.json existe (só é escrito ao vincular a projeto remoto)",
        )
      } else if (cache.state !== "absent") {
        problems.push(`estado de supabase/.temp/linked-project.json indeterminado (${cache.state}${cache.detail ? `: ${cache.detail}` : ""})`)
      }
    }
    const linkEnv = ctx.env ?? {}
    if (String(linkEnv.SUPABASE_PROJECT_ID ?? "").trim() !== "")
      problems.push("SUPABASE_PROJECT_ID definido no ambiente (vínculo por variável)")
    if (String(linkEnv.SUPABASE_WORKDIR ?? "").trim() !== "")
      problems.push("SUPABASE_WORKDIR definido (redireciona a CLI para outro supabase/.temp)")

    if (problems.length) fail("G2-cli-link", problems.join("; "))
    else pass("G2-cli-link", "CLI desvinculada: sem project-ref, sem cache, sem SUPABASE_PROJECT_ID/SUPABASE_WORKDIR")
  }

  // G3 — variáveis proibidas no ambiente do processo
  const env = ctx.env ?? {}
  const forbiddenSet = FORBIDDEN_ENV_VARS.filter((k) => String(env[k] ?? "").trim() !== "")
  if (forbiddenSet.length) fail("G3-env-forbidden", `variáveis proibidas com valor: ${forbiddenSet.join(", ")}`)
  else pass("G3-env-forbidden", "nenhuma credencial de WhatsApp/Meta/Resend/Anthropic/ConsigGold/Supabase no ambiente")

  const nonLocal = URL_ENV_VARS.filter((k) => env[k] != null && !isLocalUrlOrHost(env[k]))
  if (nonLocal.length) fail("G3-env-urls", `variáveis de URL/host não locais: ${nonLocal.join(", ")}`)
  else pass("G3-env-urls", "nenhuma URL/host de banco não local no ambiente")

  const mentioning = Object.keys(env).filter((k) => mentionsProduction(env[k]))
  if (mentioning.length) fail("G3-env-prod-ref", `variáveis apontando para produção: ${mentioning.join(", ")}`)
  else pass("G3-env-prod-ref", "nenhuma variável de ambiente menciona produção")

  // G4 — arquivos de env carregados automaticamente pelo CLI/edge runtime
  // null = ausente (ENOENT); string = conteúdo lido; qualquer outra coisa
  // (ex.: { readError }) = existe mas não foi possível ler → FALHA fechado.
  const badFiles = []
  const unreadableEnv = []
  for (const [path, content] of Object.entries(ctx.autoloadedEnvFiles ?? {})) {
    if (content === null) continue
    if (typeof content !== "string") {
      unreadableEnv.push(`${path} (${content?.readError ?? "estado indeterminado"})`)
      continue
    }
    const vars = parseEnvFile(content)
    const forb = FORBIDDEN_ENV_VARS.filter((k) => (vars[k] ?? "") !== "")
    const urls = URL_ENV_VARS.filter((k) => vars[k] != null && !isLocalUrlOrHost(vars[k]))
    if (forb.length || urls.length || mentionsProduction(content)) badFiles.push(path)
  }
  if (unreadableEnv.length) fail("G4-env-files", `arquivos de env existentes mas ILEGÍVEIS (não dá para provar que são seguros): ${unreadableEnv.join(", ")}`)
  else if (badFiles.length) fail("G4-env-files", `arquivos de env com credencial/URL de produção: ${badFiles.join(", ")}`)
  else pass("G4-env-files", "nenhum arquivo de env autoload com credencial real")

  // G5 — ref de produção só pode aparecer nas migrations históricas permitidas
  const migs = ctx.migrations ?? {}
  if (!Object.keys(migs).length) {
    fail("G5-migrations", "nenhuma migration lida — não dá para provar o conteúdo")
  } else if (Object.values(migs).some((content) => typeof content !== "string")) {
    const unreadable = Object.entries(migs)
      .filter(([, content]) => typeof content !== "string")
      .map(([name, content]) => `${name} (${content?.readError ?? "estado indeterminado"})`)
    fail("G5-migrations", `migrations existentes mas ILEGÍVEIS (conteúdo não comprovado): ${unreadable.join(", ")}`)
  } else {
    const unexpected = Object.entries(migs)
      .filter(([name, content]) => mentionsProduction(content) && !HISTORICAL_PROD_URL_MIGRATIONS.includes(name))
      .map(([name]) => name)
    if (unexpected.length) fail("G5-migrations", `migrations NÃO históricas mencionando produção: ${unexpected.join(", ")}`)
    else pass("G5-migrations", `produção aparece só nas ${HISTORICAL_PROD_URL_MIGRATIONS.length} migrations históricas de cron (neutralizadas pela rede none)`)
  }

  // G6 — runtime novo (scripts da M0-C) sem ref de produção e com isolamento
  const runner = ctx.replayScript
  if (runner == null) {
    fail("G6-isolation", "scripts/m0c/m0c-replay-isolated.mjs ausente — isolamento de rede não preparado")
  } else {
    const problems = []
    if (!/"--network",\s*"none"/.test(runner)) problems.push('não usa `"--network", "none"`')
    if (mentionsProduction(runner)) problems.push("menciona produção")
    if (/supabase\s+(start|db\s+(reset|push)|link|migration\s+(up|repair))/i.test(runner) || /--linked\b/.test(runner))
      problems.push("contém comando do Supabase CLI proibido na M0-C")
    if (problems.length) fail("G6-isolation", `runner inseguro: ${problems.join("; ")}`)
    else pass("G6-isolation", "runner usa container com --network none e não usa Supabase CLI")
  }

  // G7 — (opcional) container real do replay isolado
  if (ctx.container) {
    const c = ctx.container
    if (!c.exists) fail("G7-container", `container "${c.name}" não encontrado`)
    else if (c.networkMode !== "none") fail("G7-container", `NetworkMode="${c.networkMode}" (exigido: none)`)
    else if ((c.networks ?? []).some((n) => n !== "none"))
      fail("G7-container", `container ligado a redes: ${(c.networks ?? []).join(", ")}`)
    else pass("G7-container", `container "${c.name}" sem rede (NetworkMode=none)`)
  }

  // Avisos (não bloqueiam o replay, que não roda frontends)
  for (const [path, content] of Object.entries(ctx.appEnvFiles ?? {})) {
    if (content != null && mentionsProduction(content))
      warn("W1-app-env", `${path} aponta para produção — NÃO rodar dev server/frontend durante a M0-C`)
  }

  return results
}

export function hasFailures(results) {
  return results.some((r) => r.status === "FAIL")
}

// ----------------------------------------------------------------- I/O -----

function readIfExists(path) {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null
  } catch {
    return null
  }
}

/**
 * Estado de um arquivo de vínculo: "absent" SÓ quando o sistema confirma que
 * não existe (ENOENT). Qualquer outra situação (diretório no lugar, erro de
 * permissão/leitura) vira "error" — e o G2 falha fechado.
 */
export function probeFile(path, fsImpl = { lstatSync, readFileSync }) {
  let st
  try {
    st = fsImpl.lstatSync(path)
  } catch (err) {
    if (err?.code === "ENOENT") return { state: "absent" }
    return { state: "error", detail: String(err?.code ?? err?.message ?? err) }
  }
  if (!st.isFile()) return { state: "error", detail: "não é um arquivo regular" }
  try {
    return { state: "present", content: fsImpl.readFileSync(path, "utf8") }
  } catch (err) {
    return { state: "error", detail: String(err?.code ?? err?.message ?? err) }
  }
}

/**
 * Leitura para os gates G4/G5 com a MESMA semântica do probeFile:
 * ENOENT → null (ausente); legível → string; qualquer outra situação
 * (EACCES, EPERM, EISDIR, I/O, não-arquivo) → { readError } — e o gate FALHA.
 */
export function readForGate(path, fsImpl) {
  const p = probeFile(path, fsImpl)
  if (p.state === "absent") return null
  if (p.state === "present") return p.content
  return { readError: p.detail ?? "erro de leitura" }
}

function inspectContainer(name) {
  const r = spawnSync("docker", ["inspect", "--format", "{{json .HostConfig.NetworkMode}}|{{json .NetworkSettings.Networks}}", name], {
    encoding: "utf8",
  })
  if (r.status !== 0) return { name, exists: false }
  const [modeJson, netsJson] = r.stdout.trim().split("|")
  let networks = []
  try {
    networks = Object.keys(JSON.parse(netsJson) ?? {})
  } catch {
    networks = ["<não foi possível ler>"]
  }
  return { name, exists: true, networkMode: JSON.parse(modeJson), networks }
}

export function collectContext(repoRoot, { containerName } = {}) {
  const migDir = join(repoRoot, "supabase", "migrations")
  const migrations = {}
  if (existsSync(migDir)) {
    for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql"))) migrations[f] = readForGate(join(migDir, f))
  }
  const autoloadedEnvFiles = {}
  for (const p of AUTOLOADED_ENV_FILES) autoloadedEnvFiles[p] = readForGate(join(repoRoot, p))
  const appEnvFiles = {}
  for (const p of ["apps/landing/.env", "apps/admin/.env", ".env.local"]) appEnvFiles[p] = readIfExists(join(repoRoot, p))

  return {
    configToml: readIfExists(join(repoRoot, "supabase", "config.toml")),
    cliLink: {
      projectRef: probeFile(join(repoRoot, "supabase", ".temp", "project-ref")),
      cache: probeFile(join(repoRoot, "supabase", ".temp", "linked-project.json")),
    },
    env: { ...process.env },
    autoloadedEnvFiles,
    appEnvFiles,
    migrations,
    replayScript: readIfExists(join(repoRoot, "scripts", "m0c", "m0c-replay-isolated.mjs")),
    container: containerName ? inspectContainer(containerName) : undefined,
  }
}

export function runGuard({ repoRoot, containerName, log = console.log } = {}) {
  let results
  try {
    results = evaluate(collectContext(repoRoot, { containerName }))
  } catch (err) {
    results = [{ id: "G0-internal", status: "FAIL", detail: `erro interno do guard: ${err?.message ?? err}` }]
  }
  for (const r of results) log(`[${r.status}] ${r.id} — ${r.detail}`)
  const ok = !hasFailures(results)
  log(ok ? "\nM0-C GUARD: OK (nenhuma falha)" : "\nM0-C GUARD: BLOQUEADO — corrija os itens FAIL antes de qualquer replay")
  return ok
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const i = process.argv.indexOf("--container")
  const containerName = i > -1 ? process.argv[i + 1] : undefined
  if (i > -1 && !containerName) {
    console.error("--container exige um nome")
    process.exit(2)
  }
  process.exit(runGuard({ repoRoot, containerName }) ? 0 : 1)
}
