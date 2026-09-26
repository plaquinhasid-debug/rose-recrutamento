// logic.ts — lógica pura (sem I/O) de `get-my-indicacoes`. Mesmo padrão de
// get-my-embaixadora/logic.ts: testável direto via node:test, nenhuma
// função aqui faz rede/banco. index.ts continua sendo o único ponto de I/O
// real (Supabase Auth + banco).
//
// E2.9 — "Minhas indicações" no Portal da Embaixadora. SOMENTE LEITURA;
// nunca cria/altera/apaga nada. E3.4 — passa a LER (nunca escrever) a
// situação da recompensa de R$40 de cada indicação + totais.

// Duplicado localmente (não importado de get-my-embaixadora/logic.ts):
// cada Edge Function é empacotada/deployada como bundle isolado — um import
// relativo saindo desta pasta escaparia do bundle desta function, mesmo
// motivo já documentado em supabase/functions/_shared/phone.ts (E2.8).
export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

/** Só `status === 'ativa'` pode acessar o Portal — mesma regra de get-my-embaixadora/logic.ts (isPortalEligible), duplicada aqui pelo mesmo motivo de empacotamento. */
export function isPortalEligibleStatus(status: EmbaixadoraStatus): boolean {
  return status === "ativa"
}

export type IndicacaoStatusRaw = "atribuida" | "invalidada"
export type LeadStatusRaw = "novo" | "em_analise" | "aprovada" | "reprovada"
export type EtapaPosAprovacaoRaw = "contatada" | "confirmada" | "aguardando_tania" | "ativa" | "desistiu" | null

/** Os 3 únicos estados públicos que a Embaixadora vê — nunca o valor cru do banco (decisão de produto E2.9, seção 3). */
export type SituacaoPublica = "em_analise" | "aprovada" | "nao_aprovada"

/**
 * Mapeamento aprovado (E2.9, seção 3): `aprovada` + `desistiu` cai em
 * "nao_aprovada" (mesmo agrupamento já usado no Kanban do Admin, ver
 * packages/shared/src/constants.ts PIPELINE_COLUMNS "desistiu"). `novo` e
 * `em_analise` caem juntos em "em_analise". Nenhuma etapa operacional
 * interna (contatada/confirmada/aguardando_tania/ativa) é exposta — todas
 * viram simplesmente "aprovada".
 */
export function mapSituacao(status: LeadStatusRaw, etapaPosAprovacao: EtapaPosAprovacaoRaw): SituacaoPublica {
  if (status === "aprovada") {
    return etapaPosAprovacao === "desistiu" ? "nao_aprovada" : "aprovada"
  }
  if (status === "reprovada") return "nao_aprovada"
  return "em_analise"
}

export type RecompensaStatusRaw = "disponivel" | "pago" | "cancelada"

interface RecompensaJoin {
  status: RecompensaStatusRaw
  valor_centavos: number
}

/**
 * Formato cru de uma linha vinda do JOIN `indicacoes_embaixadoras` ->
 * `leads` (embedded select do PostgREST). `leads` é `null` quando
 * `lead_id` é null — caso real de `ON DELETE SET NULL` se o lead for
 * apagado no futuro (decisão E2.9, seção 2: omitir, nunca quebrar).
 * E3.4: `recompensas_embaixadoras` (1:1 por UNIQUE indicacao_id) pode vir
 * como objeto, array ou null — normalizado em `pickRecompensa`. Opcional
 * pra compatibilidade com linhas sem o embed.
 */
export interface IndicacaoJoinRow {
  status: IndicacaoStatusRaw
  primeira_atribuicao_em: string
  leads: { nome: string; status: LeadStatusRaw; etapa_pos_aprovacao: EtapaPosAprovacaoRaw } | null
  recompensas_embaixadoras?: RecompensaJoin | RecompensaJoin[] | null
}

/**
 * E3.4 — situação pública da recompensa de R$40, vista pela Embaixadora:
 * - "aguardando_mostruario": candidata aprovada, entrega ainda não confirmada;
 * - "a_receber": entrega confirmada, Pix ainda não feito;
 * - "recebida": Pix feito.
 * `null` = não se aplica (em análise, não aprovada) OU recompensa cancelada
 * — cancelamento nunca é exposto à Embaixadora (motivo é interno).
 */
