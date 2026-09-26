// IMPLEMENTATION-EMBAIXADORAS-E3.2 — lógica pura (sem React) da confirmação
// do primeiro mostruário no Admin. Testável via node:test.

export class ConfirmMostruarioError extends Error {}

export const CONFIRM_UNEXPECTED_ERROR = "Não foi possível confirmar agora. Tente novamente em instantes."

const MESSAGES: Record<string, string> = {
  data_entrega_invalida: "Informe uma data de entrega válida.",
  data_entrega_futura: "A data de entrega não pode ser no futuro.",
  data_anterior_indicacao: "A data de entrega não pode ser antes do dia da indicação.",
  indicacao_nao_encontrada: "Esta indicação não foi encontrada. Atualize a página.",
  indicacao_invalidada: "Esta indicação foi invalidada e não gera recompensa.",
  lead_removido: "A candidata desta indicação foi removida do sistema.",
  candidata_nao_aprovada: "A candidata ainda não está aprovada no recrutamento.",
  candidata_desistiu: "A candidata desistiu e não gera recompensa.",
  ja_confirmada: "A entrega desta indicação já tinha sido confirmada. Atualize a página.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
  forbidden: "Somente a equipe pode confirmar entregas.",
}

/** Nunca mostra código técnico cru: código conhecido -> frase; resto -> mensagem genérica. */
export function confirmMostruarioErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || CONFIRM_UNEXPECTED_ERROR
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — valor inicial do campo de data. */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now)
}
