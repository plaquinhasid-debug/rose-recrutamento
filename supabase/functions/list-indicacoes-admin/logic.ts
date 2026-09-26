// logic.ts — lógica pura (sem I/O) de `list-indicacoes-admin`. Mesmo
// padrão de list-ambassadors-admin/logic.ts: testável direto via
// node:test, nenhuma função aqui faz rede/banco. index.ts continua sendo
// o único ponto de I/O real (Supabase Auth, banco).
//
// E3.1 — lista de indicações no Admin (equipe). SOMENTE LEITURA; nunca
// cria/altera/apaga nada. É o pré-requisito da E3.2 (Tania confirmar o
// primeiro mostruário e gerar a recompensa): a equipe precisa VER as
// indicações antes de agir sobre elas.
//
// Tipos duplicados localmente de propósito (não importados de
// get-my-indicacoes/logic.ts): cada Edge Function é empacotada como bundle
// isolado — ver supabase/functions/_shared/phone.ts (E2.8).

export type IndicacaoStatusRaw = "atribuida" | "invalidada"
export type LeadStatusRaw = "novo" | "em_analise" | "aprovada" | "reprovada"
export type EtapaPosAprovacaoRaw = "contatada" | "confirmada" | "aguardando_tania" | "ativa" | "desistiu" | null
export type RecompensaStatusRaw = "disponivel" | "pago" | "cancelada"

interface RecompensaJoin {
  status: RecompensaStatusRaw
  valor_centavos: number
}

/**
 * Formato cru de uma linha vinda do embedded select do PostgREST
 * (`indicacoes_embaixadoras` -> `embaixadoras`, `leads`,
 * `recompensas_embaixadoras`). `leads` é `null` quando o lead foi apagado
 * (`ON DELETE SET NULL`). `recompensas_embaixadoras` pode chegar como
 * objeto, array ou null dependendo de como o PostgREST detecta a relação
 * 1:1 (UNIQUE em `indicacao_id`) — normalizado em `pickRecompensa`.
 */
export interface IndicacaoAdminJoinRow {
  id: string
  status: IndicacaoStatusRaw
  primeira_atribuicao_em: string
  codigo_referral_usado: string
  invalidada_em: string | null
  embaixadoras: { id: string; nome: string } | null
  leads: {
    id: string
    nome: string
    cidade: string | null
    status: LeadStatusRaw
    etapa_pos_aprovacao: EtapaPosAprovacaoRaw
  } | null
  recompensas_embaixadoras: RecompensaJoin | RecompensaJoin[] | null
}

/** Formato exato devolvido ao Admin. */
export interface IndicacaoAdminItem {
  id: string
  status: IndicacaoStatusRaw
  indicada_em: string
  codigo_referral_usado: string
  invalidada_em: string | null
  embaixadora: { id: string; nome: string } | null
  candidata: {
    lead_id: string
    nome: string
    cidade: string | null
    status: LeadStatusRaw
    etapa_pos_aprovacao: EtapaPosAprovacaoRaw
  } | null
  recompensa: { status: RecompensaStatusRaw; valor_centavos: number } | null
}

function pickRecompensa(value: IndicacaoAdminJoinRow["recompensas_embaixadoras"]): RecompensaJoin | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

/**
 * DEFESA EM PROFUNDIDADE (mesmo padrão de list-ambassadors-admin): projeção
 * campo a campo, nunca spread. Mesmo que o SELECT em index.ts passe a
 * trazer uma coluna a mais por engano (ex.: telefone da candidata), ela
 * nunca sai daqui.
 *
 * Diferente do Portal (get-my-indicacoes), a equipe vê TODAS as indicações,
 * inclusive invalidadas e com lead removido — é a visão de controle.
 */
export function projectIndicacaoAdmin(row: IndicacaoAdminJoinRow): IndicacaoAdminItem {
  const recompensa = pickRecompensa(row.recompensas_embaixadoras)
  return {
    id: row.id,
    status: row.status,
    indicada_em: row.primeira_atribuicao_em,
    codigo_referral_usado: row.codigo_referral_usado,
    invalidada_em: row.invalidada_em,
    embaixadora: row.embaixadoras ? { id: row.embaixadoras.id, nome: row.embaixadoras.nome } : null,
    candidata: row.leads
      ? {
          lead_id: row.leads.id,
          nome: row.leads.nome,
          cidade: row.leads.cidade,
          status: row.leads.status,
          etapa_pos_aprovacao: row.leads.etapa_pos_aprovacao,
        }
      : null,
    recompensa: recompensa ? { status: recompensa.status, valor_centavos: recompensa.valor_centavos } : null,
  }
}

/** Reordena por data de indicação DESC (defesa contra um ORDER BY alterado em index.ts). */
export function projectIndicacoesAdmin(rows: readonly IndicacaoAdminJoinRow[]): IndicacaoAdminItem[] {
  return rows
    .map(projectIndicacaoAdmin)
    .sort((a, b) => new Date(b.indicada_em).getTime() - new Date(a.indicada_em).getTime())
}
