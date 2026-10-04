import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"
import {
  PIPELINE_COLUMNS,
  displayColumnKeyForLead,
  patchForPipelineColumn,
  type PipelineColumnKey,
} from "@tania-joias/shared"

import { KanbanColumn } from "@/components/crm/KanbanColumn"
import { KanbanCard } from "@/components/crm/KanbanCard"
import { useUpdateLead } from "@/hooks/useLeadDetail"
import { useMarkManualContact } from "@/hooks/useLeadFicha"
import type { LeadWithAnalysis } from "@/hooks/useLeads"
import type { Lead } from "@/types"

type GroupedLeads = Record<PipelineColumnKey, LeadWithAnalysis[]>

function groupByColumn(leads: LeadWithAnalysis[]): GroupedLeads {
  const grouped = Object.fromEntries(
    PIPELINE_COLUMNS.map((col) => [col.key, [] as LeadWithAnalysis[]]),
  ) as GroupedLeads
  for (const lead of leads) {
    grouped[displayColumnKeyForLead(lead)]?.push(lead)
  }
  return grouped
}

interface KanbanBoardProps {
  leads: LeadWithAnalysis[]
  onSelectLead: (lead: Lead) => void
}

export function KanbanBoard({ leads, onSelectLead }: KanbanBoardProps) {
  const [grouped, setGrouped] = React.useState<GroupedLeads>(() => groupByColumn(leads))
  const [activeLead, setActiveLead] = React.useState<LeadWithAnalysis | null>(null)
  const updateLead = useUpdateLead()
  const markContact = useMarkManualContact()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // O board tem mais colunas do que cabem na tela — sem isso, quem só tem
  // roda de mouse vertical (a maioria) não consegue ver as colunas da direita.
  // Precisa ser um listener nativo (não a prop `onWheel`): o React registra
  // "wheel" como passivo por padrão, o que faz `preventDefault` ser ignorado.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function handleWheel(event: WheelEvent) {
      if (!el || el.scrollWidth <= el.clientWidth) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [])

  React.useEffect(() => {
    setGrouped(groupByColumn(leads))
  }, [leads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // `closestCorners` sozinho pode escolher um card de uma coluna vizinha
  // quando se solta sobre uma coluna vazia (ou com poucos cards por perto),
  // fazendo o card voltar pra coluna de origem sem erro nenhum. `pointerWithin`
  // resolve pela posição real do cursor primeiro — só cai pra `closestCorners`
  // se o cursor não estiver literalmente sobre nenhuma área soltável.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args)
    return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args)
  }

  function findColumnOf(leadId: string): PipelineColumnKey | null {
    for (const col of PIPELINE_COLUMNS) {
      if (grouped[col.key].some((lead) => lead.id === leadId)) return col.key
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const leadId = String(event.active.id)
    const columnKey = findColumnOf(leadId)
    if (!columnKey) return
    setActiveLead(grouped[columnKey].find((lead) => lead.id === leadId) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const sourceKey = findColumnOf(leadId)
    if (!sourceKey) return

    const overId = String(over.id)
    const isColumn = PIPELINE_COLUMNS.some((col) => col.key === overId)
    const targetKey = (isColumn ? overId : findColumnOf(overId)) as PipelineColumnKey | null
    if (!targetKey || targetKey === sourceKey) return

    const lead = grouped[sourceKey].find((l) => l.id === leadId)
    if (!lead) return

    const patch = patchForPipelineColumn(targetKey, lead.status)

    // Rose: arrastar pra "Ficha Enviada" = a equipe mandou a ficha. Registra o
    // envio (é isso que tira o card da 1ª coluna) e move status/etapa juntos.
    const fichaPendenteNaoEnviada = lead.leads_ficha[0]
    if (
      targetKey === "contatada" &&
      fichaPendenteNaoEnviada &&
      !fichaPendenteNaoEnviada.contato_manual_em &&
      !fichaPendenteNaoEnviada.preenchido_em
    ) {
      setGrouped((prev) => ({
        ...prev,
        [sourceKey]: prev[sourceKey].filter((l) => l.id !== leadId),
        [targetKey]: [lead, ...prev[targetKey]],
      }))
      markContact.mutate(fichaPendenteNaoEnviada.id, {
        onError: () => {
          toast.error("Não foi possível mover o lead. Tente novamente.")
          setGrouped(groupByColumn(leads))
        },
      })
      return
    }

    setGrouped((prev) => ({
      ...prev,
      [sourceKey]: prev[sourceKey].filter((l) => l.id !== leadId),
      [targetKey]: [{ ...lead, ...patch }, ...prev[targetKey]],
    }))

    updateLead.mutate(
      { id: leadId, patch, previousStatus: lead.status, leadWhatsapp: lead.whatsapp },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Não foi possível mover o lead. Tente novamente.")
          setGrouped(groupByColumn(leads))
        },
      },
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            color={col.color}
            leads={grouped[col.key]}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && <KanbanCard lead={activeLead} onClick={() => {}} />}
      </DragOverlay>
    </DndContext>
  )
}
