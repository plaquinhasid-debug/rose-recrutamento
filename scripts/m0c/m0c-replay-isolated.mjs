#!/usr/bin/env node
// M0-B.1 — RUNNER do replay da M0-C.
//
// Barreira FAIL-CLOSED: o banco é recriado dentro de um container Postgres
// (imagem supabase/postgres) iniciado com `--network none`. Sem interface de
// rede além de loopback, NENHUM processo do banco — pg_cron, pg_net, funções —
// consegue alcançar a internet, mesmo que alguma migration histórica ainda
// contenha URL de produção. Não usa o CLI do Supabase (nem start, nem reset),
// não sobe edge runtime, não carrega nenhum segredo.
//
// Camadas:
//   1. guard estático (scripts/m0c/m0c-safety-check.mjs) ANTES de tudo;
//   2. container com --network none, verificado (docker inspect + rota + DNS)
//      ANTES de copiar/aplicar qualquer migration — se falhar, o container é
//      removido e o script aborta;
//   3. guard com --container (prova NetworkMode=none) antes do replay;
//   4. defesa em profundidade: após CADA migration, os jobs do pg_cron são
//      desativados via `cron.alter_job(jobid, active := false)` e a fila do
//      pg_net é esvaziada; depois um SELECT PROVA 0 jobs ativos e fila vazia.
//      Qualquer erro, job ativo, request pendente ou estado indeterminado
//      ABORTA o replay (nenhuma migration seguinte roda).
//
// Por que `cron.alter_job` (M0-C, investigado em container --network none com
// supabase/postgres:17.6.1.147): `cron.job` pertence a supabase_admin e
// `postgres` só tem SELECT (UPDATE direto → "permission denied for table job");
// `cron.alter_job` tem EXECUTE para postgres e altera jobs do próprio dono
// (as migrations rodam como postgres). `postgres` tem BYPASSRLS, então o
// SELECT de verificação enxerga TODOS os jobs (inclusive de outros donos —
// e um job de outro dono não pode ser desativado por postgres → erro → aborta).
// `net.http_request_queue`: PUBLIC tem DELETE. supabase_admin NÃO é necessário.
//
// Uso (SÓ na M0-C, com autorização explícita):
//   node scripts/m0c/m0c-replay-isolated.mjs --image supabase/postgres:<tag-17.x> --confirm-m0c
//
// A imagem precisa estar baixada antes (`docker pull`, feito à parte): este
// script nunca baixa nada. O container fica de pé ao final para a comparação
// de schema; destruir com `docker rm -f m0c-recrutamento-db`.

import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { runGuard } from "./m0c-safety-check.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
export const CONTAINER = "m0c-recrutamento-db"
const CONTAINER_MIG_DIR = "/tmp/m0c-migrations"
// Host usado só para PROVAR que o DNS não resolve dentro do container.
const PROBE_HOST = "supabase.com"

// --------------------------------------------------- neutralização (pura) --

// Mecanismos autorizados (menor privilégio, role postgres):
export const CRON_NEUTRALIZE_SQL = "select cron.alter_job(jobid, active := false) from cron.job where active;"
export const NET_NEUTRALIZE_SQL = "delete from net.http_request_queue;"

export const PRESENCE_SQL =
  "select (to_regclass('cron.job') is not null)::int, (to_regclass('net.http_request_queue') is not null)::int;"

export function stateSql({ hasCron, hasNet }) {
  const cols = [
    hasCron ? "(select count(*) from cron.job)" : "0",
    hasCron ? "(select count(*) from cron.job where active)" : "0",
    hasNet ? "(select count(*) from net.http_request_queue)" : "0",
    "(select rolbypassrls::int from pg_roles where rolname = current_user)",
  ]
  return `select ${cols.join(", ")};`
}

function parseRow(stdout, n) {
  const line = String(stdout ?? "").trim()
  if (!/^[0-9]+(\|[0-9]+)*$/.test(line)) return null
  const parts = line.split("|").map(Number)
  return parts.length === n && parts.every(Number.isInteger) ? parts : null
}

/**
 * Neutraliza cron/pg_net e PROVA o resultado. `query(sql)` deve devolver
 * { status, stdout, stderr } de um `psql -At -F '|'`. Nunca lança: devolve
 * { ok, ... }; ok=false sempre que algo der errado ou não puder ser provado.
 */
