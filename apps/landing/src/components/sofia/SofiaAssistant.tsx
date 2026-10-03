import { useEffect, useRef } from "react"

import { SofiaChatPanel } from "@/components/sofia/SofiaChatPanel"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useSessionId } from "@/hooks/useSessionId"
import { useSofiaFlow } from "@/hooks/useSofiaFlow"
import { useUtmParams } from "@/hooks/useUtmParams"
import { logEvent, startConversation } from "@/lib/api"
import { hasLoggedOnce, markLoggedOnce } from "@/lib/tracking"

interface SofiaAssistantProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Ponto único de montagem da Sofia: mantém o estado do fluxo vivo mesmo
 * quando o drawer é fechado e reaberto (não perde progresso), e cuida do
 * rastreamento de `chat_iniciado` / `conversations` / `chat_abandonado`.
 */
export function SofiaAssistant({ open, onOpenChange }: SofiaAssistantProps) {
  const sessionId = useSessionId()
  const utm = useUtmParams()
  const flow = useSofiaFlow({
    sessionId,
    utm,
    origem: utm.utm_source ?? "landing_page",
    campanha: utm.utm_campaign,
  })

  const conversationStarted = useRef(false)

  useEffect(() => {
    if (!open) return

    if (!conversationStarted.current) {
      conversationStarted.current = true

      if (!hasLoggedOnce("chat_iniciado")) {
        markLoggedOnce("chat_iniciado")
        void logEvent({
          tipoEvento: "chat_iniciado",
          sessionId,
          campanha: utm.utm_campaign,
          origem: utm.utm_source,
        })
      }

      void startConversation({
        sessionId,
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
        utmContent: utm.utm_content,
      })
    }

    flow.beginIntro()
    // Deve rodar só quando `open` muda — as funções acima são estáveis o
    // suficiente para o propósito (idempotentes / guardadas por ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) return
    if (!conversationStarted.current) return
    // FEATURE-005 Parte 7.1: "abandoned" já é um encerramento explícito e
    // definitivo (candidata disse "tchau"/"quero parar") — não conta de
    // novo como abandono passivo de fechar o drawer.
    if (flow.phase === "result" || flow.phase === "abandoned") return

    void logEvent({
      tipoEvento: "chat_abandonado",
      sessionId,
      campanha: utm.utm_campaign,
      origem: utm.utm_source,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0">
        <SofiaChatPanel flow={flow} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}
