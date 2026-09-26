import test from "node:test"
import assert from "node:assert/strict"

import { createUpdateRecompensaStatusHandler } from "../supabase/functions/update-recompensa-status/handler.ts"
import { checkTransition, validateAcaoPayload } from "../supabase/functions/update-recompensa-status/logic.ts"
import { updateRecompensaStatus } from "../apps/admin/src/hooks/useUpdateRecompensaStatus.ts"
import {
  motivoValido, podeAlterarRecompensa, recompensaAcaoErrorMessage, RECOMPENSA_UNEXPECTED_ERROR,
} from "../apps/admin/src/lib/recompensaAcao.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS — E3.3. Marcar a recompensa de R$40 como paga
// (Pix feito) ou cancelada. Tudo com mocks — NENHUMA conexão real.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"
const INDICACAO_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const NOW = new Date("2026-09-26T18:00:00Z") // 26/09 15h Brasília

const DISPONIVEL = { id: "rec-1", status: "disponivel", disponivel_em: "2026-09-20T15:00:00Z" }

async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const applied = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: realisticAuthorize,
    getRecompensa: async () => DISPONIVEL,
    applyAcao: async (recompensaId, acao, actorUid) => {
      applied.push({ recompensaId, acao, actorUid })
      return {
        id: recompensaId,
        status: acao.acao === "pagar" ? "pago" : "cancelada",
        valor_centavos: 4000,
        pago_em: acao.acao === "pagar" ? acao.pagoEm : null,
        cancelada_em: acao.acao === "cancelar" ? "2026-09-26T18:00:00Z" : null,
      }
    },
    logEvent: (fields) => logs.push(fields),
    now: () => NOW,
    ...overrides,
  }
  return { deps, logs, applied }
}

const PAGAR = { indicacao_id: INDICACAO_ID, acao: "pagar", data_pagamento: "2026-09-25" }
const CANCELAR = { indicacao_id: INDICACAO_ID, acao: "cancelar", motivo: "Confirmado por engano, era teste." }

function makeRequest({ method = "POST", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida", body = PAGAR } = {}) {
  const headers = new Headers({ "content-type": "application/json" })
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/update-recompensa-status", {
    method,
    headers,
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  })
}

async function call(overrides, request) {
  const ctx = makeDeps(overrides)
  const res = await createUpdateRecompensaStatusHandler(ctx.deps)(request ?? makeRequest())
  return { res, ...ctx }
}

// ========================================================================= HTTP / AUTH

