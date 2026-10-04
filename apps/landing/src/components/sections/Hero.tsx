import { BRAND } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { CrownMark } from "@/components/sections/CrownMark"

interface HeroProps {
  onOpenSofia: () => void
}

export function Hero({ onOpenSofia }: HeroProps) {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* véu pétala atrás do arco, só no desktop */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[30%] bg-secondary lg:block" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-16 pt-10 sm:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        {/* Sem animação de entrada: o título é o que aparece primeiro no celular. */}
        <div>
          <h1 className="font-display text-[2.6rem] font-medium leading-[1.04] tracking-[-0.01em] text-foreground sm:text-6xl lg:text-[4.25rem]">
            Transforme seu tempo livre em renda extra revendendo semijoias.
          </h1>

          <p className="text-foil mt-7 font-display text-3xl font-semibold sm:text-[2.1rem]">
            Ganhe até {BRAND.comissaoMaxima} de comissão!
          </p>

          <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Faça parte da equipe da {BRAND.nome}. Sem investimento inicial. Treinamento
            completo. Suporte.
          </p>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Button
              size="lg"
              variant="gold"
              onClick={onOpenSofia}
              className="h-14 px-9 text-sm font-semibold tracking-wide shadow-lg shadow-primary/25"
            >
              QUERO COMEÇAR AGORA
            </Button>
            <a
              href="#como-funciona"
              className="self-start py-3 text-sm font-medium text-accent-foreground underline sm:self-auto decoration-champagne underline-offset-[6px] hover:decoration-primary"
            >
              Ver como funciona
            </a>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Cadastro leva menos de 2 minutos.
          </p>
        </div>

        {/* Vitrine em arco: a foto da Rose emoldurada como numa joalheria */}
        <div
          style={{ animationDelay: "0.12s" }}
          className="rise-in relative mx-auto w-full max-w-[19rem] pt-10 sm:max-w-sm lg:max-w-[26rem]"
        >
          <CrownMark className="absolute left-1/2 top-0 z-10 h-11 w-auto -translate-x-1/2 text-primary/80" />
          <div className="absolute inset-x-0 bottom-0 top-10 translate-x-3 translate-y-3 rounded-t-full border border-champagne" />
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-full bg-secondary shadow-[0_30px_60px_-25px_rgba(90,48,44,0.45)]">
            <img
              src="/assets/rose-banner.webp"
              srcSet="/assets/rose-banner-600.webp 600w, /assets/rose-banner.webp 1110w"
              sizes="(min-width: 1024px) 26rem, (min-width: 640px) 24rem, 19rem"
              width={1110}
              height={745}
              alt="Semijoias da Rose: colar, bracelete e anel sobre mármore e cetim rosa"
              className="size-full object-cover object-[50%_40%]"
              fetchPriority="high"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
