// IMPLEMENTATION-EMBAIXADORAS-E3.3 — lógica pura (sem React) de marcar a
// recompensa como paga/cancelada no Admin. Testável via node:test.
import type { IndicacaoAdmin } from "../hooks/useIndicacoesAdmin"

export class RecompensaAcaoError extends Error {}

export const RECOMPENSA_UNEXPECTED_ERROR = "Não foi possível salvar agora. Tente novamente em instantes."
export const MOTIVO_MIN = 5
export const MOTIVO_MAX = 300

const MESSAGES: Record<string, string> = {
  data_pagamento_invalida: "Informe uma data do Pix válida.",
  data_pagamento_futura: "A data do Pix não pode ser no futuro.",
  data_anterior_confirmacao: "A data do Pix não pode ser antes da confirmação da entrega.",
  motivo_obrigatorio: `Escreva o motivo do cancelamento (mínimo ${MOTIVO_MIN} letras).`,
  motivo_muito_longo: `O motivo pode ter no máximo ${MOTIVO_MAX} letras.`,
  recompensa_nao_encontrada: "Esta recompensa não foi encontrada. Atualize a página.",
  ja_paga: "Esta recompensa já estava marcada como paga. Atualize a página.",
  ja_cancelada: "Esta recompensa já estava cancelada. Atualize a página.",
  status_mudou: "Outra pessoa alterou esta recompensa agora mesmo. Atualize a página.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
  forbidden: "Somente a equipe pode alterar recompensas.",
}

export function recompensaAcaoErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || RECOMPENSA_UNEXPECTED_ERROR
}

/** Só recompensa `disponivel` (a pagar) pode ser marcada como paga ou cancelada. */
export function podeAlterarRecompensa(indicacao: IndicacaoAdmin): boolean {
  return indicacao.recompensa?.status === "disponivel"
}

export function motivoValido(motivo: string): boolean {
  const len = motivo.trim().length
  return len >= MOTIVO_MIN && len <= MOTIVO_MAX
}
