import { cn } from "@/lib/utils"
import type { SofiaMessage } from "@/types/sofia"

interface ChatBubbleProps {
  message: SofiaMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isBot = message.role === "bot"

  return (
    <div
      className={cn("flex w-full animate-fade-in", isBot ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed text-[var(--wa-bubble-text)] shadow-sm",
          isBot
            ? "rounded-tl-none bg-[var(--wa-bubble-in)] ring-1 ring-[#ecd5cf]/70"
            : "rounded-tr-none bg-[var(--wa-bubble-out)]",
        )}
      >
        {/* O horário precisa vir ANTES do texto no HTML — um `float` só
            "empurra" o conteúdo que vem depois dele na ordem do documento.
            Na ordem trocada (texto primeiro, horário depois), o browser
            desenhava o texto inteiro primeiro sem saber do float, e o
            horário flutuado acabava sobrepondo a última palavra. */}
        <span className="float-right ml-2 mt-1 text-[10px] leading-none text-[var(--wa-timestamp)]">
          {message.time}
        </span>
        <span className="whitespace-pre-line">{message.text}</span>
      </div>
    </div>
  )
}