export function neutralizeAndVerify(query) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra })

  const p = query(PRESENCE_SQL)
  if (p?.status !== 0) return fail(`não foi possível checar cron/pg_net: ${String(p?.stderr ?? "").trim()}`)
  const presence = parseRow(p.stdout, 2)
  if (!presence) return fail(`resposta inesperada ao checar cron/pg_net: ${JSON.stringify(p.stdout)}`)
  const [hasCron, hasNet] = presence.map(Boolean)

  const before = parseRow(query(stateSql({ hasCron, hasNet }))?.stdout, 4)
  if (!before) return fail("estado do cron/pg_net indeterminado ANTES da neutralização")
  const [jobsTotal, activeBefore] = before

  if (hasCron) {
    const c = query(CRON_NEUTRALIZE_SQL)
    if (c?.status !== 0) return fail(`falha ao desativar jobs do cron: ${String(c?.stderr ?? "").trim()}`, { jobsTotal, activeBefore })
  }
  if (hasNet) {
    const n = query(NET_NEUTRALIZE_SQL)
    if (n?.status !== 0) return fail(`falha ao esvaziar net.http_request_queue: ${String(n?.stderr ?? "").trim()}`, { jobsTotal, activeBefore })
  }

  const after = parseRow(query(stateSql({ hasCron, hasNet }))?.stdout, 4)
  if (!after) return fail("estado do cron/pg_net indeterminado DEPOIS da neutralização", { jobsTotal, activeBefore })
  const [jobsAfter, activeAfter, queueAfter, bypassRls] = after
  const result = { hasCron, hasNet, jobsTotal: jobsAfter, activeBefore, activeAfter, queueAfter }
  if (hasCron && bypassRls !== 1)
    return fail("role atual sem BYPASSRLS: não dá para provar que TODOS os jobs foram vistos", result)
  if (activeAfter !== 0) return fail(`${activeAfter} job(s) do cron continuam ATIVOS`, result)
  if (queueAfter !== 0) return fail(`${queueAfter} request(s) pendentes em net.http_request_queue`, result)
  return { ok: true, ...result }
}

// ------------------------------------------------------------ helpers I/O --

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}

function die(msg, { cleanup = false } = {}) {
  console.error(`\n[M0-C] ABORTADO: ${msg}`)
  if (cleanup) {
    spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" })
    console.error(`[M0-C] container ${CONTAINER} removido.`)
  }
  process.exit(1)
}

function docker(args, opts = {}) {
  return spawnSync("docker", args, { encoding: "utf8", ...opts })
}

function execInContainer(cmd) {
  return docker(["exec", CONTAINER, "sh", "-c", cmd])
}

// `-h 127.0.0.1` = loopback DENTRO do container (não é rede externa). Durante
// o init, a imagem sobe um servidor temporário só em socket
// (listen_addresses='') enquanto roda seus init-scripts; usar TCP no loopback
// garante que só falamos com o servidor FINAL (pg_hba: 127.0.0.1/32 trust).
function psql(sqlOrFileArgs) {
  return docker(["exec", CONTAINER, "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", ...sqlOrFileArgs])
}

function psqlQuery(sql) {
  return psql(["-At", "-F", "|", "-c", sql])
}

// ------------------------------------------------------------------ main --

