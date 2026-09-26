import test from "node:test"
import assert from "node:assert/strict"

import { createListIndicacoesAdminHandler } from "../supabase/functions/list-indicacoes-admin/handler.ts"
import { projectIndicacaoAdmin, projectIndicacoesAdmin } from "../supabase/functions/list-indicacoes-admin/logic.ts"
import { fetchIndicacoesAdmin } from "../apps/admin/src/hooks/useIndicacoesAdmin.ts"
import { candidataSituacao, formatCentavos, recompensaSituacao } from "../apps/admin/src/lib/indicacaoAdminLabels.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS — E3.1. Lista de indicações no Admin (equipe).
// Tudo com doubles/mocks — NENHUMA conexão real com Supabase.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"

const SAMPLE_ROW = {
  id: "ind-1",
  status: "atribuida",
  primeira_atribuicao_em: "2026-09-18T17:41:03.000Z",
  codigo_referral_usado: "MARIA482",
  invalidada_em: null,
  embaixadoras: { id: "emb-1", nome: "Maria Embaixadora" },
  leads: { id: "lead-1", nome: "Ana Candidata", cidade: "Mauá", status: "aprovada", etapa_pos_aprovacao: "contatada" },
  recompensas_embaixadoras: null,
}

async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: realisticAuthorize,
    listIndicacoes: async () => [],
    logEvent: (fields) => logs.push(fields),
    ...overrides,
  }
  return { deps, logs }
}

function makeRequest({ method = "GET", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida" } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/list-indicacoes-admin", { method, headers })
}

