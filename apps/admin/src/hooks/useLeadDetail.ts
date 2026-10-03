import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import { generateFichaLink } from "@/hooks/useLeadFicha"
import type { Answer, AiAnalysis, Lead } from "@/types"

async function fetchLead(id: string): Promise<Lead> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function fetchAnswers(leadId: string): Promise<Answer[]> {
  const { data, error } = await supabase
    .from("answers")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data ?? []
}

async function fetchAnalysis(leadId: string): Promise<AiAnalysis | null> {
  const { data, error } = await supabase
    .from("ai_analysis")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead(id as string),
    enabled: Boolean(id),
  })
}

export function useLeadAnswers(id: string | undefined) {
  return useQuery({
    queryKey: ["lead-answers", id],
    queryFn: () => fetchAnswers(id as string),
    enabled: Boolean(id),
  })
}

export function useLeadAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: ["lead-analysis", id],
    queryFn: () => fetchAnalysis(id as string),
    enabled: Boolean(id),
  })
}

interface UpdateLeadInput {
  id: string
  patch: Partial<Pick<Lead, "status" | "observacoes" | "etapa_pos_aprovacao" | "whatsapp">>
  /** Status da lead ANTES deste patch — usado só para decidir se o evento de aprovação deve disparar. */
  previousStatus?: Lead["status"]
  /**
   * RFC-INTELLIGENCE-006 — WhatsApp ATUAL da lead (`lead.whatsapp`), exigido
   * sempre que `patch.status` tenta virar "aprovada". Único ponto real que
   * protege a aprovação manual (Kanban e o botão "Aprovar" do
   * LeadDetailDrawer passam por aqui) contra mover uma lead sem WhatsApp
   * confirmado pra "aprovada" silenciosamente — mesma regra que já vale pra
   * aprovação automática do IPR em `finalize-candidate` (Abordagem A da
   * RFC-006). Não cria nenhuma constraint no banco; é só uma trava no
   * caminho executável real (ver RFC-006, seção 5.6).
   */
  leadWhatsapp?: boolean | null
}

/**
 * RFC-INTELLIGENCE-006 (ajustado após revisão de diff, decisão do Antonio) —
 * regra pura que decide se um `patch` pode seguir pra aprovação manual.
 * Extraída como função exportada (em vez de inline em `mutationFn`) só pra
 * ser testável em `useLeadDetail.examples.ts` sem precisar montar
 * Supabase/React Query.
 *
 * O gate protege só a PRIMEIRA transição para "aprovada" — quando
 * `previousStatus` já é "aprovada", o patch é uma movimentação interna do
 * pipeline pós-aprovação (Contatada/Confirmada/Aguardando Tania/Ativa via
 * `patchForPipelineColumn`, que sempre reenvia `status: "aprovada"` junto
 * com a nova `etapa_pos_aprovacao`) e nunca deve ser bloqueada por este
 * gate — mesmo critério que `onSuccess` abaixo já usa pra decidir se dispara
 * os efeitos colaterais de aprovação (Meta/WhatsApp/Ficha). Sem essa
 * distinção, uma lead já aprovada com `whatsapp` false/nulo (ex.: aprovada
 * antes desta regra existir) ficaria travada no Kanban, sem conseguir
 * avançar etapa, até alguém confirmar o WhatsApp dela manualmente — efeito
 * colateral não pretendido, encontrado na revisão do diff desta RFC.
 */
export function podeAprovarManualmente(
  patchStatus: UpdateLeadInput["patch"]["status"],
  previousStatus: Lead["status"] | undefined,
  leadWhatsapp: boolean | null | undefined,
): boolean {
  if (patchStatus !== "aprovada") return true
  if (previousStatus === "aprovada") return true
  return leadWhatsapp === true
}

export function useUpdateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch, previousStatus, leadWhatsapp }: UpdateLeadInput) => {
      if (!podeAprovarManualmente(patch.status, previousStatus, leadWhatsapp)) {
        throw new Error("Confirme que a candidata possui WhatsApp antes de aprová-la.")
      }
      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["lead", data.id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })

      // Pré-aprovação manual: avisa o Meta (otimização dos anúncios) e já
      // gera o link da ficha pra Carol/Ana enviarem pelo WhatsApp.
      if (variables.patch.status === "aprovada" && variables.previousStatus !== "aprovada") {
        supabase.functions
          .invoke("send-meta-lead-event", { body: { lead_id: data.id } })
          .then(({ error }) => {
            if (error) console.warn("[meta] falha ao enviar evento Lead", error)
          })

        generateFichaLink(data.id)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["lead-ficha", data.id] })
            void queryClient.invalidateQueries({ queryKey: ["leads"] })
          })
          .catch((err) => console.warn("[ficha] falha ao gerar link automaticamente", err))
      }
    },
  })
}
