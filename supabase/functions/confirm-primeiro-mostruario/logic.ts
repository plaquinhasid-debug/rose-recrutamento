// logic.ts — lógica pura (sem I/O) de `confirm-primeiro-mostruario` (E3.2).
// Testável direto via node:test; index.ts é o único ponto de I/O.
//
// REGRA DE NEGÓCIO (decidida pelo dono em 2026-09-26):
// - "Primeiro mostruário" = quando o mostruário é ENTREGUE à vendedora
//   indicada. A equipe informa a data da entrega.
// - A confirmação cria a linha em `recompensas_embaixadoras`, que nasce
//   `disponivel` (R$40 a pagar via Pix). O VALOR nunca é calculado aqui:
//   vem do DEFAULT da coluna `valor_centavos` no banco (4000).
// - Só a conta da equipe confirma (is_equipe; a conta é compartilhada com a
//   Tania — não há como distinguir pessoa).
//
// Tipos duplicados localmente de propósito — cada Edge Function é um
// bundle isolado (ver _shared/phone.ts).

export type IndicacaoStatusRaw = "atribuida" | "invalidada"
export type LeadStatusRaw = "novo" | "em_analise" | "aprovada" | "reprovada"
export type EtapaPosAprovacaoRaw = "contatada" | "confirmada" | "aguardando_tania" | "ativa" | "desistiu" | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface ConfirmPayload {
  indicacaoId: string
  /** Timestamp ISO do meio-dia (horário de Brasília) da data informada — evita a data "voltar um dia" por fuso. */
  primeiroMostruarioEm: string
  dataEntrega: string
}

export type ValidationResult = { valid: true; payload: ConfirmPayload } | { valid: false; reason: string }

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

/** Lê SÓ `indicacao_id` e `data_entrega` do body. Nada de valor, status ou Embaixadora. */
export function validateConfirmPayload(body: unknown, now: Date): ValidationResult {
  if (!body || typeof body !== "object") return { valid: false, reason: "payload_invalido" }
  const record = body as Record<string, unknown>

  const indicacaoId = record.indicacao_id
  if (typeof indicacaoId !== "string" || !UUID_RE.test(indicacaoId)) return { valid: false, reason: "indicacao_id_invalido" }

  const dataEntrega = record.data_entrega
  if (typeof dataEntrega !== "string" || !isRealDate(dataEntrega)) return { valid: false, reason: "data_entrega_invalida" }
  if (dataEntrega > todayInBrazil(now)) return { valid: false, reason: "data_entrega_futura" }

  return {
    valid: true,
    payload: { indicacaoId, dataEntrega, primeiroMostruarioEm: `${dataEntrega}T12:00:00-03:00` },
  }
}

export interface IndicacaoParaConfirmar {
  id: string
  status: IndicacaoStatusRaw
  primeira_atribuicao_em: string
  lead: { status: LeadStatusRaw; etapa_pos_aprovacao: EtapaPosAprovacaoRaw } | null
  tem_recompensa: boolean
}

export type Eligibility = { eligible: true } | { eligible: false; httpStatus: 400 | 409; reason: string }

/**
 * Fail-closed: só confirma quando TUDO bate. A trava final contra duplicidade
 * é o UNIQUE em `recompensas_embaixadoras.indicacao_id` (tratado em
 * handler.ts como 409) — esta checagem só dá uma mensagem melhor antes.
 */
export function checkEligibility(indicacao: IndicacaoParaConfirmar, dataEntrega: string): Eligibility {
  if (indicacao.status !== "atribuida") return { eligible: false, httpStatus: 409, reason: "indicacao_invalidada" }
  if (!indicacao.lead) return { eligible: false, httpStatus: 409, reason: "lead_removido" }
  if (indicacao.lead.status !== "aprovada") return { eligible: false, httpStatus: 409, reason: "candidata_nao_aprovada" }
  if (indicacao.lead.etapa_pos_aprovacao === "desistiu") return { eligible: false, httpStatus: 409, reason: "candidata_desistiu" }
  if (indicacao.tem_recompensa) return { eligible: false, httpStatus: 409, reason: "ja_confirmada" }
  // A entrega não pode ser antes do dia em que a candidata foi indicada.
  const diaIndicacao = todayInBrazil(new Date(indicacao.primeira_atribuicao_em))
  if (dataEntrega < diaIndicacao) return { eligible: false, httpStatus: 400, reason: "data_anterior_indicacao" }
  return { eligible: true }
}

export interface RecompensaCriada {
  id: string
  status: "disponivel" | "pago" | "cancelada"
  valor_centavos: number
  primeiro_mostruario_em: string
}

export function projectRecompensa(row: RecompensaCriada): RecompensaCriada {
  return {
    id: row.id,
    status: row.status,
    valor_centavos: row.valor_centavos,
    primeiro_mostruario_em: row.primeiro_mostruario_em,
  }
}