function main() {
  if (!process.argv.includes("--confirm-m0c")) {
    die("falta --confirm-m0c. Este runner só pode rodar na M0-C, com autorização explícita.")
  }
  const image = arg("--image")
  if (!image || !/^supabase\/postgres:17\./.test(image)) {
    die('--image obrigatório no formato "supabase/postgres:17.x..." (mesma major de produção, 17).')
  }

  console.log("[M0-C] 1/7 guard estático")
  if (!runGuard({ repoRoot })) die("guard estático falhou.")

  console.log("[M0-C] 2/7 pré-condições do Docker")
  if (docker(["version", "--format", "{{.Server.Version}}"]).status !== 0) die("Docker daemon indisponível.")
  if (docker(["container", "inspect", CONTAINER]).status === 0)
    die(`já existe um container "${CONTAINER}". Remova-o manualmente antes (docker rm -f ${CONTAINER}).`)
  if (docker(["image", "inspect", image]).status !== 0)
    die(`imagem ${image} não está baixada. Faça "docker pull ${image}" à parte; este script nunca baixa nada.`)

  console.log("[M0-C] 3/7 criando container SEM REDE (--network none)")
  const pgPassword = randomBytes(24).toString("hex") // descartável, nunca impresso
  const run = docker([
    "run", "-d",
    "--name", CONTAINER,
    "--label", "m0c=recrutamento",
    "--network", "none",
    "-e", `POSTGRES_PASSWORD=${pgPassword}`,
    image,
  ])
  if (run.status !== 0) die(`docker run falhou: ${run.stderr.trim()}`)

  console.log("[M0-C] 4/7 provando isolamento ANTES de qualquer migration")
  const mode = docker(["inspect", "--format", "{{.HostConfig.NetworkMode}}", CONTAINER]).stdout.trim()
  if (mode !== "none") die(`NetworkMode="${mode}" (exigido: none).`, { cleanup: true })
  // Sem rota default: /proc/net/route não pode ter linha com destino 00000000.
  const route = execInContainer("cat /proc/net/route")
  if (route.status !== 0 || /\n\S+\s+00000000\s/.test(route.stdout))
    die("existe rota default dentro do container.", { cleanup: true })
  // Só loopback como interface.
  const ifaces = execInContainer("ls /sys/class/net")
  if (ifaces.status !== 0 || ifaces.stdout.trim().split(/\s+/).some((i) => i !== "lo"))
    die(`interfaces de rede inesperadas: ${ifaces.stdout.trim()}`, { cleanup: true })
  // DNS externo NÃO pode resolver.
  if (execInContainer(`getent hosts ${PROBE_HOST}`).status === 0)
    die("DNS externo resolveu dentro do container.", { cleanup: true })
  console.log("[M0-C]     isolamento comprovado: NetworkMode=none, só 'lo', sem rota default, DNS externo falha")

  if (!runGuard({ repoRoot, containerName: CONTAINER })) die("guard com --container falhou.", { cleanup: true })

  console.log("[M0-C] 5/7 aguardando Postgres")
  let ready = false
  for (let i = 0; i < 120 && !ready; i++) {
    ready = docker(["exec", CONTAINER, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000) // espera 1s
  }
  if (!ready) die("Postgres não ficou pronto em ~120s.", { cleanup: true })

  console.log("[M0-C] 6/7 replay das migrations (ordem lexicográfica, ON_ERROR_STOP)")
  const migDir = join(repoRoot, "supabase", "migrations")
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
  if (docker(["cp", migDir, `${CONTAINER}:${CONTAINER_MIG_DIR}`]).status !== 0) die("docker cp falhou.", { cleanup: true })

  let applied = 0
  for (const [i, f] of files.entries()) {
    const r = psql(["-f", `${CONTAINER_MIG_DIR}/${f}`])
    if (r.status !== 0) {
      // Mesmo com a migration falhando, tenta neutralizar antes de parar.
      const n = neutralizeAndVerify(psqlQuery)
      console.error(`[M0-C] FALHOU em #${i + 1} ${f} (${applied} aplicadas antes):\n${r.stderr.trim()}`)
      console.error(`[M0-C] neutralização pós-falha: ${n.ok ? "OK" : `FALHOU — ${n.reason}`}`)
      die(`migration #${i + 1} falhou; replay interrompido. Container mantido SEM REDE. Destruir: docker rm -f ${CONTAINER}`)
    }
    const n = neutralizeAndVerify(psqlQuery)
    if (!n.ok) die(`neutralização falhou após #${i + 1} ${f}: ${n.reason} ${JSON.stringify(n)}`)
    applied++
    console.log(
      `[M0-C]     #${String(i + 1).padStart(2, "0")} APPLIED ${f} | cron: jobs=${n.jobsTotal} ativos_antes=${n.activeBefore} ativos_depois=${n.activeAfter}` +
        ` | pg_net fila=${n.queueAfter} | neutralização PASS`,
    )
  }

  console.log("[M0-C] 7/7 estado final dos jobs (devem estar todos inativos)")
  console.log(psql(["-c", "select jobname, schedule, active, username from cron.job order by jobname"]).stdout)
  console.log(`[M0-C] replay concluído: ${applied}/${files.length} migrations. Container ${CONTAINER} segue SEM REDE.`)
  console.log(`[M0-C] Próximo: comparação de schema (docs/m0/M0-C-procedimento-fail-closed.md). Destruir: docker rm -f ${CONTAINER}`)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
