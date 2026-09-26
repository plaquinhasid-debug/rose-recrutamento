import test from "node:test"
import assert from "node:assert/strict"

import {
  createConfirmPrimeiroMostruarioHandler, RecompensaJaExisteError,
} from "../supabase/functions/confirm-primeiro-mostruario/handler.ts"
import { checkEligibility, todayInBrazil, validateConfirmPayload } from "../supabase/functions/confirm-primeiro-mostruario/logic.ts"
import { confirmPrimeiroMostruario } from "../apps/admin/src/hooks/useConfirmPrimeiroMostruario.ts"
import { confirmMostruarioErrorMessage, CONFIRM_UNEXPECTED_ERROR } from "../apps/admin/src/lib/confirmMostruario.ts"
import { podeConfirmarMostruario, recompensaSituacao } from "../apps/admin/src/lib/indicacaoAdminLabels.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS — E3.2. Confirmar entrega do primeiro
// mostruário (cria a recompensa de R$40 a pagar). Tudo com mocks —
// NENHUMA conexão real com Supabase.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"
const INDICACAO_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
// 26/09/2026 15:00 em Brasília
const NOW = new Date("2026-09-26T18:00:00Z")

const ELEGIVEL = {
  id: INDICACAO_ID,
  status: "atribuida",
  primeira_atribuicao_em: "2026-09-18T17:41:03Z",
  lead: { status: "aprovada", etapa_pos_aprovacao: "ativa" },
  tem_recompensa: false,
}

const RECOMPENSA = { id: "rec-1", status: "disponivel", valor_centavos: 4000, primeiro_mostruario_em: "2026-09-25T15:00:00Z" }

async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const inserts = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: realisticAuthorize,
    getIndicacao: async () => ELEGIVEL,
    insertRecompensa: async (input) => { inserts.push(input); return RECOMPENSA },
    logEvent: (fields) => logs.push(fields),
    now: () => NOW,
    ...overrides,
  }
  return { deps, logs, inserts }
}

