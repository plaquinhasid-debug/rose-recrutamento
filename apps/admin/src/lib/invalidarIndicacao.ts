// IMPLEMENTATION-EMBAIXADORAS-E3.5 — lógica pura (sem React) de invalidar
// indicação no Admin. Testável via node:test.
import type { IndicacaoAdmin } from "../hooks/useIndicacoesAdmin"

export class InvalidarIndicacaoError extends Error {}

export const INVALIDAR_UNEXPECTED_ERROR = "Não foi possível invalidar agora. Tente novamente em instantes."

const MESSAGES: Record<string, string> = {
  motivo_obrigatorio: "Escreva o motivo (mínimo 5 letras).",
  motivo_muito_longo: "O motivo pode ter no máximo 300 letras.",
  indicacao_nao_encontrada: "Esta indicação não foi encontrada. Atualize a página.",
  ja_invalidada: "Esta indicação já estava invalidada. Atualize a página.",
  recompensa_a_pagar: "Esta indicação tem R$ 40 a pagar. Cancele a recompensa primeiro.",
  recompensa_paga: "Esta indicação já teve a recompensa paga e não pode ser invalidada.",
  status_mudou: "Esta indicação mudou agora mesmo. Atualize a página.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
  forbidden: "Somente a equipe pode invalidar indicações.",
}

export function invalidarErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || INVALIDAR_UNEXPECTED_ERROR
}

/** Mostra "Invalidar" só quando o servidor aceitaria: atribuída e sem recompensa a pagar/paga. */
export function podeInvalidar(indicacao: IndicacaoAdmin): boolean {
  if (indicacao.status !== "atribuida") return false
  const recompensa = indicacao.recompensa
  return !recompensa || recompensa.status === "cancelada"
}
