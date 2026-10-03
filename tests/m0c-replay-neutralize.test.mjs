// M0-C — testes OFFLINE da neutralização pós-migration do runner. Usam um
// executor `psql` SIMULADO (nenhum Docker, nenhum banco, nenhuma rede).
// Importar o runner não executa nada: o main só roda quando chamado direto.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  neutralizeAndVerify,
  CRON_NEUTRALIZE_SQL,
  NET_NEUTRALIZE_SQL,
  PRESENCE_SQL,
} from "../scripts/m0c/m0c-replay-isolated.mjs"

const RUNNER_SRC = readFileSync(new URL("../scripts/m0c/m0c-replay-isolated.mjs", import.meta.url), "utf8")

/**
 * Banco simulado: `jobs` = lista de {active}, `queue` = nº de requests.
 * Opções permitem injetar falhas em cada comando.
 */
function fakeDb({ hasCron = true, hasNet = true, jobs = [], queue = 0, bypass = 1, failCron, failNet, cronNoop, netNoop, garbageState } = {}) {
  const calls = []
  const query = (sql) => {
    calls.push(sql)
    if (sql === PRESENCE_SQL) return { status: 0, stdout: `${+hasCron}|${+hasNet}\n`, stderr: "" }
    if (sql === CRON_NEUTRALIZE_SQL) {
      if (failCron) return { status: 1, stdout: "", stderr: "ERROR: permission denied for table job" }
      if (!cronNoop) jobs = jobs.map((j) => ({ ...j, active: false }))
      return { status: 0, stdout: "", stderr: "" }
    }
    if (sql === NET_NEUTRALIZE_SQL) {
      if (failNet) return { status: 1, stdout: "", stderr: "ERROR: permission denied for table http_request_queue" }
      if (!netNoop) queue = 0
      return { status: 0, stdout: "", stderr: "" }
    }
    if (sql.startsWith("select ") && sql.includes("rolbypassrls")) {
      if (garbageState) return { status: 0, stdout: "ERRO-INESPERADO\n", stderr: "" }
      const active = jobs.filter((j) => j.active).length
      return { status: 0, stdout: `${hasCron ? jobs.length : 0}|${hasCron ? active : 0}|${hasNet ? queue : 0}|${bypass}\n`, stderr: "" }
    }
    return { status: 1, stdout: "", stderr: `SQL não esperado: ${sql}` }
  }
  return { query, calls }
}

test("1. falha ao neutralizar o cron → ok=false (replay aborta)", () => {
  const { query } = fakeDb({ jobs: [{ active: true }], failCron: true })
  const r = neutralizeAndVerify(query)
  assert.equal(r.ok, false)
  assert.match(r.reason, /falha ao desativar jobs do cron/)
})

test("2. falha ao limpar pg_net → ok=false (replay aborta)", () => {
  const { query } = fakeDb({ queue: 3, failNet: true })
  const r = neutralizeAndVerify(query)
  assert.equal(r.ok, false)
  assert.match(r.reason, /falha ao esvaziar net\.http_request_queue/)
})

test("3. neutralização bem-sucedida → ok=true (próxima migration pode rodar)", () => {
  const { query } = fakeDb({ jobs: [{ active: true }, { active: false }], queue: 2 })
  const r = neutralizeAndVerify(query)
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(
    { jobs: r.jobsTotal, before: r.activeBefore, after: r.activeAfter, queue: r.queueAfter },
    { jobs: 2, before: 1, after: 0, queue: 0 },
  )
})

test("3b. antes das extensões existirem (sem cron/pg_net) → ok=true sem tocar em nada", () => {
  const { query, calls } = fakeDb({ hasCron: false, hasNet: false })
  assert.equal(neutralizeAndVerify(query).ok, true)
  assert.ok(!calls.includes(CRON_NEUTRALIZE_SQL) && !calls.includes(NET_NEUTRALIZE_SQL))
})

test("4. mecanismo do cron é cron.alter_job (nunca UPDATE direto em cron.job)", () => {
  assert.match(CRON_NEUTRALIZE_SQL, /cron\.alter_job\(jobid, active := false\)/)
  assert.doesNotMatch(CRON_NEUTRALIZE_SQL, /update\s+cron\.job/i)
  assert.doesNotMatch(RUNNER_SRC.replace(/\/\/[^\n]*/g, ""), /update\s+cron\.job/i)
})

test("5. mecanismo do pg_net é DELETE em net.http_request_queue", () => {
  assert.equal(NET_NEUTRALIZE_SQL, "delete from net.http_request_queue;")
})

test("verificação: comando 'ok' mas job continua ativo → ok=false", () => {
  const { query } = fakeDb({ jobs: [{ active: true }], cronNoop: true })
  const r = neutralizeAndVerify(query)
  assert.equal(r.ok, false)
  assert.match(r.reason, /continuam ATIVOS/)
})

test("verificação: comando 'ok' mas fila continua com requests → ok=false", () => {
  const { query } = fakeDb({ queue: 1, netNoop: true })
  const r = neutralizeAndVerify(query)
  assert.equal(r.ok, false)
  assert.match(r.reason, /pendentes em net\.http_request_queue/)
})

test("verificação: estado indeterminado (resposta inesperada) → ok=false", () => {
  const { query } = fakeDb({ garbageState: true })
  assert.equal(neutralizeAndVerify(query).ok, false)
})

test("verificação: sem BYPASSRLS não dá para provar que todos os jobs foram vistos → ok=false", () => {
  const { query } = fakeDb({ jobs: [{ active: true }], bypass: 0 })
  const r = neutralizeAndVerify(query)
  assert.equal(r.ok, false)
  assert.match(r.reason, /BYPASSRLS/)
})

test("verificação: falha ao checar presença de cron/pg_net → ok=false", () => {
  const r = neutralizeAndVerify(() => ({ status: 1, stdout: "", stderr: "conexão recusada" }))
  assert.equal(r.ok, false)
})

test("6. runner continua criando o container com --network none", () => {
  assert.match(RUNNER_SRC, /"--network", "none"/)
  assert.doesNotMatch(RUNNER_SRC, /"--network", "(bridge|host)"/)
})

test("7. isolamento é provado ANTES da primeira migration e do docker cp", () => {
  const idx = (s) => {
    const i = RUNNER_SRC.indexOf(s)
    assert.ok(i > -1, `trecho não encontrado: ${s}`)
    return i
  }
  const firstMigration = idx("for (const [i, f] of files.entries())")
  for (const proof of ['"{{.HostConfig.NetworkMode}}"', "cat /proc/net/route", "ls /sys/class/net", "getent hosts", "containerName: CONTAINER"]) {
    assert.ok(idx(proof) < firstMigration, `${proof} deveria vir antes do replay`)
    assert.ok(idx(proof) < idx('"cp", migDir'), `${proof} deveria vir antes do docker cp`)
  }
})

test("8. sem bypass: falha de migration ou de neutralização sempre encerra o processo", () => {
  const loop = RUNNER_SRC.slice(RUNNER_SRC.indexOf("for (const [i, f] of files.entries())"), RUNNER_SRC.indexOf("7/7"))
  assert.doesNotMatch(loop, /\bcontinue\b/)
  assert.doesNotMatch(loop, /\|\|\s*true/)
  assert.match(loop, /if \(r\.status !== 0\) \{[\s\S]*?die\(/)
  assert.match(loop, /if \(!n\.ok\) die\(/)
  assert.match(RUNNER_SRC, /"-v", "ON_ERROR_STOP=1"/)
  assert.match(RUNNER_SRC, /"-h", "127\.0\.0\.1"/)
})
