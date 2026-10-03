import { useState } from "react"
import { useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmptyState } from "@/components/common/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { KanbanBoard } from "@/components/crm/KanbanBoard"
import { ResumoDoMes } from "@/components/crm/ResumoDoMes"
import { Input } from "@/components/ui/input"
import { LeadDetailDrawer } from "@/components/leads/LeadDetailDrawer"
import { DEFAULT_LEAD_FILTERS, useLeads } from "@/hooks/useLeads"
import { useRealtimeLeads } from "@/hooks/useRealtimeLeads"
import type { Lead } from "@/types"

// IMPLEMENTATION-CRM-004B — deep link `/crm?lead={id}`: a URL é a fonte de
// verdade de qual candidata está aberta no Drawer (não um useState separado)
// — assim, um link de notificação (WhatsApp -> "Analisar candidata") abre
// direto na candidata certa, e fechar o Drawer sempre limpa a URL de volta.
const LEAD_PARAM = "lead"

export default function CrmPage() {
  useRealtimeLeads()
  const { data: leads, isLoading, isError, refetch } = useLeads(DEFAULT_LEAD_FILTERS)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedLeadId = searchParams.get(LEAD_PARAM)
  const [busca, setBusca] = useState("")
  const termo = busca.trim().toLowerCase()
  const leadsFiltradas = termo
    ? (leads ?? []).filter((l) =>
        [l.nome, l.telefone, l.cidade, l.profissao].some((v) => v?.toLowerCase().includes(termo)),
      )
    : (leads ?? [])

  function selectLead(leadId: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(LEAD_PARAM, leadId)
        return next
      },
      { replace: false },
    )
  }

  function closeDrawer() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(LEAD_PARAM)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div>
      <PageHeader
        title="Candidatas"
        description="Arraste os cards entre as colunas para mudar a etapa. Clique para ver tudo."
      />

      {leads && leads.length > 0 && (
        <>
          <ResumoDoMes leads={leads} />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, cidade ou profissão..."
            className="mb-4 max-w-md"
          />
        </>
      )}

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px] w-80 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : !leads || leads.length === 0 ? (
        <EmptyState
          title="Nenhuma candidata ainda"
          description="Assim que novas candidatas responderem o chat da Landing Page, elas aparecem aqui."
        />
      ) : (
        <KanbanBoard leads={leadsFiltradas} onSelectLead={(lead: Lead) => selectLead(lead.id)} />
      )}

      <LeadDetailDrawer
        leadId={selectedLeadId}
        onOpenChange={(open) => !open && closeDrawer()}
      />
    </div>
  )
}
