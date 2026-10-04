import { type MouseEvent } from "react"
import { toast } from "sonner"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ClipboardCheck, Copy, MessageCircle } from "lucide-react"
import { BRAND } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatPhone, formatRelative, whatsappLinkWithMessage } from "@/lib/format"
import { fichaPendente, fichaStatusForLead, type LeadWithAnalysis } from "@/hooks/useLeads"
import { fichaLinkUrl, useGenerateFichaLink, useMarkManualContact } from "@/hooks/useLeadFicha"

/** Mensagem pronta que abre no WhatsApp da Carol/Ana com o link da ficha. */
export function mensagemFicha(nome: string, link: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ""
  return `Oi, ${primeiroNome}! Aqui é da ${BRAND.nome} 🌸 Seu cadastro foi pré-aprovado! Para continuar, preencha a segunda parte (é rapidinho) e envie as fotos dos documentos por este link:\n\n${link}`
}

interface KanbanCardProps {
  lead: LeadWithAnalysis
  onClick: () => void
}

export function KanbanCard({ lead, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })
  const generateLink = useGenerateFichaLink()
  const markContact = useMarkManualContact()

  const style = { transform: CSS.Transform.toString(transform), transition }

  const fichaStatus = fichaStatusForLead(lead)
  const pendente = fichaPendente(lead)
  const semFicha = (lead.status === "aprovada" || lead.status === "em_analise") && lead.leads_ficha.length === 0
  const semInstagram = !lead.instagram

  function handleGerarFicha(event: MouseEvent) {
    event.stopPropagation()
    if (generateLink.isPending) return
    generateLink.mutate(lead.id, { onError: () => toast.error("Não foi possível gerar o link da ficha.") })
  }

  function handleEnviarWhatsapp(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    const link = whatsappLinkWithMessage(lead.telefone, mensagemFicha(lead.nome, fichaLinkUrl(pendente.token)))
    if (link) window.open(link, "_blank", "noopener,noreferrer")
    // Registra que a ficha foi enviada (só na 1ª vez).
    if (!pendente.contato_manual_em && !markContact.isPending) {
      markContact.mutate(pendente.id)
    }
  }

  function handleCopiarLink(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    void navigator.clipboard.writeText(fichaLinkUrl(pendente.token))
    toast.success("Link da ficha copiado")
    // Rose: copiar o link pra mandar também move o card pra "Ficha Enviada".
    if (!pendente.contato_manual_em && !markContact.isPending) {
      markContact.mutate(pendente.id)
    }
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
      <p className="mt-1 text-xs text-muted-foreground">
        {[lead.cidade, lead.profissao].filter(Boolean).join(" · ") || "—"}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(lead.telefone)}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.status === "em_analise" && <Badge variant="gold">Analisar</Badge>}
        {semInstagram && lead.trabalha && <Badge variant="outline">Sem Instagram</Badge>}
        {fichaStatus === "preenchida" && (
          <Badge variant="success" className="gap-1">
            <ClipboardCheck className="size-3" />
            Ficha recebida
          </Badge>
        )}
      </div>

      {semFicha && (
        <div className="mt-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={generateLink.isPending} onClick={handleGerarFicha}>
            Gerar link da ficha
          </Button>
        </div>
      )}

      {pendente && (
        <div className="mt-2 space-y-1.5" onClick={(event) => event.stopPropagation()}>
          <p className="text-[11px] text-muted-foreground">
            {pendente.contato_manual_em
              ? `Ficha enviada ${formatRelative(pendente.contato_manual_em)} — aguardando preenchimento`
              : "Ficha ainda não enviada"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={pendente.contato_manual_em ? "outline" : "gold"} className="h-7 gap-1 px-2 text-xs" onClick={handleEnviarWhatsapp}>
              <MessageCircle className="size-3.5" />
              {pendente.contato_manual_em ? "Reenviar no WhatsApp" : "Enviar ficha no WhatsApp"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={handleCopiarLink}>
              <Copy className="size-3.5" />
              Copiar link
            </Button>
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">Chegou {formatRelative(lead.created_at)}</p>
    </div>
  )
}
