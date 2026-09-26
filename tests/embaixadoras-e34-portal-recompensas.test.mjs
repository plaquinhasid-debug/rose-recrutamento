import test from "node:test"
import assert from "node:assert/strict"

import { buildIndicacoesResponse, mapRecompensa } from "../supabase/functions/get-my-indicacoes/logic.ts"
import { formatCentavos, parseMinhasIndicacoes, recompensaTexto } from "../apps/admin/src/lib/myIndicacoes.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS — E3.4 (opção B, decidida pelo dono). O Portal
// mostra os totais "A receber"/"Já recebido" e a situação do prêmio de
// cada indicação. Cancelamento nunca é exposto. Sem rede real.
// -----------------------------------------------------------------------

function row(nome, leadStatus, recompensa, { etapa = null, data = "2026-09-18T00:00:00Z", status = "atribuida" } = {}) {
  return {
    status,
    primeira_atribuicao_em: data,
    leads: { nome, status: leadStatus, etapa_pos_aprovacao: etapa },
    recompensas_embaixadoras: recompensa,
  }
}

test("MAPA: aprovada sem recompensa -> aguardando entrega do mostruário", () => {
  assert.deepEqual(mapRecompensa("aprovada", null), { recompensa_situacao: "aguardando_mostruario", recompensa_valor_centavos: null })
})

test("MAPA: disponivel -> a_receber com o valor do banco", () => {
  assert.deepEqual(mapRecompensa("aprovada", { status: "disponivel", valor_centavos: 4000 }), { recompensa_situacao: "a_receber", recompensa_valor_centavos: 4000 })
})

test("MAPA: pago -> recebida com o valor do banco", () => {
  assert.deepEqual(mapRecompensa("aprovada", { status: "pago", valor_centavos: 4000 }), { recompensa_situacao: "recebida", recompensa_valor_centavos: 4000 })
})

test("MAPA: cancelada nunca é exposta (vira null, nem 'aguardando')", () => {
  assert.deepEqual(mapRecompensa("aprovada", { status: "cancelada", valor_centavos: 4000 }), { recompensa_situacao: null, recompensa_valor_centavos: null })
})

test("MAPA: em análise / não aprovada sem recompensa -> nada", () => {
  assert.equal(mapRecompensa("em_analise", null).recompensa_situacao, null)
  assert.equal(mapRecompensa("nao_aprovada", null).recompensa_situacao, null)
})

test("TOTAIS: somam só a_receber e recebida, com os valores do banco", () => {
  const result = buildIndicacoesResponse([
    row("A", "aprovada", { status: "disponivel", valor_centavos: 4000 }),
    row("B", "aprovada", [{ status: "disponivel", valor_centavos: 4000 }]),
    row("C", "aprovada", { status: "pago", valor_centavos: 4000 }),
    row("D", "aprovada", { status: "cancelada", valor_centavos: 4000 }),
    row("E", "aprovada", null),
    row("F", "reprovada", null),
  ])
  assert.equal(result.a_receber_centavos, 8000)
  assert.equal(result.recebido_centavos, 4000)
  assert.equal(result.total, 6)
})

test("TOTAIS: indicação invalidada ou com lead removido não entra na soma", () => {
  const result = buildIndicacoesResponse([
    row("Invalidada", "aprovada", { status: "pago", valor_centavos: 4000 }, { status: "invalidada" }),
    { status: "atribuida", primeira_atribuicao_em: "2026-09-18T00:00:00Z", leads: null, recompensas_embaixadoras: { status: "disponivel", valor_centavos: 4000 } },
  ])
  assert.deepEqual(result, { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 })
})

test("PRIVACIDADE: resposta nunca inclui motivo, autor ou datas internas da recompensa", () => {
  const result = buildIndicacoesResponse([
    row("A", "aprovada", { status: "cancelada", valor_centavos: 4000, cancelada_motivo: "segredo interno", cancelada_por: "uid-x", pago_por: "uid-y" }),
  ])
  assert.doesNotMatch(JSON.stringify(result), /segredo interno|uid-x|uid-y|cancelad/)
})

test("PORTAL: textos do prêmio por indicação", () => {
  assert.equal(recompensaTexto({ recompensa_situacao: "aguardando_mostruario", recompensa_valor_centavos: null }), "Seu prêmio: aguardando a entrega do mostruário")
  assert.match(recompensaTexto({ recompensa_situacao: "a_receber", recompensa_valor_centavos: 4000 }), /Seu prêmio: R\$\s?40,00 a receber/)
  assert.match(recompensaTexto({ recompensa_situacao: "recebida", recompensa_valor_centavos: 4000 }), /Seu prêmio: R\$\s?40,00 recebido/)
  assert.equal(recompensaTexto({ recompensa_situacao: null, recompensa_valor_centavos: null }), null)
})

test("PORTAL: formatCentavos(0) -> R$ 0,00 (totais zerados aparecem normalmente)", () => {
  assert.match(formatCentavos(0), /R\$\s?0,00/)
})

test("PARSE: resposta antiga (sem totais/prêmio) continua funcionando com zeros e null", () => {
  const result = parseMinhasIndicacoes({ total: 1, indicacoes: [{ nome: "X", situacao: "aprovada", indicada_em: "2026-09-18T00:00:00Z" }] })
  assert.equal(result.a_receber_centavos, 0)
  assert.equal(result.recebido_centavos, 0)
  assert.equal(result.indicacoes[0].recompensa_situacao, null)
})

test("PARSE: situação de prêmio desconhecida ou valor negativo nos totais -> ignorados", () => {
  const result = parseMinhasIndicacoes({
    total: 1,
    a_receber_centavos: -5,
    recebido_centavos: "4000",
    indicacoes: [{ nome: "X", situacao: "aprovada", indicada_em: "2026-09-18T00:00:00Z", recompensa_situacao: "cancelada", recompensa_valor_centavos: 4000 }],
  })
  assert.equal(result.a_receber_centavos, 0)
  assert.equal(result.recebido_centavos, 0)
  assert.equal(result.indicacoes[0].recompensa_situacao, null)
  assert.equal(result.indicacoes[0].recompensa_valor_centavos, null)
})