export type RecompensaSituacaoPublica = "aguardando_mostruario" | "a_receber" | "recebida"

/** Formato exato devolvido à Embaixadora (E2.9 + E3.4). */
export interface IndicacaoItem {
  nome: string
  situacao: SituacaoPublica
  indicada_em: string
  recompensa_situacao: RecompensaSituacaoPublica | null
  /** Só preenchido em "a_receber"/"recebida" — valor vindo do banco, nunca calculado aqui. */
  recompensa_valor_centavos: number | null
}

export interface MinhasIndicacoesResponse {
  total: number
  indicacoes: IndicacaoItem[]
  /** E3.4 — soma dos valores das recompensas "a_receber" das indicações listadas. */
  a_receber_centavos: number
  /** E3.4 — soma dos valores das recompensas "recebida" das indicações listadas. */
  recebido_centavos: number
}

function pickRecompensa(value: IndicacaoJoinRow["recompensas_embaixadoras"]): RecompensaJoin | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

/** E3.4 — mapeia a recompensa crua pra situação pública (ver `RecompensaSituacaoPublica`). */
export function mapRecompensa(
  situacao: SituacaoPublica,
  recompensa: RecompensaJoin | null,
): { recompensa_situacao: RecompensaSituacaoPublica | null; recompensa_valor_centavos: number | null } {
  if (recompensa?.status === "disponivel") return { recompensa_situacao: "a_receber", recompensa_valor_centavos: recompensa.valor_centavos }
  if (recompensa?.status === "pago") return { recompensa_situacao: "recebida", recompensa_valor_centavos: recompensa.valor_centavos }
  if (!recompensa && situacao === "aprovada") return { recompensa_situacao: "aguardando_mostruario", recompensa_valor_centavos: null }
  return { recompensa_situacao: null, recompensa_valor_centavos: null }
}

/**
 * DEFESA EM PROFUNDIDADE (mesmo padrão de projectMinhaEmbaixadora/
 * buildIndicacaoEmbaixadoraRow): projeção campo a campo, nunca spread.
 *
 * Filtra `status !== 'atribuida'` (decisão E2.9, seção 1 — "invalidada"
 * nunca aparece) e `leads === null` (decisão E2.9, seção 2 — lead removido
 * nunca aparece) AQUI, mesmo que index.ts já filtre `status='atribuida'`
 * na query — nunca confia só no filtro do banco, mesmo espírito de
 * decideAttribution (E2.8) ser fail-closed por padrão.
 *
 * Reordena por `primeira_atribuicao_em` DESC aqui também (defesa contra um
 * `ORDER BY` que viesse a ser removido/alterado em index.ts sem querer).
 */
export function buildIndicacoesResponse(rows: readonly IndicacaoJoinRow[]): MinhasIndicacoesResponse {
  const indicacoes: IndicacaoItem[] = []
  for (const row of rows) {
    if (row.status !== "atribuida") continue
    if (!row.leads) continue
    const situacao = mapSituacao(row.leads.status, row.leads.etapa_pos_aprovacao)
    const { recompensa_situacao, recompensa_valor_centavos } = mapRecompensa(situacao, pickRecompensa(row.recompensas_embaixadoras))
    indicacoes.push({
      nome: row.leads.nome,
      situacao,
      indicada_em: row.primeira_atribuicao_em,
      recompensa_situacao,
      recompensa_valor_centavos,
    })
  }
  indicacoes.sort((a, b) => new Date(b.indicada_em).getTime() - new Date(a.indicada_em).getTime())
  // Totais = só SOMA de valores já gravados no banco (nunca recalcula a regra).
  let a_receber_centavos = 0
  let recebido_centavos = 0
  for (const item of indicacoes) {
    if (item.recompensa_situacao === "a_receber") a_receber_centavos += item.recompensa_valor_centavos ?? 0
    if (item.recompensa_situacao === "recebida") recebido_centavos += item.recompensa_valor_centavos ?? 0
  }
  return { total: indicacoes.length, indicacoes, a_receber_centavos, recebido_centavos }
}
