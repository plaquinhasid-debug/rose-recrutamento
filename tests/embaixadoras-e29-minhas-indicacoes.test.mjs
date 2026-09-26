import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createGetMyIndicacoesHandler } from "../supabase/functions/get-my-indicacoes/handler.ts"
import {
  buildIndicacoesResponse,
  isPortalEligibleStatus,
  mapSituacao,
} from "../supabase/functions/get-my-indicacoes/logic.ts"
import { fetchMinhasIndicacoes, parseMinhasIndicacoes } from "../apps/admin/src/lib/myIndicacoes.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.9. Testes da Edge Function nova
// `get-my-indicacoes` (SEPARADA de get-my-embaixadora, decisão de
// arquitetura da E2.9) + do lado Admin (fetch/parse puro). Mesmo padrão de
// get-my-embaixadora.test.mjs: doubles/mocks, NENHUMA conexão real com
// Supabase. Casos A-J do relatório de pré-implementação, mapeados nos
// blocos abaixo.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const CAROL_UID = "d01bf21a-0000-0000-0000-000000000001"
const OUTRA_EMBAIXADORA_UID = "b2222222-0000-0000-0000-000000000002"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"

const CAROL_EMBAIXADORA_ID = "d19656bb-85a6-4045-85c4-19a50cb8024e"
const OUTRA_EMBAIXADORA_ID = "aaaaaaaa-0000-0000-0000-000000000009"

// Dados reais do smoke da E2.8 (homologação) — usados aqui só como fixture
// de teste, nunca tocados de verdade.
const SMOKE_E28_ROW = {
  status: "atribuida",
  primeira_atribuicao_em: "2026-09-17T20:51:25.361Z",
  leads: { nome: "TESTE E28 NAO CONTATAR", status: "reprovada", etapa_pos_aprovacao: null },
}

async function realisticAuthorize(header) {
  if (header === "Bearer carol-valida") return { authorized: true, uid: CAROL_UID }
  if (header === "Bearer outra-valida") return { authorized: true, uid: OUTRA_EMBAIXADORA_UID }
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  return { authorized: false, status: 401 }
}

function makeEmbaixadoraLookup(rowsByUid) {
  return async (uid) => rowsByUid[uid] ?? null
}

function makeIsEquipeLookup(equipeUids) {
  return async (uid) => equipeUids.includes(uid)
}

function makeIndicacoesLookup(rowsByEmbaixadoraId) {
  return async (embaixadoraId) => rowsByEmbaixadoraId[embaixadoraId] ?? []
}

function makeDeps(overrides = {}) {
  const logs = []
  const embaixadoraCalls = []
  const equipeCalls = []
  const indicacoesCalls = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: realisticAuthorize,
    checkIsEquipe: makeIsEquipeLookup([EQUIPE_UID]),
    findMinhaEmbaixadora: makeEmbaixadoraLookup({
      [CAROL_UID]: { id: CAROL_EMBAIXADORA_ID, status: "ativa" },
      [OUTRA_EMBAIXADORA_UID]: { id: OUTRA_EMBAIXADORA_ID, status: "ativa" },
    }),
    findIndicacoes: makeIndicacoesLookup({
      [CAROL_EMBAIXADORA_ID]: [SMOKE_E28_ROW],
      [OUTRA_EMBAIXADORA_ID]: [],
    }),
    logEvent: (fields) => logs.push(fields),
    ...overrides,
  }
  const wrappedFindEmbaixadora = async (uid) => {
    embaixadoraCalls.push(uid)
    return deps.findMinhaEmbaixadora(uid)
  }
  const wrappedIsEquipe = async (uid) => {
    equipeCalls.push(uid)
    return deps.checkIsEquipe(uid)
  }
  const wrappedFindIndicacoes = async (embaixadoraId) => {
    indicacoesCalls.push(embaixadoraId)
    return deps.findIndicacoes(embaixadoraId)
  }
  return {
    deps: {
      ...deps,
      findMinhaEmbaixadora: wrappedFindEmbaixadora,
      checkIsEquipe: wrappedIsEquipe,
      findIndicacoes: wrappedFindIndicacoes,
    },
    logs,
    embaixadoraCalls,
    equipeCalls,
    indicacoesCalls,
  }
}

