import { BRAND } from "@tania-joias/shared"
import { useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, Clock, HeartHandshake, Instagram } from "lucide-react"
import type { FinalizeCandidateResponse } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { IprCounter } from "@/components/sofia/IprCounter"
import {
  SOFIA_APPROVED_LINES,
  SOFIA_EM_ANALISE_LINES,
  SOFIA_REJECTION_LINES,
  SOFIA_REPROVADA_FINAL_LINES,
} from "@/data/sofia-script"

const INSTAGRAM_URL = BRAND.instagramUrl

interface ResultScreenProps {
  result: FinalizeCandidateResponse
  trabalha: boolean | undefined
  onClose: () => void
}

export function ResultScreen({ result, trabalha, onClose }: ResultScreenProps) {
  const [revealed, setRevealed] = useState(false)

  // Quando reprovada por não estar trabalhando, reaproveita a mensagem de
  // encerramento exata do briefing (já mostrada nas bolhas do chat).
  const isReprovadaPorNaoTrabalhar = result.status === "reprovada" && trabalha === false

  const lines =
    result.status === "aprovada"
      ? SOFIA_APPROVED_LINES
      : result.status === "em_analise"
        ? SOFIA_EM_ANALISE_LINES
        : isReprovadaPorNaoTrabalhar
          ? SOFIA_REJECTION_LINES
          : SOFIA_REPROVADA_FINAL_LINES

  const Icon =
    result.status === "aprovada"
      ? CheckCircle2
      : result.status === "em_analise"
        ? Clock
        : HeartHandshake

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 py-10 text-center">
      {!revealed ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Calculando seu potencial...</p>
          <IprCounter
            target={result.ipr}
            onDone={() => {
              // Pequena pausa depois do número final antes de trocar de
              // tela — sem isso, o resultado aparecia no exato instante em
              // que a contagem terminava, rápido demais pra registrar.
              setTimeout(() => setRevealed(true), 700)
            }}
          />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-col items-center gap-5"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Icon className="size-7" />
          </div>
          <div className="max-w-xs space-y-2">
            <p className="font-display text-2xl font-semibold text-foreground">{lines[0]}</p>
            {lines.slice(1).map((line) => (
              <p key={line} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
          <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
            <Button variant="gold" size="lg" asChild>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                <Instagram className="size-4" />
                Ver nosso Instagram
              </a>
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
