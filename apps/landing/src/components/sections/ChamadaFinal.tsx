import { BRAND } from "@tania-joias/shared"
import { Reveal } from "@/components/Reveal"
import { Button } from "@/components/ui/button"
import { CrownMark } from "@/components/sections/CrownMark"

interface ChamadaFinalProps {
  onOpenSofia: () => void
}

export function ChamadaFinal({ onOpenSofia }: ChamadaFinalProps) {
  return (
    <section className="relative overflow-hidden bg-wine py-20 text-primary-foreground sm:py-28">
      <div className="pointer-events-none absolute -left-24 top-0 size-96 rounded-full bg-champagne/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-champagne/15 blur-3xl" />
      <CrownMark className="pointer-events-none absolute left-1/2 top-8 h-10 w-auto -translate-x-1/2 text-champagne/50" />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Pronta para começar sua renda extra?
          </h2>
          <p className="mt-4 text-primary-foreground/80">
            Fale com a {BRAND.assistente} agora e descubra se você tem o perfil para ser uma
            revendedora {BRAND.nome}. Leva menos de dois minutos.
          </p>
          <Button
            size="lg"
            variant="gold"
            onClick={onOpenSofia}
            className="mt-9 h-14 bg-background px-10 text-base font-semibold tracking-wide text-wine shadow-xl shadow-black/25 ring-2 ring-background/40 ring-offset-4 ring-offset-wine transition-transform hover:scale-105 hover:bg-background"
          >
            QUERO COMEÇAR AGORA
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
