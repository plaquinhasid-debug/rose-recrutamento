// logic.ts — lógica pura (sem I/O) de `update-recompensa-status` (E3.3).
// Testável direto via node:test; index.ts é o único ponto de I/O.
//
// Fecha o ciclo do dinheiro da recompensa de R$40:
//   disponivel -> pago       (a equipe fez o Pix; informa a data do Pix)
//   disponivel -> cancelada  (engano/estorno; motivo obrigatório)
// `pago` e `cancelada` são FINAIS: nada sai deles por aqui (o CHECK da
// tabela também impede pago+cancelada ao mesmo tempo). O sistema NÃO faz
// o Pix — só registra que ele foi feito.
//
// Tipos duplicados localmente de propósito — cada Edge Function é um
// bundle isolado (ver _shared/phone.ts).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export const MOTIVO_MIN = 5
export const MOTIVO_MAX = 300

export type RecompensaStatusRaw = "disponivel" | "pago" | "cancelada"

export type AcaoRecompensa =
  | { acao: "pagar"; indicacaoId: string; dataPagamento: string; pagoEm: string }
  | { acao: "cancelar"; indicacaoId: string; motivo: string }

export type ValidationResult = { valid: true; payload: AcaoRecompensa } | { valid: false; reason: string }

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
export function todayInBrazil(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now)
}

function isRealDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Lê SÓ indicacao_id, acao e (data_pagamento | motivo). Nunca valor nem status vindos do cliente. */
export function validateAcaoPayload(body: unknown, now: Date): ValidationResult {
  if (!body || typeof body !== "object") return { valid: false, reason: "payload_invalido" }
  const record = body as Record<string, unknown>

  const indicacaoId = record.indicacao_id
  if (typeof indicacaoId !== "string" || !UUID_RE.test(indicacaoId)) return { valid: false, reason: "indicacao_id_invalido" }

  if (record.acao === "pagar") {
    const data = record.data_pagamento
    if (typeof data !== "string" || !isRealDate(data)) return { valid: false, reason: "data_pagamento_invalida" }
    if (data > todayInBrazil(now)) return { valid: false, reason: "data_pagamento_futura" }
    return { valid: true, payload: { acao: "pagar", indicacaoId, dataPagamento: data, pagoEm: `${data}T12:00:00-03:00` } }
  }

  if (record.acao === "cancelar") {
    const motivo = typeof record.motivo === "string" ? record.motivo.trim() : ""
    if (motivo.length < MOTIVO_MIN) return { valid: false, reason: "motivo_obrigatorio" }
    if (motivo.length > MOTIVO_MAX) return { valid: false, reason: "motivo_muito_longo" }
    return { valid: true, payload: { acao: "cancelar", indicacaoId, motivo } }
  }

  return { valid: false, reason: "acao_invalida" }
}

export interface RecompensaAtual {
  id: string
  status: RecompensaStatusRaw
  disponivel_em: string
}

export type Transition = { allowed: true } | { allowed: false; httpStatus: 400 | 409; reason: string }

/**
 * Só `disponivel` pode mudar. A trava final contra corrida (duas pessoas
 * clicando ao mesmo tempo) é o `WHERE status = 'disponivel'` do UPDATE em
 * index.ts — esta checagem só dá uma mensagem melhor antes.
 */
export function checkTransition(recompensa: RecompensaAtual, acao: AcaoRecompensa): Transition {
  if (recompensa.status === "pago") return { allowed: false, httpStatus: 409, reason: "ja_paga" }
  if (recompensa.status === "cancelada") return { allowed: false, httpStatus: 409, reason: "ja_cancelada" }
  if (acao.acao === "pagar") {
    // O Pix não pode ter sido feito antes de a recompensa existir.
    const diaDisponivel = todayInBrazil(new Date(recompensa.disponivel_em))
    if (acao.dataPagamento < diaDisponivel) return { allowed: false, httpStatus: 400, reason: "data_anterior_confirmacao" }
  }
  return { allowed: true }
}

export interface RecompensaAtualizada {
  id: string
  status: RecompensaStatusRaw
  valor_centavos: number
  pago_em: string | null
  cancelada_em: string | null
}

export function projectRecompensa(row: RecompensaAtualizada): RecompensaAtualizada {
  return {
    id: row.id,
    status: row.status,
    valor_centavos: row.valor_centavos,
    pago_em: row.pago_em,
    cancelada_em: row.cancelada_em,
  }
}
