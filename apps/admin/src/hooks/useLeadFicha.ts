import { BRAND } from "@tania-joias/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import type { LeadFicha } from "@/types"

// URL pública da Landing — é lá que mora a página `/ficha/:token` que a
// candidata preenche. Preparado pra automação futura: gerar a linha é só um
// insert (RLS de `authenticated`), então tanto este botão manual quanto um
// gatilho automático na aprovação podem chamar `useGenerateFichaLink` do
// mesmo jeito.
const LANDING_URL = BRAND.siteUrl

export function fichaLinkUrl(token: string): string {
  return `${LANDING_URL}/ficha/${token}`
}

async function fetchLeadFicha(leadId: string): Promise<LeadFicha | null> {
  const { data, error } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function useLeadFicha(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-ficha", leadId],
    queryFn: () => fetchLeadFicha(leadId as string),
    enabled: Boolean(leadId),
  })
}

/**
 * Gera o link da Ficha (ou devolve o já existente, se por algum motivo já
 * tiver sido gerado) e avança o card pra "Contato manual / Ficha pendente"
 * no Kanban — só significa que a Ficha existe, nunca que o WhatsApp foi
 * enviado ou entregue (ver `deriveWhatsappDeliveryStatus`). Chamada tanto
 * pelo botão manual (`useGenerateFichaLink`) quanto automaticamente assim
 * que uma lead vira "aprovada" (`useLeadDetail.ts`).
 */
export async function generateFichaLink(leadId: string): Promise<LeadFicha> {
  const { data: existing } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from("leads_ficha")
    .insert({ lead_id: leadId })
    .select("*")
    .single()
  if (error) throw error

  // Avança o card pra "Contato manual / Ficha pendente" no Kanban sozinho —
  // só quando ela ainda estava parada em "Aprovada" (`.is(..., null)` evita
  // empurrar pra trás uma lead que já tinha avançado mais, ex.: se o link
  // for gerado de novo por engano).
  await supabase
    .from("leads")
    .update({ etapa_pos_aprovacao: "contatada" })
    .eq("id", leadId)
    .is("etapa_pos_aprovacao", null)

  return data
}

export function useGenerateFichaLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: generateFichaLink,
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-ficha", data.lead_id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
      void queryClient.invalidateQueries({ queryKey: ["lead", data.lead_id] })
    },
  })
}

/**
 * IMPLEMENTATION-CRM-002A — registra que um OPERADOR HUMANO confirmou ter
 * feito contato manual com a candidata. Só é chamada por uma ação explícita
 * no Admin (nunca como efeito colateral de abrir o WhatsApp ou copiar o
 * link) — ver `contato_manual_em` na migration
 * `20260818163000_add_leads_ficha_contato_manual.sql`.
 *
 * Idempotente por construção: o filtro `is("contato_manual_em", null)`
 * garante que uma segunda chamada nunca sobrescreve o timestamp original —
 * se a linha já tiver `contato_manual_em`, o UPDATE afeta 0 linhas e a
 * função busca e devolve o valor já existente, sem erro.
 */
export async function markManualContact(fichaId: string): Promise<LeadFicha> {
  const { data, error } = await supabase
    .from("leads_ficha")
    .update({ contato_manual_em: new Date().toISOString() })
    .eq("id", fichaId)
    .is("contato_manual_em", null)
    .select("*")
    .maybeSingle()
  if (error) throw error
  if (data) {
    await moverParaFichaEnviada(data.lead_id)
    return data
  }

  // 0 linhas afetadas = já tinha contato_manual_em preenchido; devolve o
  // valor real já gravado, sem sobrescrever.
  const { data: existing, error: fetchError } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("id", fichaId)
    .single()
  if (fetchError) throw fetchError
  return existing
}

/**
 * Rose: ficha enviada (WhatsApp ou link copiado) → card vai pra "Ficha
 * Enviada". Vale pra aprovada pela Sofia e pra "Em análise" (mandar a ficha a
 * uma candidata em análise = a equipe decidiu seguir com ela). Nunca puxa pra
 * trás um card que já avançou além de "Ficha Enviada".
 */
async function moverParaFichaEnviada(leadId: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ status: "aprovada", etapa_pos_aprovacao: "contatada" })
    .eq("id", leadId)
    .in("status", ["aprovada", "em_analise", "novo"])
    .or("etapa_pos_aprovacao.is.null,etapa_pos_aprovacao.eq.contatada")
  if (error) console.warn("[ficha] falha ao mover card pra Ficha Enviada", error)
}

export function useMarkManualContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markManualContact,
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-ficha", data.lead_id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
    },
  })
}