test("HTTP: GET -> 405", async () => {
  const { res } = await call({}, makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("AUTH: sem login -> 401 e nada muda", async () => {
  const { res, applied } = await call({}, makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.equal(applied.length, 0)
})

test("AUTH: não-equipe (ex.: Embaixadora) -> 403 e nada muda", async () => {
  const { res, applied } = await call({}, makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.equal(applied.length, 0)
})

// ========================================================================= PAGAR

test("PAGAR: 200, grava data do Pix (meio-dia Brasília) e o uid da conta", async () => {
  const { res, applied, logs } = await call()
  assert.equal(res.status, 200)
  assert.equal(applied[0].actorUid, EQUIPE_UID)
  assert.equal(applied[0].acao.pagoEm, "2026-09-25T12:00:00-03:00")
  assert.equal((await res.json()).recompensa.status, "pago")
  assert.equal(logs.at(-1).novoStatus, "pago")
})

test("PAGAR: cliente não consegue mudar valor nem forçar status", async () => {
  const { applied } = await call({}, makeRequest({ body: { ...PAGAR, valor_centavos: 1, status: "cancelada" } }))
  assert.deepEqual(Object.keys(applied[0].acao).sort(), ["acao", "dataPagamento", "indicacaoId", "pagoEm"])
})

test("PAGAR: Pix antes da confirmação da entrega -> 400", async () => {
  const { res, applied } = await call({}, makeRequest({ body: { ...PAGAR, data_pagamento: "2026-09-19" } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "data_anterior_confirmacao" })
  assert.equal(applied.length, 0)
})

// ========================================================================= CANCELAR

test("CANCELAR: 200 com motivo", async () => {
  const { res, applied } = await call({}, makeRequest({ body: CANCELAR }))
  assert.equal(res.status, 200)
  assert.equal(applied[0].acao.motivo, "Confirmado por engano, era teste.")
  assert.equal((await res.json()).recompensa.status, "cancelada")
})

test("CANCELAR: motivo nunca vai para o log", async () => {
  const { logs } = await call({}, makeRequest({ body: CANCELAR }))
  assert.doesNotMatch(JSON.stringify(logs), /engano/)
})

test("CANCELAR: motivo em branco -> 400", async () => {
  const { res } = await call({}, makeRequest({ body: { ...CANCELAR, motivo: "   " } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "motivo_obrigatorio" })
})

// ========================================================================= ESTADOS FINAIS / CORRIDA

for (const [status, codigo] of [["pago", "ja_paga"], ["cancelada", "ja_cancelada"]]) {
  for (const body of [PAGAR, CANCELAR]) {
    test(`FINAL: recompensa ${status} + ${body.acao} -> 409 ${codigo} e nada muda`, async () => {
      const { res, applied } = await call({ getRecompensa: async () => ({ ...DISPONIVEL, status }) }, makeRequest({ body }))
      assert.equal(res.status, 409)
      assert.deepEqual(await res.json(), { error: codigo })
      assert.equal(applied.length, 0)
    })
  }
}

test("CORRIDA: UPDATE não mudou nenhuma linha -> 409 status_mudou", async () => {
  const { res } = await call({ applyAcao: async () => null })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: "status_mudou" })
})

test("SEM RECOMPENSA: indicação ainda sem confirmação -> 404", async () => {
  const { res } = await call({ getRecompensa: async () => null })
  assert.equal(res.status, 404)
})

test("ERRO: falha no UPDATE -> 500", async () => {
  const { res } = await call({ applyAcao: async () => { throw new Error("boom") } })
  assert.equal(res.status, 500)
})

// ========================================================================= VALIDAÇÃO

for (const [body, reason] of [
  [null, "payload_invalido"],
  [{ acao: "pagar", data_pagamento: "2026-09-25" }, "indicacao_id_invalido"],
  [{ indicacao_id: INDICACAO_ID, acao: "estornar" }, "acao_invalida"],
  [{ indicacao_id: INDICACAO_ID, acao: "pagar" }, "data_pagamento_invalida"],
  [{ indicacao_id: INDICACAO_ID, acao: "pagar", data_pagamento: "2026-02-30" }, "data_pagamento_invalida"],
  [{ indicacao_id: INDICACAO_ID, acao: "pagar", data_pagamento: "2026-09-27" }, "data_pagamento_futura"],
  [{ indicacao_id: INDICACAO_ID, acao: "cancelar", motivo: "abc" }, "motivo_obrigatorio"],
  [{ indicacao_id: INDICACAO_ID, acao: "cancelar", motivo: "x".repeat(301) }, "motivo_muito_longo"],
]) {
  test(`VALIDAÇÃO: ${JSON.stringify(body)?.slice(0, 80)} -> ${reason}`, () => {
    const result = validateAcaoPayload(body, NOW)
    assert.equal(result.valid, false)
    assert.equal(result.reason, reason)
  })
}

test("TRANSIÇÃO: Pix no mesmo dia da confirmação é aceito", () => {
  const acao = validateAcaoPayload({ ...PAGAR, data_pagamento: "2026-09-20" }, NOW).payload
  assert.deepEqual(checkTransition(DISPONIVEL, acao), { allowed: true })
})

// ========================================================================= ADMIN

test("ADMIN: pagar envia só indicacao_id, acao e data_pagamento", async () => {
  const calls = []
  const invoke = async (name, options) => { calls.push({ name, options }); return { data: {}, error: null } }
  await updateRecompensaStatus({ acao: "pagar", indicacaoId: INDICACAO_ID, dataPagamento: "2026-09-25" }, invoke)
  assert.equal(calls[0].name, "update-recompensa-status")
  assert.equal(calls[0].options.method, "POST")
  assert.deepEqual(calls[0].options.body, { indicacao_id: INDICACAO_ID, acao: "pagar", data_pagamento: "2026-09-25" })
})

test("ADMIN: cancelar envia só indicacao_id, acao e motivo", async () => {
  const calls = []
  const invoke = async (name, options) => { calls.push({ name, options }); return { data: {}, error: null } }
  await updateRecompensaStatus({ acao: "cancelar", indicacaoId: INDICACAO_ID, motivo: "Era teste." }, invoke)
  assert.deepEqual(calls[0].options.body, { indicacao_id: INDICACAO_ID, acao: "cancelar", motivo: "Era teste." })
})

test("ADMIN: erro vira mensagem amigável", async () => {
  const invoke = async () => ({ data: null, error: new Error("x") })
  await assert.rejects(
    () => updateRecompensaStatus({ acao: "pagar", indicacaoId: INDICACAO_ID, dataPagamento: "2026-09-25" }, invoke),
    (err) => err.message === RECOMPENSA_UNEXPECTED_ERROR,
  )
  assert.match(recompensaAcaoErrorMessage("status_mudou"), /Outra pessoa/)
})

const BASE = {
  id: INDICACAO_ID, status: "atribuida", indicada_em: "2026-09-18T00:00:00Z", codigo_referral_usado: "X",
  invalidada_em: null, embaixadora: null, candidata: null, recompensa: null,
}

test("BOTÕES: aparecem só para recompensa a pagar", () => {
  assert.equal(podeAlterarRecompensa({ ...BASE, recompensa: { status: "disponivel", valor_centavos: 4000 } }), true)
  assert.equal(podeAlterarRecompensa({ ...BASE, recompensa: { status: "pago", valor_centavos: 4000 } }), false)
  assert.equal(podeAlterarRecompensa({ ...BASE, recompensa: { status: "cancelada", valor_centavos: 4000 } }), false)
  assert.equal(podeAlterarRecompensa(BASE), false)
})

test("MOTIVO: validação igual à do servidor", () => {
  assert.equal(motivoValido("abc"), false)
  assert.equal(motivoValido("   engano   "), true)
  assert.equal(motivoValido("x".repeat(301)), false)
})