function makeRequest({ method = "GET", origin = ALLOWED_ORIGIN, authorization = "Bearer carol-valida", body } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/get-my-indicacoes", {
    method,
    headers,
    body: method === "OPTIONS" || method === "GET" ? undefined : body,
  })
}

// =========================================================================
// Caso F — sem autenticação
// =========================================================================

test("F: sem Authorization -> 401", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("F: JWT inválido/lixo -> 401", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer lixo-invalido" }))
  assert.equal(res.status, 401)
})

test("F: 401 acontece ANTES de qualquer consulta ao banco", async () => {
  const { deps, embaixadoraCalls, equipeCalls, indicacoesCalls } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  await handler(makeRequest({ authorization: null }))
  assert.equal(equipeCalls.length, 0)
  assert.equal(embaixadoraCalls.length, 0)
  assert.equal(indicacoesCalls.length, 0)
})

// =========================================================================
// Caso E — conta equipe
// =========================================================================

test("E: uid de equipe -> 404, nunca 200, nunca chega a consultar indicações", async () => {
  const { deps, embaixadoraCalls, indicacoesCalls } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer equipe-valida" }))
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: "embaixadora_nao_encontrada" })
  assert.equal(embaixadoraCalls.length, 0, "checkIsEquipe=true deveria negar antes de consultar embaixadoras")
  assert.equal(indicacoesCalls.length, 0)
})

test("ADVERSARIAL: uid simultaneamente equipe E com Embaixadora ativa vinculada -> 404, nunca vaza indicações", async () => {
  const CONFLICTING_UID = "c0000000-0000-0000-0000-000000000099"
  const { deps, indicacoesCalls } = makeDeps({
    authorize: async (header) => (header === "Bearer conflito-valido" ? { authorized: true, uid: CONFLICTING_UID } : { authorized: false, status: 401 }),
    checkIsEquipe: makeIsEquipeLookup([CONFLICTING_UID]),
    findMinhaEmbaixadora: makeEmbaixadoraLookup({ [CONFLICTING_UID]: { id: "conflito-id", status: "ativa" } }),
    findIndicacoes: makeIndicacoesLookup({ "conflito-id": [SMOKE_E28_ROW] }),
  })
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer conflito-valido" }))
  assert.equal(res.status, 404)
  assert.equal(indicacoesCalls.length, 0, "nunca deveria consultar indicações se é equipe")
})

// =========================================================================
// Caso G — Embaixadora inativa
// =========================================================================

for (const status of ["convidada", "inativa", "rejeitada"]) {
  test(`G: Embaixadora status '${status}' -> 404, nunca recebe indicações`, async () => {
    const { deps, indicacoesCalls } = makeDeps({
      findMinhaEmbaixadora: makeEmbaixadoraLookup({ [CAROL_UID]: { id: CAROL_EMBAIXADORA_ID, status } }),
    })
    const handler = createGetMyIndicacoesHandler(deps)
    const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: "embaixadora_nao_encontrada" })
    assert.equal(indicacoesCalls.length, 0, "Embaixadora não-ativa nunca deveria disparar a consulta de indicações")
  })
}

