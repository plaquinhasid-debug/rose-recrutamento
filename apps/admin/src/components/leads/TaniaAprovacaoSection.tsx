import { BRAND } from "@tania-joias/shared"
import { toast } from "sonner"
import { MessageCircle, ThumbsDown, ThumbsUp } from "lucide-react"
import { PERFIL_COMERCIAL_LABEL, type EtapaPosAprovacao, type PerfilComercial } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLeadFicha } from "@/hooks/useLeadFicha"
import { useUpdateLead } from "@/hooks/useLeadDetail"
import { useTaniaWhatsappNumero } from "@/hooks/useSettings"
import { formatPhone, googleMapsUrl, whatsappLinkWithMessage } from "@/lib/format"
import { decisaoTaniaDisponivel, etapaAposDecisaoTania } from "@/lib/taniaDecisionGate"
import { mensagemFalarComCandidata } from "@/lib/taniaFalarComCandidata"

interface TaniaAprovacaoSectionProps {
  leadId: string
  leadNome: string
  leadCidade: string | null
  leadTelefone: string
  leadEtapa: EtapaPosAprovacao | null
  leadPerfilComercial: PerfilComercial | null
  resumoParaMensagem: string
}

function mensagemParaTania(
  nome: string,
  cidade: string | null,
  telefone: string,
  perfilLabel: string | null,
  mapsUrl: string | null,
  resumo: string,
): string {
  const linhas = [
    `Oi ${BRAND.dona}! A ${nome}${cidade ? ` (${cidade})` : ""} já foi aprovada pelo sistema e completou todo o cadastro — só está faltando sua aprovação final pra liberar o Mostruário pra ela.`,
    "",
    `📞 ${formatPhone(telefone)}`,
  ]
  if (perfilLabel) linhas.push(`⭐ Potencial: ${perfilLabel}`)
  if (mapsUrl) linhas.push(`📍 ${mapsUrl}`)
  if (resumo.trim()) linhas.push("", resumo.trim())
  linhas.push("", "Pode confirmar?")
  return linhas.join("\n")
}

export function TaniaAprovacaoSection({
  leadId,
  leadNome,
  leadCidade,
  leadTelefone,
  leadEtapa,
  leadPerfilComercial,
  resumoParaMensagem,
}: TaniaAprovacaoSectionProps) {
  const { data: ficha } = useLeadFicha(leadId)
  const { data: taniaTelefone } = useTaniaWhatsappNumero()
  const updateLead = useUpdateLead()

  if (!decisaoTaniaDisponivel(leadEtapa)) {
    return null
  }

  // IMPLEMENTATION-CRM-004C — troca `window.open()` por um `<a href>` real
  // (via `Button asChild`). Em Android, `window.open()` abre a navegação
  // dentro de uma aba nova criada por script, o que faz o SO resolver o elo
  // `wa.me` por um caminho diferente do de um clique de link genuíno —
  // na prática, abrindo o WhatsApp pessoal em vez do WhatsApp Business
  // (mesmo com o número de destino sempre correto). Um `<a href>` navegado
  // por toque real do usuário segue o mesmo caminho de resolução de App
  // Link que já funciona ao digitar o link manualmente. Número e mensagem
  // continuam vindo de `whatsappLinkWithMessage` + `mensagemFalarComCandidata`,
  // sem nenhuma mudança.
  const linkFalarComCandidata = whatsappLinkWithMessage(
    leadTelefone,
    mensagemFalarComCandidata(leadNome),
  )

  function handleEnviarTania() {
    if (!taniaTelefone) {
      toast.error(`Número da ${BRAND.dona} não configurado. Veja Configurações.`)
      return
    }
    const mensagem = mensagemParaTania(
      leadNome,
      leadCidade,
      leadTelefone,
      leadPerfilComercial ? PERFIL_COMERCIAL_LABEL[leadPerfilComercial] : null,
      ficha ? googleMapsUrl(ficha) : null,
      resumoParaMensagem,
    )
    const link = whatsappLinkWithMessage(taniaTelefone, mensagem)
    if (link) window.open(link, "_blank", "noopener,noreferrer")

    updateLead
      .mutateAsync({ id: leadId, patch: { etapa_pos_aprovacao: "aguardando_tania" } })
      .catch(() => toast.error("Mensagem aberta, mas não deu pra mover o card. Mova manualmente."))
  }

  async function handleResposta(aprovou: boolean) {
    try {
      await updateLead.mutateAsync({
        id: leadId,
        patch: { etapa_pos_aprovacao: etapaAposDecisaoTania(aprovou) },
      })
      toast.success(aprovou ? "Lead marcada como Ativa." : "Lead marcada como Desistiu.")
    } catch {
      toast.error("Não foi possível atualizar a etapa.")
    }
  }

  // IMPLEMENTATION-CRM-003A — a decisão não pode depender do WhatsApp: a
  // Ficha já está preenchida sempre que este componente renderiza (é o que
  // leva a etapa a "confirmada"), então os botões de decisão ficam
  // disponíveis nos dois estados. "Enviar pra Tania" continua existindo, mas
  // como ação auxiliar/opcional — nunca um pré-requisito pra aprovar/recusar.
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Aprovação final da {BRAND.dona}</h3>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ficha preenchida. Aguardando decisão da {BRAND.dona}.
        </p>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-success/40 text-success hover:bg-success/10"
            disabled={updateLead.isPending}
            onClick={() => void handleResposta(true)}
          >
            <ThumbsUp className="size-3.5" />
            {BRAND.dona} aprovou
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={updateLead.isPending}
            onClick={() => void handleResposta(false)}
          >
            <ThumbsDown className="size-3.5" />
            {BRAND.dona} recusou
          </Button>
        </div>

        {linkFalarComCandidata ? (
          <Button asChild size="lg" variant="gold" className="w-full">
            <a href={linkFalarComCandidata} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              Falar com a candidata
            </a>
          </Button>
        ) : (
          <Button size="lg" variant="gold" className="w-full" disabled>
            <MessageCircle className="size-4" />
            Falar com a candidata
          </Button>
        )}

        <div className="border-t border-border pt-2">
          {leadEtapa === "aguardando_tania" && (
            <Badge variant="gold" className="mb-2">
              Mensagem já enviada pra {BRAND.dona}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleEnviarTania}
          >
            <MessageCircle className="size-3.5" />
            Enviar pra {BRAND.dona} (opcional)
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Ação auxiliar — não é necessária pra aprovar ou recusar acima.
          </p>
        </div>
      </div>
    </section>
  )
}
