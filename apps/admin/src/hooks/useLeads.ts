import { useQuery } from "@tanstack/react-query"
import type { ProximaAcao } from "@tania-joias/shared"

import { supabase } from "@/lib/supabase"
import type { Lead, LeadFiltersState } from "@/types"

export const DEFAULT_LEAD_FILTERS: LeadFiltersState = {
  search: "",
  status: "todos",
  perfilComercial: "todos",
  origem: "todos",
  cidade: "todos",
  dateFrom: null,
  dateTo: null,
}

/** Lead com o histórico de análises e a Ficha de Aprovação embutidos — só o suficiente pro Kanban/lista. */
export type LeadWithAnalysis = Lead & {
  ai_analysis: { proxima_acao: string | null; created_at: string }[]
  leads_ficha: {
    id: string
    token: string
    criado_em: string
    preenchido_em: string | null
    whatsapp_enviado_em: string | null
    contato_manual_em: string | null
  }[]
}

/** Uma lead pode ter mais de uma `ai_analysis` (reprocessamento) — a mais recente é a que vale. */
export function latestProximaAcao(lead: LeadWithAnalysis): ProximaAcao | null {
  const latest = [...lead.ai_analysis].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return (latest?.proxima_acao as ProximaAcao | undefined) ?? null
}

/** `null` = ainda não gerou o link da ficha — não mostra selo nenhum no card. */
export function fichaStatusForLead(lead: LeadWithAnalysis): "pendente" | "preenchida" | null {
  const ficha = lead.leads_ficha[0]
  if (!ficha) return null
  return ficha.preenchido_em ? "preenchida" : "pendente"
}

/** Linha da Ficha ainda pendente (link gerado, não preenchida) — `null` se não existe ficha ou já foi preenchida. */
export function fichaPendente(lead: LeadWithAnalysis): LeadWithAnalysis["leads_ficha"][number] | null {
  const ficha = lead.leads_ficha[0]
  if (!ficha || ficha.preenchido_em) return null
  return ficha
}



async function fetchLeads(filters: LeadFiltersState): Promise<LeadWithAnalysis[]> {
  // IMPLEMENTATION-CRM-002A — string do select precisa ser um literal único
  // (nunca concatenado com `+`): o parser de tipos do supabase-js resolve os
  // embeds a partir do tipo literal exato da string, e concatenação perde
  // esse literal (cai em `GenericStringError` na compilação).
  let query = supabase
    .from("leads")
    .select(
      "*, ai_analysis(proxima_acao, created_at), leads_ficha(id, token, criado_em, preenchido_em, whatsapp_enviado_em, contato_manual_em)",
    )
    .order("created_at", { ascending: false })

  if (filters.status !== "todos") {
    query = query.eq("status", filters.status as Lead["status"])
  }
  if (filters.perfilComercial !== "todos") {
    query = query.eq(
      "perfil_comercial",
      filters.perfilComercial as NonNullable<Lead["perfil_comercial"]>,
    )
  }
  if (filters.origem !== "todos") {
    query = query.eq("origem", filters.origem)
  }
  if (filters.cidade !== "todos") {
    query = query.eq("cidade", filters.cidade)
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`)
  }
  if (filters.search.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, "")
    query = query.or(`nome.ilike.%${term}%,telefone.ilike.%${term}%,cidade.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export function useLeads(filters: LeadFiltersState) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: () => fetchLeads(filters),
    staleTime: 15_000,
  })
}

export function useLeadOptions() {
  return useQuery({
    queryKey: ["leads", "options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("origem, cidade")
      if (error) throw error
      const origens = new Set<string>()
      const cidades = new Set<string>()
      for (const row of data ?? []) {
        if (row.origem) origens.add(row.origem)
        if (row.cidade) cidades.add(row.cidade)
      }
      return {
        origens: Array.from(origens).sort(),
        cidades: Array.from(cidades).sort(),
      }
    },
    staleTime: 60_000,
  })
}
