// M0-B.1 — testes OFFLINE do guard da M0-C. Só exercitam a função pura
// `evaluate()` com contextos em memória: nenhuma leitura de rede, nenhum
// Docker, nenhum Supabase.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  evaluate,
  hasFailures,
  isLocalUrlOrHost,
  parseEnvFile,
  PROD_REF,
  EXPECTED_LOCAL_PROJECT_ID,
  HISTORICAL_PROD_URL_MIGRATIONS,
  probeFile,
  readForGate,
  collectContext,
} from "../scripts/m0c/m0c-safety-check.mjs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"

const SAFE_RUNNER = 'docker(["run", "-d", "--network", "none", image])'

function safeCtx(overrides = {}) {
  return {
    configToml: `project_id = "${EXPECTED_LOCAL_PROJECT_ID}"\n[api]\nport = 54321\n`,
    cliLink: { projectRef: { state: "absent" }, cache: { state: "absent" } },
    env: { PATH: "/usr/bin" },
    autoloadedEnvFiles: { "supabase/.env": null, "supabase/functions/.env": null },
    appEnvFiles: {},
    migrations: {
      "20260729144506_initial_schema.sql": "create table public.settings ();",
      [HISTORICAL_PROD_URL_MIGRATIONS[0]]: `select net.http_post(url := 'https://${PROD_REF}.supabase.co/functions/v1/x')`,
    },
    replayScript: SAFE_RUNNER,
    ...overrides,
  }
}

const statusOf = (results, id) => results.find((r) => r.id === id)?.status

test("contexto seguro passa sem falhas", () => {
  const r = evaluate(safeCtx())
  assert.equal(hasFailures(r), false, JSON.stringify(r, null, 2))
})

// ---- G2: vínculo da CLI (M0-C retomada) --------------------------------------
const present = (content) => ({ state: "present", content })
const link = (projectRef, cache) => ({ cliLink: { projectRef, cache } })
const ABSENT = { state: "absent" }

test("G2 caso 1: project-ref ausente + cache ausente → PASS", () => {
  assert.equal(statusOf(evaluate(safeCtx(link(ABSENT, ABSENT))), "G2-cli-link"), "PASS")
})

test("G2 caso 2: project-ref = produção, cache ausente → FAIL (lacuna do guard antigo)", () => {
  const r = evaluate(safeCtx(link(present(PROD_REF), ABSENT)))
  assert.equal(statusOf(r, "G2-cli-link"), "FAIL")
  assert.match(r.find((x) => x.id === "G2-cli-link").detail, /project-ref aponta para a PRODUÇÃO/)
})

test("G2 caso 3: project-ref ausente, cache = produção → FAIL", () => {
  const cache = present(JSON.stringify({ ref: PROD_REF, name: "x" }))
  assert.equal(statusOf(evaluate(safeCtx(link(ABSENT, cache))), "G2-cli-link"), "FAIL")
})

test("G2 caso 4: project-ref = OUTRO projeto remoto → FAIL (nenhum vínculo remoto é aceito)", () => {
  assert.equal(statusOf(evaluate(safeCtx(link(present("abcdefghijklmnopqrst"), ABSENT))), "G2-cli-link"), "FAIL")
})

test("G2 caso 4b: project-ref vazio/em branco ainda conta como presente → FAIL", () => {
  assert.equal(statusOf(evaluate(safeCtx(link(present("  \n"), ABSENT))), "G2-cli-link"), "FAIL")
})

test("G2 caso 5: estado ambíguo/corrompido → FAIL CLOSED", () => {
  const err = { state: "error", detail: "EACCES" }
  const notFile = { state: "error", detail: "não é um arquivo regular" }
  assert.equal(statusOf(evaluate(safeCtx(link(err, ABSENT))), "G2-cli-link"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx(link(notFile, ABSENT))), "G2-cli-link"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx(link(ABSENT, err))), "G2-cli-link"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx(link(ABSENT, present("{corrompido")))), "G2-cli-link"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ cliLink: undefined })), "G2-cli-link"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ cliLink: { projectRef: ABSENT } })), "G2-cli-link"), "FAIL")
})