test("ELEGIBILIDADE: uid sem vínculo -> mesma resposta 404 de 'não elegível' (sem diferenciar motivo)", async () => {
  const { deps } = makeDeps({ findMinhaEmbaixadora: makeEmbaixadoraLookup({}) })
  const handler = createGetMyIndicacoesHandler(deps)
  const resSemVinculo = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const { deps: deps2 } = makeDeps({ findMinhaEmbaixadora: makeEmbaixadoraLookup({ [CAROL_UID]: { id: CAROL_EMBAIXADORA_ID, status: "inativa" } }) })
  const handler2 = createGetMyIndicacoesHandler(deps2)
  const resInativa = await handler2(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(resSemVinculo.status, resInativa.status)
  assert.deepEqual(await resSemVinculo.json(), await resInativa.json())
})

// =========================================================================
// Caso A/C — Carol recebe só as suas, isolamento entre Embaixadoras
// =========================================================================

test("A: Carol autenticada recebe a indicação do smoke da E2.8 -> 'TESTE E28 NAO CONTATAR' com situacao 'nao_aprovada'", async () => {
  const { deps, embaixadoraCalls, indicacoesCalls } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, {
    total: 1,
    indicacoes: [{
      nome: "TESTE E28 NAO CONTATAR", situacao: "nao_aprovada", indicada_em: "2026-09-17T20:51:25.361Z",
      recompensa_situacao: null, recompensa_valor_centavos: null,
    }],
    a_receber_centavos: 0,
    recebido_centavos: 0,
  })
  assert.deepEqual(embaixadoraCalls, [CAROL_UID], "só o uid da Carol foi usado para localizar a Embaixadora")
  assert.deepEqual(indicacoesCalls, [CAROL_EMBAIXADORA_ID], "só o embaixadora_id DELA (resolvido internamente) foi usado na consulta")
})

test("C/ISOLAMENTO: outra Embaixadora recebe só a própria coleção (vazia no fixture), nunca a da Carol", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer outra-valida" }))
  const body = await res.json()
  assert.deepEqual(body, { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 })
  assert.ok(!JSON.stringify(body).includes("TESTE E28"), "indicação da Carol nunca deveria vazar para outra Embaixadora")
})

test("C/ISOLAMENTO: handler nunca lê body/query pra decidir de quem são as indicações — GET não tem body, embaixadora_id nunca vem do request", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/handler.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/req\.json\(\)/.test(codeOnly), "handler não deveria ler um body")
  assert.ok(!/searchParams|req\.url/.test(codeOnly), "handler não deveria ler query string")
  assert.match(codeOnly, /findIndicacoes\(embaixadora\.id\)/, "a única fonte do embaixadora_id usado na consulta deveria ser o resultado de findMinhaEmbaixadora")
})

test("C/ISOLAMENTO: um request forjado com { embaixadora_id: '...' } no body é ignorado — GET não envia body, e mesmo que enviasse o handler nunca o lê", async () => {
  const { deps, indicacoesCalls } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  // Requisição adversarial: tenta escolher a Embaixadora via query string.
  const forged = new Request(`https://example.invalid/get-my-indicacoes?embaixadora_id=${OUTRA_EMBAIXADORA_ID}`, {
    method: "GET",
    headers: { origin: ALLOWED_ORIGIN, authorization: "Bearer carol-valida" },
  })
  const res = await handler(forged)
  const body = await res.json()
  assert.equal(body.indicacoes[0]?.nome, "TESTE E28 NAO CONTATAR", "deveria continuar recebendo as indicações da Carol, ignorando o query param forjado")
  assert.deepEqual(indicacoesCalls, [CAROL_EMBAIXADORA_ID])
})

// =========================================================================
// Caso B — contador
// =========================================================================

test("B: uma indicação retornada -> total = 1, igual a indicacoes.length", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const body = await res.json()
  assert.equal(body.total, 1)
  assert.equal(body.total, body.indicacoes.length, "total deve ser sempre derivado da própria coleção retornada")
})

// =========================================================================
// Caso D — Embaixadora sem indicação
// =========================================================================

test("D: coleção vazia -> total 0, indicacoes [], nunca erro", async () => {
  const { deps } = makeDeps({ findIndicacoes: makeIndicacoesLookup({ [CAROL_EMBAIXADORA_ID]: [] }) })
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 })
})

test("logic D: buildIndicacoesResponse([]) -> { total: 0, indicacoes: [] }", () => {
  assert.deepEqual(buildIndicacoesResponse([]), { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 })
})

// =========================================================================
// Invalidada — nunca aparece (decisão E2.9, seção 1)
// =========================================================================