// ========================================================================= HTTP / CORS

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const res = await createListIndicacoesAdminHandler(makeDeps().deps)(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403 sem CORS", async () => {
  const res = await createListIndicacoesAdminHandler(makeDeps().deps)(makeRequest({ origin: "https://outro.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
  assert.deepEqual(await res.json(), { error: "origin_not_allowed" })
})

test("HTTP: POST -> 405", async () => {
  const res = await createListIndicacoesAdminHandler(makeDeps().deps)(makeRequest({ method: "POST" }))
  assert.equal(res.status, 405)
})

// ========================================================================= AUTORIZAÇÃO

test("AUTH: sem Authorization -> 401", async () => {
  const res = await createListIndicacoesAdminHandler(makeDeps().deps)(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("AUTH: authenticated não-equipe (ex.: Embaixadora) -> 403", async () => {
  const res = await createListIndicacoesAdminHandler(makeDeps().deps)(makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
})

test("AUTH: nenhuma consulta ao banco sem autorização", async () => {
  let called = false
  const { deps } = makeDeps({ listIndicacoes: async () => { called = true; return [] } })
  await createListIndicacoesAdminHandler(deps)(makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(called, false)
})

// ========================================================================= LISTAGEM

test("LISTAGEM: equipe -> 200 com indicações projetadas", async () => {
  const { deps, logs } = makeDeps({ listIndicacoes: async () => [SAMPLE_ROW] })
  const res = await createListIndicacoesAdminHandler(deps)(makeRequest())
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.indicacoes.length, 1)
  assert.equal(body.indicacoes[0].candidata.nome, "Ana Candidata")
  assert.equal(body.indicacoes[0].embaixadora.nome, "Maria Embaixadora")
  assert.equal(body.indicacoes[0].recompensa, null)
  assert.deepEqual(logs, [{ event: "list_indicacoes_admin", actorUid: EQUIPE_UID, count: 1 }])
})

test("LISTAGEM: falha na query -> 500, nunca lista vazia silenciosa", async () => {
  const { deps, logs } = makeDeps({ listIndicacoes: async () => { throw new Error("boom") } })
  const res = await createListIndicacoesAdminHandler(deps)(makeRequest())
  assert.equal(res.status, 500)
  assert.equal(logs[0].event, "list_indicacoes_admin_error")
})

test("LOG: nunca registra nomes da lista", async () => {
  const { deps, logs } = makeDeps({ listIndicacoes: async () => [SAMPLE_ROW] })
  await createListIndicacoesAdminHandler(deps)(makeRequest())
  assert.doesNotMatch(JSON.stringify(logs), /Ana Candidata|Maria Embaixadora|Mauá/)
})

// ========================================================================= PROJEÇÃO

test("PROJEÇÃO: coluna extra vinda do banco nunca sai (ex.: telefone)", () => {
  const row = { ...SAMPLE_ROW, telefone: "5511999999999", leads: { ...SAMPLE_ROW.leads, telefone: "5511999999999" } }
  const item = projectIndicacaoAdmin(row)
  assert.doesNotMatch(JSON.stringify(item), /5511999999999/)
})

test("PROJEÇÃO: lead removido -> candidata null (não quebra)", () => {
  assert.equal(projectIndicacaoAdmin({ ...SAMPLE_ROW, leads: null }).candidata, null)
})

test("PROJEÇÃO: recompensa como objeto, array ou array vazio", () => {
  const rec = { status: "disponivel", valor_centavos: 4000 }
  assert.deepEqual(projectIndicacaoAdmin({ ...SAMPLE_ROW, recompensas_embaixadoras: rec }).recompensa, rec)
  assert.deepEqual(projectIndicacaoAdmin({ ...SAMPLE_ROW, recompensas_embaixadoras: [rec] }).recompensa, rec)
  assert.equal(projectIndicacaoAdmin({ ...SAMPLE_ROW, recompensas_embaixadoras: [] }).recompensa, null)
})

test("PROJEÇÃO: equipe vê também indicações invalidadas", () => {
  const items = projectIndicacoesAdmin([{ ...SAMPLE_ROW, status: "invalidada", invalidada_em: "2026-09-20T00:00:00Z" }])
  assert.equal(items.length, 1)
  assert.equal(items[0].status, "invalidada")
})

test("PROJEÇÃO: ordena da mais recente para a mais antiga", () => {
  const items = projectIndicacoesAdmin([
    { ...SAMPLE_ROW, id: "antiga", primeira_atribuicao_em: "2026-09-10T00:00:00Z" },
    { ...SAMPLE_ROW, id: "recente", primeira_atribuicao_em: "2026-09-18T00:00:00Z" },
  ])
  assert.deepEqual(items.map((i) => i.id), ["recente", "antiga"])
})

// ========================================================================= ADMIN (hook + rótulos)

test("ADMIN: fetchIndicacoesAdmin usa GET explícito na function certa", async () => {
  const calls = []
  const invoke = async (name, options) => { calls.push({ name, options }); return { data: { indicacoes: [] }, error: null } }
  await fetchIndicacoesAdmin(invoke)
  assert.equal(calls[0].name, "list-indicacoes-admin")
  assert.equal(calls[0].options.method, "GET")
})

test("ADMIN: erro da function é propagado (nunca engolido)", async () => {
  const invoke = async () => ({ data: null, error: new Error("falhou") })
  await assert.rejects(() => fetchIndicacoesAdmin(invoke))
})

const ITEM = projectIndicacaoAdmin(SAMPLE_ROW)

test("RÓTULO: candidata aprovada mostra etapa", () => {
  const s = candidataSituacao(ITEM)
  assert.equal(s.label, "Aprovada")
  assert.equal(s.detalhe, "Contatada")
})

test("RÓTULO: lead removido", () => {
  assert.equal(candidataSituacao({ ...ITEM, candidata: null }).label, "Lead removido")
})

test("RÓTULO: sem recompensa -> aguardando 1º mostruário", () => {
  assert.equal(recompensaSituacao(ITEM).label, "Aguardando 1º mostruário")
})

test("RÓTULO: recompensa disponível / paga", () => {
  assert.match(recompensaSituacao({ ...ITEM, recompensa: { status: "disponivel", valor_centavos: 4000 } }).label, /40,00 a pagar/)
  assert.match(recompensaSituacao({ ...ITEM, recompensa: { status: "pago", valor_centavos: 4000 } }).label, /40,00 paga/)
})

test("RÓTULO: indicação invalidada prevalece", () => {
  assert.equal(recompensaSituacao({ ...ITEM, status: "invalidada" }).label, "Indicação invalidada")
})

test("VALOR: 4000 centavos -> R$ 40,00", () => {
  assert.match(formatCentavos(4000), /R\$\s?40,00/)
})
