// IMPLEMENTATION-EMBAIXADORAS-E3.1 — lista de indicações no Admin (equipe).
// Nunca lê `indicacoes_embaixadoras` direto (authenticated não tem acesso
// via PostgREST) — sempre via a Edge Function `list-indicacoes-admin`, que
// valida `getUser(jwt)` + `is_equipe()` e usa service_role só no servidor.
// Mesmo padrão de useEmbaixadoras.ts.
import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"

export type IndicacaoStatus = "atribuida" | "invalidada"
export type LeadStatus = "novo" | "em_analise" | "aprovada" | "reprovada"
export type EtapaPosAprovacao = "contatada" | "confirmada" | "aguardando_tania" | "ativa" | "desistiu" | null
export type RecompensaStatus = "disponivel" | "pago" | "cancelada"

/** Tipo local estreito — exatamente o que `list-indicacoes-admin` devolve. */
export interface IndicacaoAdmin {
  id: string
  status: IndicacaoStatus
  indicada_em: string
  codigo_referral_usado: string
  invalidada_em: string | null
  embaixadora: { id: string; nome: string } | null
  candidata: {
    lead_id: string
    nome: string
    cidade: string | null
    status: LeadStatus
    etapa_pos_aprovacao: EtapaPosAprovacao
  } | null
  recompensa: { status: RecompensaStatus; valor_centavos: number } | null
}

interface ListIndicacoesAdminResponse {
  indicacoes: IndicacaoAdmin[]
}

type FunctionsInvoke = typeof supabase.functions.invoke

/**
 * `invoke` injetável só pra teste. `method: "GET"` é OBRIGATÓRIO — o SDK usa
 * POST por padrão e a function só aceita GET/OPTIONS (ver useEmbaixadoras.ts).
 * Erro nunca é engolido: a página reage com `ErrorState` + retry.
 */
export async function fetchIndicacoesAdmin(
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<IndicacaoAdmin[]> {
  const { data, error } = await invoke<ListIndicacoesAdminResponse>("list-indicacoes-admin", {
    method: "GET",
  })
  if (error) throw error
  return data?.indicacoes ?? []
}

export function useIndicacoesAdmin() {
  return useQuery({
    queryKey: ["indicacoes-admin"],
    queryFn: () => fetchIndicacoesAdmin(),
    staleTime: 30_000,
  })
}