test("INVALIDADA: linha com status='invalidada' nunca aparece na resposta (defesa em profundidade em logic.ts, mesmo que a query já devesse ter filtrado)", () => {
  const rows = [
    SMOKE_E28_ROW,
    { status: "invalidada", primeira_atribuicao_em: "2026-09-18T00:00:00.000Z", leads: { nome: "Candidata Invalidada", status: "reprovada", etapa_pos_aprovacao: null } },
  ]
  const result = buildIndicacoesResponse(rows)
  assert.equal(result.total, 1)
  assert.equal(result.indicacoes[0].nome, "TESTE E28 NAO CONTATAR")
  assert.ok(!JSON.stringify(result).includes("Candidata Invalidada"))
})

test("INVALIDADA (handler): query já filtra status='atribuida' em index.ts", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /\.eq\(\s*["']status["']\s*,\s*["']atribuida["']\s*\)/)
})

// =========================================================================
// Lead removido (lead_id = null) — omitido, nunca quebra (decisão E2.9, seção 2)
// =========================================================================

test("LEAD REMOVIDO: linha com leads=null (lead_id apagado) é omitida, resposta não quebra", () => {
  const rows = [
    SMOKE_E28_ROW,
    { status: "atribuida", primeira_atribuicao_em: "2026-09-19T00:00:00.000Z", leads: null },
  ]
  const result = buildIndicacoesResponse(rows)
  assert.equal(result.total, 1, "a linha com lead removido não deveria contar")
  assert.deepEqual(result.indicacoes.map((i) => i.nome), ["TESTE E28 NAO CONTATAR"])
})

test("LEAD REMOVIDO: só isso na coleção -> total 0, sem lançar exceção", () => {
  assert.doesNotThrow(() => {
    const result = buildIndicacoesResponse([{ status: "atribuida", primeira_atribuicao_em: "2026-09-19T00:00:00.000Z", leads: null }])
    assert.deepEqual(result, { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 })
  })
})

// =========================================================================
// Caso I — ordenação (mais recente primeiro, por primeira_atribuicao_em)
// =========================================================================

test("I: ordena por primeira_atribuicao_em DESC, independente da ordem de entrada", () => {
  const rows = [
    { status: "atribuida", primeira_atribuicao_em: "2026-09-01T00:00:00.000Z", leads: { nome: "Mais antiga", status: "novo", etapa_pos_aprovacao: null } },
    { status: "atribuida", primeira_atribuicao_em: "2026-09-17T20:51:25.361Z", leads: { nome: "TESTE E28 NAO CONTATAR", status: "reprovada", etapa_pos_aprovacao: null } },
    { status: "atribuida", primeira_atribuicao_em: "2026-09-10T00:00:00.000Z", leads: { nome: "Do meio", status: "aprovada", etapa_pos_aprovacao: null } },
  ]
  const result = buildIndicacoesResponse(rows)
  assert.deepEqual(result.indicacoes.map((i) => i.nome), ["TESTE E28 NAO CONTATAR", "Do meio", "Mais antiga"])
})

test("I (handler): index.ts pede ORDER BY primeira_atribuicao_em desc na query", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /\.order\(\s*["']primeira_atribuicao_em["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/)
})

// =========================================================================
// Caso J — mapeamento de status (decisão E2.9, seção 3)
// =========================================================================

test("J: mapSituacao — matriz exaustiva do mapeamento aprovado", () => {
  const cases = [
    ["novo", null, "em_analise"],
    ["em_analise", null, "em_analise"],
    ["aprovada", null, "aprovada"],
    ["aprovada", "contatada", "aprovada"],
    ["aprovada", "confirmada", "aprovada"],
    ["aprovada", "aguardando_tania", "aprovada"],
    ["aprovada", "ativa", "aprovada"],
    ["aprovada", "desistiu", "nao_aprovada"],
    ["reprovada", null, "nao_aprovada"],
  ]
  for (const [status, etapa, esperado] of cases) {
    assert.equal(mapSituacao(status, etapa), esperado, `status=${status} etapa=${etapa} deveria mapear pra ${esperado}`)
  }
})

test("J: candidata do smoke da E2.8 (status='reprovada') mapeia pra 'nao_aprovada'", () => {
  assert.equal(mapSituacao("reprovada", null), "nao_aprovada")
})

// =========================================================================
// MINIMIZAÇÃO — resposta contém só total/indicacoes[].nome/situacao/indicada_em
// =========================================================================

test("MINIMIZAÇÃO: mesmo se findIndicacoes devolver campos extras (telefone, ids, IPR etc.), a resposta nunca os inclui", async () => {
  const rowComExtras = {
    status: "atribuida",
    primeira_atribuicao_em: "2026-09-17T20:51:25.361Z",
    lead_id: "74513326-53e5-4494-a5a9-2717bf275625",
    embaixadora_id: CAROL_EMBAIXADORA_ID,
    candidata_telefone_normalizado: "5511989459188",
    codigo_referral_usado: "7E9NH4VD",
    leads: {
      nome: "TESTE E28 NAO CONTATAR",
      status: "reprovada",
      etapa_pos_aprovacao: null,
      telefone: "11989459188",
      cidade: "Teste",
      profissao: "segredo",
      instagram: "@segredo",
      ipr: 0,
      session_id: "fd81d549-0847-46a2-95eb-528d63c6df0d",
      conversation_id: "ac64063c-6d5f-462e-8fb8-bc7bf8d2457b",
      observacoes: "nota interna secreta",
    },
  }
  const { deps } = makeDeps({ findIndicacoes: makeIndicacoesLookup({ [CAROL_EMBAIXADORA_ID]: [rowComExtras] }) })
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const body = await res.json()
  // E3.4: resposta ganhou os totais e a situação do prêmio por item — nada além disso.
  assert.deepEqual(Object.keys(body).sort(), ["a_receber_centavos", "indicacoes", "recebido_centavos", "total"])
  assert.deepEqual(Object.keys(body.indicacoes[0]).sort(), ["indicada_em", "nome", "recompensa_situacao", "recompensa_valor_centavos", "situacao"])
  const bodyText = JSON.stringify(body)
  for (const forbidden of [
    "lead_id", "embaixadora_id", "codigo_referral_usado", "candidata_telefone_normalizado",
    "74513326-53e5-4494-a5a9-2717bf275625", CAROL_EMBAIXADORA_ID, "5511989459188", "7E9NH4VD",
    "11989459188", "Teste", "segredo", "@segredo", "fd81d549-0847-46a2-95eb-528d63c6df0d",
    "ac64063c-6d5f-462e-8fb8-bc7bf8d2457b", "nota interna secreta", "ipr",
  ]) {
    assert.ok(!bodyText.includes(forbidden), `campo/valor sensível "${forbidden}" vazou na resposta`)
  }
})

test("logic: buildIndicacoesResponse projeta só os 3 campos por item, nunca spread", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/logic.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.doesNotMatch(codeOnly, /\.\.\.(row|item)\b/, "nunca deveria usar spread do objeto cru")
})

