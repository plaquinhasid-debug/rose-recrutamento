import { BRAND } from "@tania-joias/shared"
import { useState, type MouseEvent } from "react"
import { toast } from "sonner"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ClipboardCheck, Loader2, PhoneCall } from "lucide-react"
import { ETAPA_DETALHE_LABEL, PROXIMA_ACAO_LABEL, pipelineColumnKeyForLead } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PerfilComercialBadge } from "@/components/leads/PerfilComercialBadge"
import { PROXIMA_ACAO_VARIANT } from "@/components/leads/SofiaAnalysisCard"
import { cn } from "@/lib/utils"
import { formatDate, formatPhone, formatRelative, whatsappLinkWithMessage } from "@/lib/format"
import { TANIA_NOTIFICATION_STATUS_LABEL, type WhatsappDeliveryStatusKind } from "@/lib/whatsappStatus"
import {
  fichaPendente,
  fichaStatusForLead,
  latestProximaAcao,
  taniaNotificationStatusForLead,
  whatsappDeliveryStatusForLead,
  type LeadWithAnalysis,
} from "@/hooks/useLeads"
import {
  fichaLinkUrl,
  sendFichaWhatsappSkipMessage,
  useGenerateFichaLink,
  useMarkManualContact,
  useSendFichaWhatsapp,
} from "@/hooks/useLeadFicha"

// IMPLEMENTATION-CRM-005B — texto específico da coluna "Ficha pendente" do
// Kanban, deliberadamente separado do label de status de entrega
// compartilhado (`lib/whatsappStatus.ts`), que também alimenta o badge já
// validado em produção dentro do Drawer (`FichaAprovacaoSection.tsx`) —
// mudar aquele mudaria os dois lugares. Aqui o texto é sobre AÇÃO
// operacional ("o que fazer agora"), não sobre o estado técnico do WhatsApp.
const KANBAN_FICHA_PENDENTE_STATUS_LABEL: Record<WhatsappDeliveryStatusKind, string> = {
  no_confirmation: "Ficha ainda não enviada",
  accepted: "Ficha enviada — aguardando entrega",
  sent: "Ficha enviada — aguardando entrega",
  delivered: "Ficha entregue — aguardando preenchimento",
  read: "Ficha lida — aguardando preenchimento",
  failed: "Falha no envio da ficha",
}

/**
 * IMPLEMENTATION-CRM-002A — texto único usado pelo botão "Abrir WhatsApp",
 * revisado na 015D pra evitar linguagem de incentivo/desbloqueio
 * ("liberar seu Mostruário") que pode atrapalhar a classificação Utility
 * do template. Só abre o WhatsApp/WhatsApp Web pro operador mandar — nunca
 * chama a Cloud API.
 */
function mensagemContatoManual(nome: string, link: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ""
  return `Oi, ${primeiroNome}! Seu cadastro avançou para a 2ª etapa. Para continuar, preencha sua Ficha de Aprovação no link abaixo:\n\n${link}`
}

const DELIVERY_BADGE_VARIANT: Record<string, "destructive" | "success" | "gold" | "outline"> = {
  failed: "destructive",
  read: "success",
  delivered: "success",
  sent: "gold",
  accepted: "gold",
  no_confirmation: "outline",
}

// IMPLEMENTATION-CRM-004B (item 9/22) — mesma paleta 🔴🟢🟡⚪ do badge da
// Ficha, aplicada ao status da notificação da Tania.
const TANIA_NOTIFICATION_BADGE_VARIANT: Record<string, "destructive" | "success" | "gold" | "outline"> = {
  failed: "destructive",
  read: "success",
  delivered: "success",
  sent: "gold",
  accepted: "gold",
  not_sent: "outline",
}

interface KanbanCardProps {
  lead: LeadWithAnalysis
  onClick: () => void
}

