import { BRAND } from "@tania-joias/shared"
import { Banknote, Check, Gem, GraduationCap, HeartHandshake, RefreshCw, Smartphone, Star } from "lucide-react"

import { Reveal } from "@/components/Reveal"
import { Button } from "@/components/ui/button"

interface QuemSomosProps {
  onOpenSofia: () => void
}

const BENEFICIOS = [
  {
    icon: Gem,
    title: "Semijoias Premium",
    text: "Peças com acabamento impecável, garantia e coleções atuais que encantam suas clientes.",
  },
  {
    icon: RefreshCw,
    title: "Consignação — Sem Risco",
    text: "Você vende por 30 dias e faz o acerto só do que vendeu. Sem comprar estoque antecipado.",
  },
  {
    icon: GraduationCap,
    title: "Treinamento Completo",
    text: "Mesmo sem experiência, você aprende tudo o que precisa para começar a vender com confiança.",
  },
  {
    icon: Banknote,
    title: "De 30% a 50% de Comissão",
    text: "Quanto mais você vende, maior a sua comissão. Você controla o seu ganho.",
  },
  {
    icon: Smartphone,
    title: "Venda do Seu Jeito",
    text: "Presencialmente, pelo WhatsApp ou pelas redes sociais — você escolhe como chegar às suas clientes.",
  },
  {
    icon: HeartHandshake,
    title: "Suporte da Carol",
    text: "A Carol acompanha cada vendedora de perto. Aqui você não está sozinha.",
  },
]

const INDICADORES = ["Consignação — sem risco", "Suporte especializado", "Atendimento regional personalizado"]

export function QuemSomos({ onOpenSofia }: QuemSomosProps) {
  return (
    <section id="quem-somos" className="bg-secondary/50 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Quem é a {BRAND.nome}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            A {BRAND.nome} é um negócio pensado para a mulher trabalhadora que quer crescer e
            conquistar mais renda sem abrir mão da sua rotina.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Trabalhamos com consignação: você retira a maleta de semijoias premium, vende em
            30 dias e faz o acerto. Sem comprar estoque, sem risco — e com suporte da Carol em
            cada etapa.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Atendemos atualmente {BRAND.cidadesTexto}.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <h3 className="mt-14 font-display text-xl font-semibold text-foreground">
            Por que escolher a {BRAND.nome}?
          </h3>
          <div className="mt-8 grid gap-8 text-left sm:grid-cols-2 lg:grid-cols-3">
            {BENEFICIOS.map((beneficio, index) => (
              <Reveal key={beneficio.title} delay={0.1 + (index % 3) * 0.06}>
                <div className="group flex h-full flex-col gap-2 transition-transform hover:-translate-y-0.5">
                  <beneficio.icon className="size-8 stroke-[1.25] text-gold" />
                  <h4 className="mt-1 font-medium text-foreground">{beneficio.title}</h4>
                  <p className="text-sm text-muted-foreground">{beneficio.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-y border-border py-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="flex gap-0.5 text-gold">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-current" />
                ))}
              </span>
              Atendimento de excelência
            </span>
            {INDICADORES.map((indicador) => (
              <span key={indicador} className="flex items-center gap-1.5">
                <Check className="size-4 text-gold" />
                {indicador}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.25} className="mt-10 flex justify-center">
          <Button size="lg" variant="gold" onClick={onOpenSofia} className="text-sm tracking-wide">
            QUERO COMEÇAR AGORA
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
