import test from "node:test"
import assert from "node:assert/strict"

import { createInvalidateIndicacaoHandler } from "../supabase/functions/invalidate-indicacao/handler.ts"
import { checkInvalidation, validateInvalidatePayload } from "../supabase/functions/invalidate-indicacao/logic.ts"
import { invalidarIndicacao } from "../apps/admin/src/hooks/useInvalidarIndicacao.ts"
import { INVALIDAR_UNEXPECTED_ERROR, invalidarErrorMessage, podeInvalidar } from "../apps/admin/src/lib/invalidarIndicacao.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS — E3.5. Invalidar indicação (teste, fraude).
// Tudo com mocks — NENHUMA conexão real.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"
const INDICACAO_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const MOTIVO = "Indicação de teste do sistema."

const ATRIBUIDA = { id: INDICACAO_ID, status: "atribuida", recompensa_status: null }

async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const updates = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: realisticAuthorize,
    getIndicacao: async () => ATRIBUIDA,
    invalidate: async (input) => { updates.push(input); return true },
    logEvent: (fields) => logs.push(fields),
    ...overrides,
  }
  return { deps, logs, updates }
}

function makeRequest({ method = "POST", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida", body = { indicacao_id: INDICACAO_ID, motivo: MOTIVO } } = {}) {
  const headers = new Headers({ "content-type": "application/json" })
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/invalidate-indicacao", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  })
}

async function call(overrides, request) {
  const ctx = makeDeps(overrides)
  const res = await createInvalidateIndicacaoHandler(ctx.deps)(request ?? makeRequest())
  return { res, ...ctx }
}

test("HTTP: GET -> 405", async () => {
  const { res } = await call({}, makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("AUTH: sem login -> 401 e nada muda", async () => {
  const { res, updates } = await call({}, makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.equal(updates.length, 0)
})

test("AUTH: não-equipe (ex.: Embaixadora) -> 403 e nada muda", async () => {
  const { res, updates } = await call({}, makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.equal(updates.length, 0)
})

test("SUCESSO: 200, grava motivo aparado e o uid da conta", async () => {
  const { res, updates, logs } = await call({}, makeRequest({ body: { indicacao_id: INDICACAO_ID, motivo: `  ${MOTIVO}  ` } }))
  assert.equal(res.status, 200)
  assert.deepEqual(updates, [{ indicacaoId: INDICACAO_ID, motivo: MOTIVO, actorUid: EQUIPE_UID }])
  assert.equal(logs.at(-1).event, "invalidate_indicacao")
})

test("LOG: motivo nunca vai para o log", async () => {
  const { logs } = await call()
  assert.doesNotMatch(JSON.stringify(logs), /teste do sistema/)
})

test("PERMITIDO: recompensa cancelada não impede invalidar", async () => {
  const { res } = await call({ getIndicacao: async () => ({ ...ATRIBUIDA, recompensa_status: "cancelada" }) })
  assert.equal(res.status, 200)
})

for (const [nome, indicacao, codigo] of [
  ["já invalidada", { ...ATRIBUIDA, status: "invalidada" }, "ja_invalidada"],
  ["recompensa a pagar", { ...ATRIBUIDA, recompensa_status: "disponivel" }, "recompensa_a_pagar"],
  ["recompensa paga", { ...ATRIBUIDA, recompensa_status: "pago" }, "recompensa_paga"],
]) {
  test(`BLOQUEIO: ${nome} -> 409 ${codigo} e nada muda`, async () => {
    const { res, updates } = await call({ getIndicacao: async () => indicacao })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { error: codigo })
    assert.equal(updates.length, 0)
  })
}

test("CORRIDA: UPDATE não mudou nada -> 409 status_mudou", async () => {
  const { res } = await call({ invalidate: async () => false })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: "status_mudou" })
})

test("INEXISTENTE: -> 404", async () => {
  const { res } = await call({ getIndicacao: async () => null })
  assert.equal(res.status, 404)
})

test("ERRO: falha no UPDATE -> 500", async () => {
  const { res } = await call({ invalidate: async () => { throw new Error("boom") } })
  assert.equal(res.status, 500)
})

for (const [body, reason] of [
  [null, "payload_invalido"],
  [{ motivo: MOTIVO }, "indicacao_id_invalido"],
  [{ indicacao_id: "x", motivo: MOTIVO }, "indicacao_id_invalido"],
  [{ indicacao_id: INDICACAO_ID }, "motivo_obrigatorio"],
  [{ indicacao_id: INDICACAO_ID, motivo: "  ab " }, "motivo_obrigatorio"],
  [{ indicacao_id: INDICACAO_ID, motivo: "x".repeat(301) }, "motivo_muito_longo"],
]) {
  test(`VALIDAÇÃO: ${JSON.stringify(body)?.slice(0, 60)} -> ${reason}`, () => {
    const result = validateInvalidatePayload(body)
    assert.equal(result.valid, false)
    assert.equal(result.reason, reason)
  })
}

test("REGRA: atribuída sem recompensa -> pode", () => {
  assert.deepEqual(checkInvalidation(ATRIBUIDA), { eligible: true })
})

test("ADMIN: envia POST só com indicacao_id e motivo", async () => {
  const calls = []
  const invoke = async (name, options) => { calls.push({ name, options }); return { data: { ok: true }, error: null } }
  await invalidarIndicacao({ indicacaoId: INDICACAO_ID, motivo: MOTIVO }, invoke)
  assert.equal(calls[0].name, "invalidate-indicacao")
  assert.equal(calls[0].options.method, "POST")
  assert.deepEqual(calls[0].options.body, { indicacao_id: INDICACAO_ID, motivo: MOTIVO })
})

test("ADMIN: erro vira mensagem amigável", async () => {
  const invoke = async () => ({ data: null, error: new Error("x") })
  await assert.rejects(() => invalidarIndicacao({ indicacaoId: INDICACAO_ID, motivo: MOTIVO }, invoke), (err) => err.message === INVALIDAR_UNEXPECTED_ERROR)
  assert.match(invalidarErrorMessage("recompensa_a_pagar"), /Cancele a recompensa primeiro/)
})

const BASE = {
  id: INDICACAO_ID, status: "atribuida", indicada_em: "2026-09-18T00:00:00Z", codigo_referral_usado: "X",
  invalidada_em: null, embaixadora: null, candidata: null, recompensa: null,
}

test("BOTÃO: aparece para atribuída sem recompensa ou com recompensa cancelada", () => {
  assert.equal(podeInvalidar(BASE), true)
  assert.equal(podeInvalidar({ ...BASE, recompensa: { status: "cancelada", valor_centavos: 4000 } }), true)
})

test("BOTÃO: some para invalidada, a pagar ou paga", () => {
  assert.equal(podeInvalidar({ ...BASE, status: "invalidada" }), false)
  assert.equal(podeInvalidar({ ...BASE, recompensa: { status: "disponivel", valor_centavos: 4000 } }), false)
  assert.equal(podeInvalidar({ ...BASE, recompensa: { status: "pago", valor_centavos: 4000 } }), false)
})