test("G2 caso 6: project-ref ausente + cache NÃO-produção → FAIL (documentado: não existe cache 'local' na CLI 2.119)", () => {
  const cache = present(JSON.stringify({ ref: "abcdefghijklmnopqrst", name: "outro" }))
  const r = evaluate(safeCtx(link(ABSENT, cache)))
  assert.equal(statusOf(r, "G2-cli-link"), "FAIL")
  assert.match(r.find((x) => x.id === "G2-cli-link").detail, /só é escrito ao vincular a projeto remoto/)
})

test("G2 caso 7: SUPABASE_PROJECT_ID no ambiente → FAIL (vínculo por variável)", () => {
  assert.equal(statusOf(evaluate(safeCtx({ env: { SUPABASE_PROJECT_ID: "abcdefghijklmnopqrst" } })), "G2-cli-link"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ env: { SUPABASE_PROJECT_ID: "" } })), "G2-cli-link"), "PASS")
})

test("G2 caso 8: SUPABASE_WORKDIR no ambiente → FAIL (redireciona .temp)", () => {
  assert.equal(statusOf(evaluate(safeCtx({ env: { SUPABASE_WORKDIR: "C:/outro" } })), "G2-cli-link"), "FAIL")
})

test("G2 é mais rígido que o antigo: todo cenário que o antigo bloqueava continua bloqueado", () => {
  // O guard antigo só falhava com cache apontando para produção (caso 3).
  // O antigo PASSAVA nos casos 2, 4, 5 e 7; agora todos falham.
  for (const ctx of [
    link(ABSENT, present(JSON.stringify({ ref: PROD_REF }))),
    link(present(PROD_REF), ABSENT),
    link(present("abcdefghijklmnopqrst"), ABSENT),
    link({ state: "error", detail: "EIO" }, ABSENT),
  ]) {
    assert.equal(statusOf(evaluate(safeCtx(ctx)), "G2-cli-link"), "FAIL")
  }
})

test("probeFile: ausente → absent; arquivo → present; diretório → error (fail closed)", () => {
  const here = fileURLToPath(import.meta.url)
  assert.deepEqual(probeFile(join(dirname(here), "nao-existe-m0c-xyz")), { state: "absent" })
  assert.equal(probeFile(here).state, "present")
  assert.equal(probeFile(dirname(here)).state, "error")
})

test("falha sem config.toml ou com project_id diferente do local", () => {
  assert.equal(statusOf(evaluate(safeCtx({ configToml: null })), "G1-config-toml"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ configToml: 'project_id = "outro"' })), "G1-config-toml"), "FAIL")
  assert.equal(
    statusOf(evaluate(safeCtx({ configToml: `project_id = "${EXPECTED_LOCAL_PROJECT_ID}"\n# ${PROD_REF}` })), "G1-config-toml"),
    "FAIL",
  )
})

for (const name of [
  "WHATSAPP_CLOUD_API_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "RESEND_API_KEY",
  "META_CONVERSIONS_API_TOKEN",
  "META_APP_SECRET",
  "ANTHROPIC_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "CONSIGGOLD_SUPABASE_ANON_KEY",
]) {
  test(`falha se ${name} estiver com valor no ambiente`, () => {
    const r = evaluate(safeCtx({ env: { [name]: "valor-falso-de-teste" } }))
    assert.equal(statusOf(r, "G3-env-forbidden"), "FAIL")
  })
}

test("variável vazia não conta como credencial", () => {
  const r = evaluate(safeCtx({ env: { WHATSAPP_CLOUD_API_TOKEN: "  " } }))
  assert.equal(statusOf(r, "G3-env-forbidden"), "PASS")
})

test("falha se SUPABASE_URL/DATABASE_URL não for local", () => {
  assert.equal(statusOf(evaluate(safeCtx({ env: { SUPABASE_URL: "https://exemplo.supabase.co" } })), "G3-env-urls"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ env: { DATABASE_URL: "postgres://u@db.remoto.com:5432/x" } })), "G3-env-urls"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ env: { SUPABASE_URL: "http://127.0.0.1:54321" } })), "G3-env-urls"), "PASS")
})