function makeRequest({ method = "POST", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida", body } = {}) {
  const headers = new Headers({ "content-type": "application/json" })
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  const payload = body === undefined ? { indicacao_id: INDICACAO_ID, data_entrega: "2026-09-25" } : body
  return new Request("https://example.invalid/confirm-primeiro-mostruario", {
    method,
    headers,
    body: method === "POST" ? (typeof payload === "string" ? payload : JSON.stringify(payload)) : undefined,
  })
}

async function call(overrides, request) {
  const ctx = makeDeps(overrides)
  const res = await createConfirmPrimeiroMostruarioHandler(ctx.deps)(request ?? makeRequest())
  return { res, ...ctx }
}

// ========================================================================= HTTP / AUTH

test("HTTP: GET -> 405", async () => {
  const { res } = await call({}, makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("HTTP: origem não permitida -> 403", async () => {
  const { res } = await call({}, makeRequest({ origin: "https://outro.example.com" }))
  assert.equal(res.status, 403)
})

test("AUTH: sem login -> 401 e nada é gravado", async () => {
  const { res, inserts } = await call({}, makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.equal(inserts.length, 0)
})

test("AUTH: não-equipe (ex.: Embaixadora) -> 403 e nada é gravado", async () => {
  const { res, inserts } = await call({}, makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.equal(inserts.length, 0)
})

test("BODY: JSON inválido -> 400", async () => {
  const { res } = await call({}, makeRequest({ body: "{nao-json" }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "invalid_json" })
})

// ========================================================================= SUCESSO

test("SUCESSO: 201, grava só indicação + data (nunca valor/status do cliente)", async () => {
  const { res, inserts, logs } = await call({}, makeRequest({
    body: { indicacao_id: INDICACAO_ID, data_entrega: "2026-09-25", valor_centavos: 999999, status: "pago" },
  }))
  assert.equal(res.status, 201)
  assert.deepEqual(inserts, [{ indicacaoId: INDICACAO_ID, primeiroMostruarioEm: "2026-09-25T12:00:00-03:00" }])
  const body = await res.json()
  assert.equal(body.recompensa.valor_centavos, 4000)
  assert.equal(body.recompensa.status, "disponivel")
  assert.equal(logs.at(-1).event, "confirm_mostruario")
})

test("SUCESSO: data de hoje (Brasília) é aceita", async () => {
  const { res } = await call({}, makeRequest({ body: { indicacao_id: INDICACAO_ID, data_entrega: "2026-09-26" } }))
  assert.equal(res.status, 201)
})

// ========================================================================= REGRAS

for (const [nome, indicacao, codigo, status] of [
  ["indicação invalidada", { ...ELEGIVEL, status: "invalidada" }, "indicacao_invalidada", 409],
  ["lead removido", { ...ELEGIVEL, lead: null }, "lead_removido", 409],
  ["candidata em análise", { ...ELEGIVEL, lead: { status: "em_analise", etapa_pos_aprovacao: null } }, "candidata_nao_aprovada", 409],
  ["candidata reprovada", { ...ELEGIVEL, lead: { status: "reprovada", etapa_pos_aprovacao: null } }, "candidata_nao_aprovada", 409],
  ["candidata desistiu", { ...ELEGIVEL, lead: { status: "aprovada", etapa_pos_aprovacao: "desistiu" } }, "candidata_desistiu", 409],
  ["já confirmada", { ...ELEGIVEL, tem_recompensa: true }, "ja_confirmada", 409],
]) {
  test(`REGRA: ${nome} -> ${status} ${codigo} e nada é gravado`, async () => {
    const { res, inserts } = await call({ getIndicacao: async () => indicacao })
    assert.equal(res.status, status)
    assert.deepEqual(await res.json(), { error: codigo })
    assert.equal(inserts.length, 0)
  })
}

test("REGRA: indicação inexistente -> 404", async () => {
  const { res } = await call({ getIndicacao: async () => null })
  assert.equal(res.status, 404)
})

test("REGRA: entrega antes do dia da indicação -> 400", async () => {
  const { res, inserts } = await call({}, makeRequest({ body: { indicacao_id: INDICACAO_ID, data_entrega: "2026-09-17" } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "data_anterior_indicacao" })
  assert.equal(inserts.length, 0)
})

test("CONCORRÊNCIA: UNIQUE do banco barra a 2ª confirmação -> 409 ja_confirmada", async () => {
  const { res } = await call({ insertRecompensa: async () => { throw new RecompensaJaExisteError() } })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: "ja_confirmada" })
})

test("ERRO: falha inesperada no INSERT -> 500", async () => {
  const { res } = await call({ insertRecompensa: async () => { throw new Error("boom") } })
  assert.equal(res.status, 500)
})

// ========================================================================= VALIDAÇÃO

for (const [body, reason] of [
  [null, "payload_invalido"],
  [{ data_entrega: "2026-09-25" }, "indicacao_id_invalido"],
  [{ indicacao_id: "nao-e-uuid", data_entrega: "2026-09-25" }, "indicacao_id_invalido"],
  [{ indicacao_id: INDICACAO_ID }, "data_entrega_invalida"],
  [{ indicacao_id: INDICACAO_ID, data_entrega: "25/09/2026" }, "data_entrega_invalida"],
  [{ indicacao_id: INDICACAO_ID, data_entrega: "2026-02-30" }, "data_entrega_invalida"],
  [{ indicacao_id: INDICACAO_ID, data_entrega: "2026-09-27" }, "data_entrega_futura"],
]) {
  test(`VALIDAÇÃO: ${JSON.stringify(body)} -> ${reason}`, () => {
    const result = validateConfirmPayload(body, NOW)
    assert.equal(result.valid, false)
    assert.equal(result.reason, reason)
  })
}

test("FUSO: 23h de Brasília ainda é o mesmo dia", () => {
  assert.equal(todayInBrazil(new Date("2026-09-27T02:00:00Z")), "2026-09-26")
})

test("ELEGIBILIDADE: entrega no mesmo dia da indicação é aceita", () => {
  assert.deepEqual(checkEligibility(ELEGIVEL, "2026-09-18"), { eligible: true })
})

// ========================================================================= ADMIN

test("ADMIN: envia POST só com indicacao_id e data_entrega", async () => {
  const calls = []
  const invoke = async (name, options) => { calls.push({ name, options }); return { data: { recompensa: RECOMPENSA }, error: null } }
  await confirmPrimeiroMostruario({ indicacaoId: INDICACAO_ID, dataEntrega: "2026-09-25" }, invoke)
  assert.equal(calls[0].name, "confirm-primeiro-mostruario")
  assert.equal(calls[0].options.method, "POST")
  assert.deepEqual(calls[0].options.body, { indicacao_id: INDICACAO_ID, data_entrega: "2026-09-25" })
})

test("ADMIN: erro vira mensagem amigável (nunca código técnico cru)", async () => {
  const invoke = async () => ({ data: null, error: new Error("falhou") })
  await assert.rejects(
    () => confirmPrimeiroMostruario({ indicacaoId: INDICACAO_ID, dataEntrega: "2026-09-25" }, invoke),
    (err) => err.message === CONFIRM_UNEXPECTED_ERROR,
  )
  assert.match(confirmMostruarioErrorMessage("ja_confirmada"), /já tinha sido confirmada/)
  assert.equal(confirmMostruarioErrorMessage("codigo_desconhecido"), CONFIRM_UNEXPECTED_ERROR)
})

const ITEM = {
  id: INDICACAO_ID,
  status: "atribuida",
  indicada_em: "2026-09-18T17:41:03Z",
  codigo_referral_usado: "7E9NH4VD",
  invalidada_em: null,
  embaixadora: { id: "emb", nome: "Carol" },
  candidata: { lead_id: "lead", nome: "Ana", cidade: "Mauá", status: "aprovada", etapa_pos_aprovacao: "contatada" },
  recompensa: null,
}

test("BOTÃO: aparece para aprovada sem recompensa", () => {
  assert.equal(podeConfirmarMostruario(ITEM), true)
})

for (const [nome, item] of [
  ["reprovada", { ...ITEM, candidata: { ...ITEM.candidata, status: "reprovada" } }],
  ["em análise", { ...ITEM, candidata: { ...ITEM.candidata, status: "em_analise" } }],
  ["desistiu", { ...ITEM, candidata: { ...ITEM.candidata, etapa_pos_aprovacao: "desistiu" } }],
  ["lead removido", { ...ITEM, candidata: null }],
  ["invalidada", { ...ITEM, status: "invalidada" }],
  ["já tem recompensa", { ...ITEM, recompensa: { status: "disponivel", valor_centavos: 4000 } }],
]) {
  test(`BOTÃO: não aparece quando ${nome}`, () => {
    assert.equal(podeConfirmarMostruario(item), false)
  })
}

test("RÓTULO: reprovada / desistiu -> 'Não se aplica' (correção pedida no print)", () => {
  assert.equal(recompensaSituacao({ ...ITEM, candidata: { ...ITEM.candidata, status: "reprovada" } }).label, "Não se aplica")
  assert.equal(recompensaSituacao({ ...ITEM, candidata: { ...ITEM.candidata, etapa_pos_aprovacao: "desistiu" } }).label, "Não se aplica")
})

test("RÓTULO: em análise continua aguardando", () => {
  assert.equal(recompensaSituacao({ ...ITEM, candidata: { ...ITEM.candidata, status: "em_analise" } }).label, "Aguardando 1º mostruário")
})
