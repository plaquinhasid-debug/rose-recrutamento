import { BRAND } from "@tania-joias/shared"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"

interface HeroProps {
  onOpenSofia: () => void
}

export function Hero({ onOpenSofia }: HeroProps) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <h1 className="font-display text-4xl font-semibold leading-[1.1] text-foreground sm:text-5xl lg:text-6xl">
            Transforme seu tempo livre em renda extra revendendo semijoias.
          </h1>

          <p className="mt-6 text-xl font-semibold text-gold">Ganhe até {BRAND.comissaoMaxima} de comissão!</p>

          <p className="mt-3 max-w-xl text-lg text-muted-foreground">
            Faça parte da equipe da {BRAND.nome}. Sem investimento inicial. Treinamento
            completo. Suporte.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" variant="gold" onClick={onOpenSofia} className="text-sm tracking-wide">
              QUERO COMEÇAR AGORA
            </Button>
            <a
              href="#como-funciona"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Ver como funciona
            </a>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">
            Sem taxa de adesão. Cadastro leva menos de 2 minutos.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="flex items-center justify-center"
        >
          <img
            src="/assets/hero-semijoias.png"
            alt="Semijoias"
            className="max-h-96 w-full rounded-lg object-cover shadow-lg"
          />
        </motion.div>
      </div>
    </section>
  )
}