test("falha se qualquer variável mencionar a produção", () => {
  const r = evaluate(safeCtx({ env: { QUALQUER: `https://${PROD_REF}.supabase.co` } }))
  assert.equal(statusOf(r, "G3-env-prod-ref"), "FAIL")
})

test("falha se um arquivo de env autoload tiver credencial ou URL de produção", () => {
  const r1 = evaluate(safeCtx({ autoloadedEnvFiles: { "supabase/functions/.env": "RESEND_API_KEY=abc\n" } }))
  assert.equal(statusOf(r1, "G4-env-files"), "FAIL")
  const r2 = evaluate(safeCtx({ autoloadedEnvFiles: { "supabase/.env": `SUPABASE_URL=https://${PROD_REF}.supabase.co\n` } }))
  assert.equal(statusOf(r2, "G4-env-files"), "FAIL")
  const r3 = evaluate(safeCtx({ autoloadedEnvFiles: { "supabase/.env": "# só comentário\nWHATSAPP_CLOUD_API_TOKEN=\n" } }))
  assert.equal(statusOf(r3, "G4-env-files"), "PASS")
})

test("falha se uma migration NÃO histórica mencionar a produção", () => {
  const ctx = safeCtx()
  ctx.migrations["20261003999999_nova.sql"] = `select '${PROD_REF}'`
  assert.equal(statusOf(evaluate(ctx), "G5-migrations"), "FAIL")
})

test("falha se não houver migrations para provar o conteúdo", () => {
  assert.equal(statusOf(evaluate(safeCtx({ migrations: {} })), "G5-migrations"), "FAIL")
})

test("falha se o runner não isolar a rede ou usar o Supabase CLI", () => {
  assert.equal(statusOf(evaluate(safeCtx({ replayScript: null })), "G6-isolation"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ replayScript: 'docker(["run", "-d", image])' })), "G6-isolation"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ replayScript: SAFE_RUNNER + "\n// npx supabase start" })), "G6-isolation"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ replayScript: SAFE_RUNNER + " --linked" })), "G6-isolation"), "FAIL")
})

test("container: exige existir, NetworkMode=none e nenhuma rede", () => {
  const base = { name: "c", exists: true, networkMode: "none", networks: ["none"] }
  assert.equal(statusOf(evaluate(safeCtx({ container: base })), "G7-container"), "PASS")
  assert.equal(statusOf(evaluate(safeCtx({ container: { ...base, exists: false } })), "G7-container"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ container: { ...base, networkMode: "bridge" } })), "G7-container"), "FAIL")
  assert.equal(statusOf(evaluate(safeCtx({ container: { ...base, networks: ["bridge"] } })), "G7-container"), "FAIL")
})

test("env de app apontando para produção só gera aviso", () => {
  const r = evaluate(safeCtx({ appEnvFiles: { "apps/admin/.env": `VITE_SUPABASE_URL=https://${PROD_REF}.supabase.co` } }))
  assert.equal(statusOf(r, "W1-app-env"), "WARN")
  assert.equal(hasFailures(r), false)
})

test("isLocalUrlOrHost: só localhost/loopback é local; lixo não é", () => {
  assert.equal(isLocalUrlOrHost("http://localhost:54321"), true)
  assert.equal(isLocalUrlOrHost("127.0.0.1"), true)
  assert.equal(isLocalUrlOrHost("https://x.supabase.co"), false)
  assert.equal(isLocalUrlOrHost("http://"), false)
})

test("parseEnvFile ignora comentários e aspas", () => {
  assert.deepEqual(parseEnvFile('# c\nA=1\nexport B="2"\n\nC=\n'), { A: "1", B: "2", C: "" })
})

// ---- M0-D: fail-closed em G4/G5 quando o arquivo existe mas a leitura falha --
// Falhas provocadas de forma DETERMINÍSTICA: fs simulado que lança o erro na
// leitura (não depende de permissões do SO/usuário) e diretórios reais no lugar
// de arquivos num repo temporário (nunca "legível como arquivo").

