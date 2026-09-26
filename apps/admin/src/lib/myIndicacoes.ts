// IMPLEMENTATION-EMBAIXADORAS-E2.9 — lógica pura (sem React/AuthContext) de
// busca/parsing das indicações da Embaixadora autenticada atual, via a
// Edge Function dedicada `get-my-indicacoes`. Mesmo padrão de
// `lib/myEmbaixadora.ts`: nunca importa `@/context/AuthContext` (um
// `.tsx`), o que permite testar `fetchMinhasIndicacoes`/
// `parseMinhasIndicacoes` direto via node:test sem precisar de React/DOM.
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export type SituacaoIndicacao = "em_analise" | "aprovada" | "nao_aprovada"

/** E3.4 — situação pública da recompensa de R$40 (cancelada nunca chega aqui). */
export type RecompensaSituacao = "aguardando_mostruario" | "a_receber" | "recebida"

export interface IndicacaoItem {
  nome: string
  situacao: SituacaoIndicacao
  indicada_em: string
  recompensa_situacao: RecompensaSituacao | null
  recompensa_valor_centavos: number | null
}

export interface MinhasIndicacoes {
  total: number
  indicacoes: IndicacaoItem[]
  a_receber_centavos: number
  recebido_centavos: number
}

const VAZIO: MinhasIndicacoes = { total: 0, indicacoes: [], a_receber_centavos: 0, recebido_centavos: 0 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSituacaoIndicacao(value: unknown): value is SituacaoIndicacao {
  return value === "em_analise" || value === "aprovada" || value === "nao_aprovada"
}

function isRecompensaSituacao(value: unknown): value is RecompensaSituacao {
  return value === "aguardando_mostruario" || value === "a_receber" || value === "recebida"
}

function centavosOuZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0
}

function parseIndicacaoItem(value: unknown): IndicacaoItem | null {
  if (
    !isRecord(value) ||
    typeof value.nome !== "string" || !value.nome ||
    typeof value.indicada_em !== "string" || !value.indicada_em ||
    !isSituacaoIndicacao(value.situacao)
  ) {
    return null
  }
  // E3.4 — recompensa ausente/malformada vira "sem informação" (null), nunca derruba o item.
  const recompensaSituacao = isRecompensaSituacao(value.recompensa_situacao) ? value.recompensa_situacao : null
  const valor = typeof value.recompensa_valor_centavos === "number" && Number.isInteger(value.recompensa_valor_centavos)
    ? value.recompensa_valor_centavos
    : null
  return {
    nome: value.nome,
    situacao: value.situacao,
    indicada_em: value.indicada_em,
    recompensa_situacao: recompensaSituacao,
    recompensa_valor_centavos: recompensaSituacao === "a_receber" || recompensaSituacao === "recebida" ? valor : null,
  }
}

/**
 * Projeta só o contrato mínimo — nunca repassa campos extras que viessem na
 * resposta (mesmo espírito de `parseMinhaEmbaixadora` em lib/myEmbaixadora.ts).
 * Resposta malformada, ou qualquer item individual malformado, é descartado
 * silenciosamente (nunca lança) — o Portal deve continuar funcionando mesmo
 * que um item futuro venha inesperado.
 */
export function parseMinhasIndicacoes(value: unknown): MinhasIndicacoes | null {
  if (!isRecord(value) || typeof value.total !== "number" || !Array.isArray(value.indicacoes)) {
    return null
  }
  const indicacoes: IndicacaoItem[] = []
  for (const raw of value.indicacoes) {
    const item = parseIndicacaoItem(raw)
    if (item) indicacoes.push(item)
  }
  return {
    total: value.total,
    indicacoes,
    a_receber_centavos: centavosOuZero(value.a_receber_centavos),
    recebido_centavos: centavosOuZero(value.recebido_centavos),
  }
}

/** E3.4 — "R$ 40,00" a partir de centavos (só formatação, nunca cálculo de regra). */
export function formatCentavos(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** E3.4 — texto da recompensa de cada indicação no Portal. `null` = não mostra nada. */
export function recompensaTexto(item: Pick<IndicacaoItem, "recompensa_situacao" | "recompensa_valor_centavos">): string | null {
  if (item.recompensa_situacao === "aguardando_mostruario") return "Seu prêmio: aguardando a entrega do mostruário"
  if (item.recompensa_situacao === "a_receber") return `Seu prêmio: ${formatCentavos(item.recompensa_valor_centavos ?? 0)} a receber`
  if (item.recompensa_situacao === "recebida") return `Seu prêmio: ${formatCentavos(item.recompensa_valor_centavos ?? 0)} recebido`
  return null
}

type FunctionsInvoke = typeof supabase.functions.invoke

/**
 * `404` (embaixadora_nao_encontrada) vira `{ total: 0, indicacoes: [] }` —
 * mesmo espírito de `fetchMinhaEmbaixadora` tratar 404 como "sem Portal",
 * nunca como erro. Na prática este caminho não deveria ser exercitado no
 * Portal (a rota já exige Embaixadora ativa antes de chegar aqui), mas
 * mantém o mesmo comportamento defensivo caso o status mude entre o
 * carregamento da identidade e desta chamada. Qualquer outro erro HTTP
 * (401/403/500) ou falha de rede propaga (throw) de verdade.
 */
export async function fetchMinhasIndicacoes(
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<MinhasIndicacoes> {
  const { data, error } = await invoke<unknown>("get-my-indicacoes", { method: "GET" })
  if (error) {
    if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 404) {
      return { ...VAZIO, indicacoes: [] }
    }
    throw error
  }
  return parseMinhasIndicacoes(data) ?? { ...VAZIO, indicacoes: [] }
}
