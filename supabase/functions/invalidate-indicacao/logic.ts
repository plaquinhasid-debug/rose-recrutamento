// logic.ts — lógica pura (sem I/O) de `invalidate-indicacao` (E3.5).
// Testável direto via node:test; index.ts é o único ponto de I/O.
//
// A equipe invalida uma indicação (ex.: indicação de teste, fraude,
// candidata que já era da equipe). Efeito: `status = 'invalidada'` +
// quando/quem/motivo. A indicação some do Portal da Embaixadora e não gera
// recompensa. Nunca apaga nada — o histórico fica.
//
// Recompensa vinculada:
// - nenhuma ou `cancelada` -> pode invalidar;
// - `disponivel` (a pagar)  -> bloqueia: cancelar a recompensa primeiro;
// - `pago`                  -> bloqueia: dinheiro já saiu, invalidar criaria
//                              histórico inconsistente.
//
// Tipos duplicados localmente de propósito — cada Edge Function é um
// bundle isolado (ver _shared/phone.ts).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MOTIVO_MIN = 5
export const MOTIVO_MAX = 300

export type IndicacaoStatusRaw = "atribuida" | "invalidada"
export type RecompensaStatusRaw = "disponivel" | "pago" | "cancelada"

export type ValidationResult =
  | { valid: true; payload: { indicacaoId: string; motivo: string } }
  | { valid: false; reason: string }

/** Lê SÓ indicacao_id e motivo do body. */
export function validateInvalidatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { valid: false, reason: "payload_invalido" }
  const record = body as Record<string, unknown>
  const indicacaoId = record.indicacao_id
  if (typeof indicacaoId !== "string" || !UUID_RE.test(indicacaoId)) return { valid: false, reason: "indicacao_id_invalido" }
  const motivo = typeof record.motivo === "string" ? record.motivo.trim() : ""
  if (motivo.length < MOTIVO_MIN) return { valid: false, reason: "motivo_obrigatorio" }
  if (motivo.length > MOTIVO_MAX) return { valid: false, reason: "motivo_muito_longo" }
  return { valid: true, payload: { indicacaoId, motivo } }
}

export interface IndicacaoParaInvalidar {
  id: string
  status: IndicacaoStatusRaw
  recompensa_status: RecompensaStatusRaw | null
}

export type Eligibility = { eligible: true } | { eligible: false; reason: string }

export function checkInvalidation(indicacao: IndicacaoParaInvalidar): Eligibility {
  if (indicacao.status === "invalidada") return { eligible: false, reason: "ja_invalidada" }
  if (indicacao.recompensa_status === "disponivel") return { eligible: false, reason: "recompensa_a_pagar" }
  if (indicacao.recompensa_status === "pago") return { eligible: false, reason: "recompensa_paga" }
  return { eligible: true }
}