const errWith = (code) => Object.assign(new Error(code), { code })
const fakeFs = ({ lstat, read }) => ({
  lstatSync: () => {
    if (lstat) throw errWith(lstat)
    return { isFile: () => true }
  },
  readFileSync: () => {
    if (read) throw errWith(read)
    return "CONTEUDO=ok\n"
  },
})

test("M0-D 1: arquivo inexistente (ENOENT) → readForGate devolve null (ausente)", () => {
  assert.equal(readForGate("/x", fakeFs({ lstat: "ENOENT" })), null)
  const here = fileURLToPath(import.meta.url)
  assert.equal(readForGate(join(dirname(here), "nao-existe-m0d-xyz")), null)
})

test("M0-D 2: arquivo existente e legível → readForGate devolve o conteúdo", () => {
  assert.equal(readForGate("/x", fakeFs({})), "CONTEUDO=ok\n")
  assert.equal(typeof readForGate(fileURLToPath(import.meta.url)), "string")
})

for (const code of ["EACCES", "EPERM", "EIO"]) {
  test(`M0-D 3: arquivo existe mas a LEITURA falha (${code}) → { readError }, nunca null`, () => {
    assert.deepEqual(readForGate("/x", fakeFs({ read: code })), { readError: code })
  })
  test(`M0-D 3b: stat falha com ${code} (não ENOENT) → { readError }, nunca null`, () => {
    assert.deepEqual(readForGate("/x", fakeFs({ lstat: code })), { readError: code })
  })
}

test("M0-D 3c: caminho existe mas é diretório (EISDIR-like) → { readError }", () => {
  const r = readForGate(dirname(fileURLToPath(import.meta.url)))
  assert.ok(r && typeof r === "object" && r.readError, JSON.stringify(r))
})

test("M0-D 4: G4 FALHA quando um .env autoload existe mas não pode ser lido", () => {
  for (const content of [{ readError: "EACCES" }, { readError: "EIO" }, undefined]) {
    const r = evaluate(safeCtx({ autoloadedEnvFiles: { "supabase/functions/.env": content } }))
    assert.equal(statusOf(r, "G4-env-files"), "FAIL", JSON.stringify(content))
  }
  // ausente de verdade continua permitido
  assert.equal(statusOf(evaluate(safeCtx({ autoloadedEnvFiles: { "supabase/.env": null } })), "G4-env-files"), "PASS")
})

test("M0-D 5: G5 FALHA quando uma migration existe mas não pode ser lida", () => {
  for (const content of [{ readError: "EACCES" }, null, undefined]) {
    const ctx = safeCtx()
    ctx.migrations["20261003999999_qualquer.sql"] = content
    assert.equal(statusOf(evaluate(ctx), "G5-migrations"), "FAIL", JSON.stringify(content))
  }
})

test("M0-D 6 (fim a fim, repo temporário): .env-diretório e migration-diretório → G4 e G5 FALHAM", () => {
  const root = mkdtempSync(join(tmpdir(), "m0d-guard-"))
  try {
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true })
    writeFileSync(join(root, "supabase", "migrations", "20260101000000_ok.sql"), "select 1;\n")
    // estado legítimo primeiro: G4/G5 passam
    let r = evaluate(collectContext(root))
    assert.equal(statusOf(r, "G4-env-files"), "PASS")
    assert.equal(statusOf(r, "G5-migrations"), "PASS")
    // .env existente mas impossível de ler como arquivo
    mkdirSync(join(root, "supabase", "functions", ".env"), { recursive: true })
    // migration existente mas impossível de ler como arquivo
    mkdirSync(join(root, "supabase", "migrations", "20260101000001_ilegivel.sql"))
    r = evaluate(collectContext(root))
    assert.equal(statusOf(r, "G4-env-files"), "FAIL")
    assert.match(r.find((x) => x.id === "G4-env-files").detail, /ILEGÍVEIS/)
    assert.equal(statusOf(r, "G5-migrations"), "FAIL")
    assert.match(r.find((x) => x.id === "G5-migrations").detail, /20260101000001_ilegivel\.sql/)
    assert.equal(hasFailures(r), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