export function KanbanCard({ lead, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  })
  const generateLink = useGenerateFichaLink()
  const markContact = useMarkManualContact()
  const sendFicha = useSendFichaWhatsapp()
  const [confirmandoContato, setConfirmandoContato] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const proximaAcao = latestProximaAcao(lead)
  const fichaStatus = fichaStatusForLead(lead)
  const etapaDetalhe = ETAPA_DETALHE_LABEL[pipelineColumnKeyForLead(lead)]
  const pendente = fichaPendente(lead)
  // IMPLEMENTATION-CRM-002A — as 19 leads aprovadas antigas sem ficha caem
  // aqui; cada uma revisada individualmente pelo botão abaixo, nunca em massa.
  const semFicha = lead.status === "aprovada" && lead.leads_ficha.length === 0
  const deliveryStatus = pendente ? whatsappDeliveryStatusForLead(lead) : null
  // IMPLEMENTATION-CRM-004B (item 9/22) — só faz sentido mostrar enquanto a
  // candidata está esperando a decisão da Tania; puramente informativo,
  // nunca bloqueia Aprovar/Recusar (esses vivem em TaniaAprovacaoSection).
  const taniaNotificationStatus =
    lead.etapa_pos_aprovacao === "aguardando_tania" ? taniaNotificationStatusForLead(lead) : null

  function handleGerarFicha(event: MouseEvent) {
    event.stopPropagation()
    if (generateLink.isPending) return
    generateLink.mutate(lead.id, {
      onError: () => toast.error("Não foi possível gerar o link da ficha."),
    })
  }

  // IMPLEMENTATION-CRM-005B — mesma ação rastreada já validada no Drawer
  // (`FichaAprovacaoSection.tsx`), só ecoada aqui pro card; nenhuma lógica
  // de envio nova, reaproveita `useSendFichaWhatsapp` (que já embute a
  // idempotência de `send-whatsapp-ficha`).
  async function handleEnviarFichaWhatsapp(event: MouseEvent) {
    event.stopPropagation()
    if (sendFicha.isPending) return
    try {
      const result = await sendFicha.mutateAsync(lead.id)
      if (result.skipped) {
        toast.info(sendFichaWhatsappSkipMessage(result.reason))
        return
      }
      toast.success("Ficha enviada pelo WhatsApp!")
    } catch {
      toast.error("Não foi possível enviar a ficha. Tente novamente.")
    }
  }

  function handleAbrirWhatsapp(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    const link = whatsappLinkWithMessage(
      lead.telefone,
      mensagemContatoManual(lead.nome, fichaLinkUrl(pendente.token)),
    )
    if (link) window.open(link, "_blank", "noopener,noreferrer")
  }

  function handleCopiarLink(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    navigator.clipboard.writeText(fichaLinkUrl(pendente.token))
    toast.success("Link copiado")
  }

  function handleIniciarConfirmacao(event: MouseEvent) {
    event.stopPropagation()
    setConfirmandoContato(true)
  }

  function handleCancelarConfirmacao(event: MouseEvent) {
    event.stopPropagation()
    setConfirmandoContato(false)
  }

  function handleConfirmarContato(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente || markContact.isPending) return
    markContact.mutate(pendente.id, {
      onError: () => toast.error("Não foi possível registrar o contato manual."),
    })
    setConfirmandoContato(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "touch-none rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
      )}
      onClick={onClick}
    >
      <p className="text-sm font-medium text-foreground">{lead.nome}</p>
      <p className="mt-1 text-xs text-muted-foreground">{lead.cidade ?? "Cidade não informada"}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(lead.telefone)}</p>
      {etapaDetalhe && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">{etapaDetalhe}</p>
      )}
      {proximaAcao && proximaAcao !== "aguardar" && (
        <Badge variant={PROXIMA_ACAO_VARIANT[proximaAcao]} className="mt-2 gap-1">
          <PhoneCall className="size-3" />
          {PROXIMA_ACAO_LABEL[proximaAcao]}
        </Badge>
      )}
      {fichaStatus === "preenchida" && (
        <Badge variant="success" className="mt-2 gap-1">
          <ClipboardCheck className="size-3" />
          Ficha preenchida
        </Badge>
      )}

      {semFicha && (
        <div className="mt-2 space-y-1.5" onClick={(event) => event.stopPropagation()}>
          <p className="text-[11px] text-muted-foreground">Ficha ainda não gerada</p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={generateLink.isPending}
            onClick={handleGerarFicha}
          >
            Gerar Ficha
          </Button>
        </div>
      )}

      {pendente && deliveryStatus && (
        <div className="mt-2 space-y-1.5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <Badge variant={DELIVERY_BADGE_VARIANT[deliveryStatus.kind]}>
              {KANBAN_FICHA_PENDENTE_STATUS_LABEL[deliveryStatus.kind]}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatRelative(pendente.criado_em)}
            </span>
          </div>

          {deliveryStatus.kind === "no_confirmation" && (
            <Button
              size="sm"
              variant="gold"
              className="w-full"
              disabled={lead.whatsapp !== true || sendFicha.isPending}
              onClick={(event) => void handleEnviarFichaWhatsapp(event)}
            >
              {sendFicha.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Enviar ficha pelo WhatsApp
            </Button>
          )}

          {deliveryStatus.kind === "failed" && deliveryStatus.errorCode && (
            <p className="text-[11px] text-destructive">Código Meta: {deliveryStatus.errorCode}</p>
          )}
          {pendente.contato_manual_em && (
            <p className="text-[11px] text-muted-foreground">
              Contato manual realizado {formatRelative(pendente.contato_manual_em)}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={lead.whatsapp !== true}
              onClick={handleAbrirWhatsapp}
            >
              Abrir WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleCopiarLink}>
              Copiar link
            </Button>
            {!confirmandoContato ? (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleIniciarConfirmacao}>
                Marcar como contatada
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Confirma o contato?</span>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleCancelarConfirmacao}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="gold"
                  className="h-6 px-2 text-[11px]"
                  disabled={markContact.isPending}
                  onClick={handleConfirmarContato}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {taniaNotificationStatus && (
        <div className="mt-2 flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          <span className="text-[11px] text-muted-foreground">Notificação {BRAND.dona}:</span>
          <Badge variant={TANIA_NOTIFICATION_BADGE_VARIANT[taniaNotificationStatus.kind]}>
            {TANIA_NOTIFICATION_STATUS_LABEL[taniaNotificationStatus.kind]}
          </Badge>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <PerfilComercialBadge perfil={lead.perfil_comercial} />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          IPR {lead.ipr}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{formatDate(lead.created_at)}</p>
    </div>
  )
}
