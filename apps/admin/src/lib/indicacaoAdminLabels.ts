// IMPLEMENTATION-EMBAIXADORAS-E3.1 — rótulos da lista de indicações do
// Admin. Lógica pura (sem React), testável via node:test.
import type { EtapaPosAprovacao, IndicacaoAdmin, LeadStatus, RecompensaStatus } from "@/hooks/useIndicacoesAdmin"

export type BadgeVariant = "gold" | "success" | "secondary" | "destructive" | "outline"

export interface BadgeLabel {
  label: string
  variant: BadgeVariant
}

const LEAD_STATUS: Record<LeadStatus, BadgeLabel> = {
  novo: { label: "Nova", variant: "outline" },
  em_analise: { label: "Em análise", variant: "gold" },
  aprovada: { label: "Aprovada", variant: "success" },
  reprovada: { label: "Reprovada", variant: "destructive" },
}

const ETAPA: Record<Exclude<EtapaPosAprovacao, null>, string> = {
  contatada: "Contatada",
  confirmada: "Confirmada",
  aguardando_tania: "Aguardando Tania",
  ativa: "Ativa",
  desistiu: "Desistiu",
}

/** Situação da candidata no recrutamento. Lead apagado vira "Lead removido". */
export function candidataSituacao(indicacao: IndicacaoAdmin): BadgeLabel & { detalhe: string | null } {
  const candidata = indicacao.candidata
  if (!candidata) return { label: "Lead removido", variant: "secondary", detalhe: null }
  const base = LEAD_STATUS[candidata.status]
  const detalhe = candidata.status === "aprovada" && candidata.etapa_pos_aprovacao ? ETAPA[candidata.etapa_pos_aprovacao] : null
  return { ...base, detalhe }
}

const RECOMPENSA: Record<RecompensaStatus, BadgeVariant> = {
  disponivel: "gold",
  pago: "success",
  cancelada: "secondary",
}

const RECOMPENSA_LABEL: Record<RecompensaStatus, string> = {
  disponivel: "a pagar",
  pago: "paga",
  cancelada: "cancelada",
}

export function formatCentavos(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * E3.2 — a candidata indicada ainda pode receber o primeiro mostruário?
 * Candidata reprovada, que desistiu ou com lead removido nunca vai receber,
 * então a recompensa "não se aplica". Espelha só pra EXIBIÇÃO a regra que
 * `confirm-primeiro-mostruario/logic.ts` (checkEligibility) aplica de fato.
 */
function candidataPodeReceberMostruario(indicacao: IndicacaoAdmin): boolean {
  const candidata = indicacao.candidata
  if (!candidata) return false
  if (candidata.status === "reprovada") return false
  if (candidata.etapa_pos_aprovacao === "desistiu") return false
  return true
}

/** E3.2 — mostra o botão "Confirmar entrega" só quando a confirmação faz sentido. */
export function podeConfirmarMostruario(indicacao: IndicacaoAdmin): boolean {
  return (
    indicacao.status === "atribuida" &&
    indicacao.recompensa === null &&
    indicacao.candidata?.status === "aprovada" &&
    candidataPodeReceberMostruario(indicacao)
  )
}

/**
 * Situação da recompensa. Sem linha em `recompensas_embaixadoras` =
 * primeiro mostruário ainda não confirmado.
 */
export function recompensaSituacao(indicacao: IndicacaoAdmin): BadgeLabel {
  if (indicacao.status === "invalidada") return { label: "Indicação invalidada", variant: "secondary" }
  const recompensa = indicacao.recompensa
  if (!recompensa && !candidataPodeReceberMostruario(indicacao)) return { label: "Não se aplica", variant: "secondary" }
  if (!recompensa) return { label: "Aguardando 1º mostruário", variant: "outline" }
  return {
    label: `${formatCentavos(recompensa.valor_centavos)} ${RECOMPENSA_LABEL[recompensa.status]}`,
    variant: RECOMPENSA[recompensa.status],
  }
}