// =========================================================================
// SOMENTE LEITURA / colunas mínimas
// =========================================================================

test("SOMENTE LEITURA: index.ts nunca escreve em nenhuma tabela, nunca toca recompensas_embaixadoras", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const writeMethod of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!codeOnly.includes(writeMethod), `index.ts não deveria conter '${writeMethod}' — esta function é somente leitura`)
  }
  assert.ok(!/\.rpc\(/.test(codeOnly), "não deveria chamar nenhuma RPC mutante")
  // E3.4: passa a LER só status/valor de recompensas_embaixadoras (nunca escrever — ver writeMethod acima).
  assert.match(codeOnly, /recompensas_embaixadoras\(status, valor_centavos\)/, "embed de recompensas deveria pedir só status e valor_centavos")
  assert.doesNotMatch(codeOnly, /cancelada_motivo|pago_por|cancelada_por/, "nunca deveria ler motivo nem autor de pagamento/cancelamento")
})

test("index.ts: SELECT explícito — leads() embedded pede só nome/status/etapa_pos_aprovacao, nunca '*'", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/\.select\(\s*["']\*["']\s*\)/.test(codeOnly))
  assert.match(codeOnly, /leads\(nome, status, etapa_pos_aprovacao\)/)
})

test("index.ts: checa equipe via consulta direta a profiles.papel, nunca via RPC is_equipe()", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/\.rpc\(\s*["']is_equipe["']/.test(codeOnly))
  assert.match(codeOnly, /\.from\(["']profiles["']\)/)
  assert.match(codeOnly, /papel["']?\s*===\s*["']equipe["']/)
  assert.doesNotMatch(codeOnly, /SUPABASE_ANON_KEY/)
})

test("index.ts: env vars obrigatórias usam requireEnv", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-indicacoes/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const varName of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(codeOnly, new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`))
  }
})

test("logic: isPortalEligibleStatus só é true para 'ativa'", () => {
  assert.equal(isPortalEligibleStatus("ativa"), true)
  for (const status of ["convidada", "inativa", "rejeitada"]) {
    assert.equal(isPortalEligibleStatus(status), false)
  }
})

test("PRIVACIDADE: nenhum log contém nome da candidata", async () => {
  const { deps, logs } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("TESTE E28 NAO CONTATAR"))
})

// =========================================================================
// HTTP / CORS
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
})

test("HTTP: método inválido (POST) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ method: "POST" }))
  assert.equal(res.status, 405)
})

// =========================================================================
// ERRO INTERNO
// =========================================================================

test("ERRO: findIndicacoes rejeita -> 500 sanitizado, sem vazar detalhe", async () => {
  const { deps, logs } = makeDeps({
    findIndicacoes: async () => { throw new Error("connection to postgres failed telefone=5511999998888") },
  })
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("5511999998888"))
})

test("ERRO: checkIsEquipe rejeita -> 500 sanitizado, fail-closed (nunca prossegue)", async () => {
  const { deps, embaixadoraCalls } = makeDeps({
    checkIsEquipe: async () => { throw new Error("falha ao consultar profiles") },
  })
  const handler = createGetMyIndicacoesHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 500)
  assert.equal(embaixadoraCalls.length, 0)
})

// =========================================================================
// FRONTEND — fetch/parse puro (apps/admin/src/lib/myIndicacoes.ts)
// =========================================================================

test("HOOK: 200 com dado válido -> objeto projetado", async () => {
  const result = await fetchMinhasIndicacoes(async () => ({
    data: { total: 1, indicacoes: [{ nome: "TESTE E28 NAO CONTATAR", situacao: "nao_aprovada", indicada_em: "2026-09-17T20:51:25.361Z" }] },
    error: null,
  }))
  assert.deepEqual(result, {
    total: 1,
    indicacoes: [{
      nome: "TESTE E28 NAO CONTATAR", situacao: "nao_aprovada", indicada_em: "2026-09-17T20:51:25.361Z",
      recompensa_situacao: null, recompensa_valor_centavos: null,
    }],
    a_receber_centavos: 0,
    recebido_centavos: 0,
  })
})

test("HOOK: 404 -> { total: 0, indicacoes: [] }, nunca lançado como erro", async () => {
  const { FunctionsHttpError } = await import("@supabase/supabase-js")
  const result = await fetchMinhasIndicacoes(async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error: "embaixadora_nao_encontrada" }), { status: 404 })),
  }))
  assert.deepEqual(result, { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 })
})

for (const status of [401, 403, 500]) {
  test(`HOOK: HTTP ${status} propaga (throw)`, async () => {
    const { FunctionsHttpError } = await import("@supabase/supabase-js")
    await assert.rejects(
      fetchMinhasIndicacoes(async () => ({
        data: null,
        error: new FunctionsHttpError(new Response(JSON.stringify({ error: "x" }), { status })),
      })),
    )
  })
}

test("HOOK: falha de rede propaga (throw)", async () => {
  await assert.rejects(fetchMinhasIndicacoes(async () => { throw new Error("network down") }), { message: "network down" })
})

test("PARSE: resposta malformada -> null / itens descartados, nunca lança", () => {
  assert.equal(parseMinhasIndicacoes(null), null)
  assert.equal(parseMinhasIndicacoes({}), null)
  assert.equal(parseMinhasIndicacoes({ total: "1", indicacoes: [] }), null)
  assert.equal(parseMinhasIndicacoes({ total: 1, indicacoes: "não é array" }), null)
  const withBadItem = parseMinhasIndicacoes({
    total: 2,
    indicacoes: [
      { nome: "Válida", situacao: "aprovada", indicada_em: "2026-09-17T00:00:00.000Z" },
      { nome: "", situacao: "aprovada", indicada_em: "2026-09-17T00:00:00.000Z" },
      { nome: "Situação inválida", situacao: "algo-invalido", indicada_em: "2026-09-17T00:00:00.000Z" },
    ],
  })
  assert.deepEqual(withBadItem.indicacoes.map((i) => i.nome), ["Válida"], "itens malformados são descartados silenciosamente")
})

test("PARSE: projeta só os 3 campos por item, descarta extras", () => {
  const result = parseMinhasIndicacoes({
    total: 1,
    indicacoes: [{ nome: "Carol Test", situacao: "aprovada", indicada_em: "2026-09-17T00:00:00.000Z", lead_id: "vazar", telefone: "vazar" }],
  })
  assert.deepEqual(Object.keys(result.indicacoes[0]).sort(), ["indicada_em", "nome", "recompensa_situacao", "recompensa_valor_centavos", "situacao"])
})

// =========================================================================
// FRONTEND — Portal (estático)
// =========================================================================

test("PORTAL: EmbaixadoraPortalPage renderiza o card 'Minhas indicações', usa useMyIndicacoes e formatDate", () => {
  const source = fs.readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  assert.match(source, /Minhas indicações/)
  assert.match(source, /useMyIndicacoes/)
  assert.match(source, /formatDate\(indicacao\.indicada_em\)/)
})

test("PORTAL: estado vazio mostra 'Você ainda não tem indicações.'", () => {
  const source = fs.readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  assert.match(source, /Você ainda não tem indicações\./)
})

test("PORTAL: seção 'Indique uma amiga' continua presente e intocada", () => {
  const source = fs.readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  assert.match(source, /Indique uma amiga/)
  assert.match(source, /buildReferralUrl/)
})

test("PORTAL: nunca menciona ConsigGold nem motivo de cancelamento; valores só formatados, nunca R$40 fixo no código (E3.4)", () => {
  const source = fs.readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.doesNotMatch(codeOnly, /consiggold|cancelad|motivo|r\$\s*40|4000/i)
})

test("PORTAL: mapa de rótulos cobre exatamente os 3 estados públicos", () => {
  const source = fs.readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  assert.match(source, /em_analise:\s*"Em análise"/)
  assert.match(source, /aprovada:\s*"Aprovada"/)
  assert.match(source, /nao_aprovada:\s*"Não aprovada"/)
})

// =========================================================================
// SEGURANÇA ESTÁTICA COMPLEMENTAR
// =========================================================================

test("segurança estática: sem service_role, localStorage, sessionStorage ou console.log no código novo do frontend", () => {
  for (const path of [
    "../apps/admin/src/lib/myIndicacoes.ts",
    "../apps/admin/src/hooks/useMyIndicacoes.ts",
  ]) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8")
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage|console\.(log|error)/)
  }
})

test("segurança estática: get-my-indicacoes é function SEPARADA — nunca IMPORTA nada de get-my-embaixadora (comentários explicando a decisão arquitetural são esperados e não contam)", () => {
  for (const path of [
    "../supabase/functions/get-my-indicacoes/index.ts",
    "../supabase/functions/get-my-indicacoes/handler.ts",
    "../supabase/functions/get-my-indicacoes/logic.ts",
  ]) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8")
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    assert.doesNotMatch(codeOnly, /from\s+["'][^"']*get-my-embaixadora[^"']*["']/, `${path} nunca deveria importar de get-my-embaixadora`)
  }
})
