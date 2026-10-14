import { lazy, Suspense, useEffect, useState } from "react"
import { BRAND } from "@tania-joias/shared"
import { BadgePercent, Gem, MapPin, Store, Users } from "lucide-react"

import { Reveal } from "@/components/Reveal"
import { CrownMark } from "@/components/sections/CrownMark"
import { Footer } from "@/components/sections/Footer"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { SOFIA_BELEZA_APPROVED_LINES, SOFIA_BELEZA_INTRO_LINES } from "@/data/sofia-script"
import { useLandingTracking } from "@/hooks/useLandingTracking"
import { useSessionId } from "@/hooks/useSessionId"
import { useUtmParams } from "@/hooks/useUtmParams"

/**
 * Landing `/beleza` — destino da campanha Meta para profissionais da beleza
 * (salões, estéticas, manicures, lojas) de Mauá e região. Fala a mesma
 * língua do vídeo do anúncio (o vídeo fica só no criativo): expositor de
 * semijoias no balcão, totalmente consignado, até 40% de comissão.
 *
 * O cadastro é a mesma Sofia da landing geral (mesmo funil, IPR e CRM); o
 * lead entra com `origem = "beleza"` para ser filtrado no painel.
 */

const ORIGEM = "beleza"
// Promessa do vídeo do anúncio — difere de BRAND.comissaoMaxima (50%) de propósito.
const COMISSAO_ANUNCIO = "40%"

const loadSofia = () => import("@/components/sofia/SofiaAssistant")
const SofiaAssistant = lazy(() => loadSofia().then((m) => ({ default: m.SofiaAssistant })))

const PUBLICO = [
  "Salão de cabeleireiro",
  "Manicure e nail designer",
  "Clínica de estética",
  "Sobrancelha e cílios",
  "Loja de moda e beleza",
]

const VANTAGENS = [
  {
    icon: Users,
    title: "Suas clientes já estão aí",
    text: "Enquanto fazem a escova, a unha ou o procedimento, elas olham o expositor com calma. A venda acontece no seu atendimento de sempre.",
  },
  {
    icon: Gem,
    title: "Totalmente consignado",
    text: "Você não compra nada para começar. As semijoias e acessórios ficam no seu balcão e você só repassa o que vender.",
  },
  {
    icon: BadgePercent,
    title: `Até ${COMISSAO_ANUNCIO} de comissão`,
    text: "Cada peça vendida no seu espaço gera comissão para você, conforme as regras combinadas com a Rosé.",
  },
]

const PASSOS = [
  {
    number: "01",
    title: "Faça seu cadastro",
    text: `Responda algumas perguntas rápidas da ${BRAND.assistente}, nossa assistente, direto pelo celular. Leva menos de 2 minutos.`,
  },
  {
    number: "02",
    title: "Entramos em contato com você",
    text: `A ${BRAND.dona} analisa o seu perfil e te chama no WhatsApp para conhecer o seu espaço e explicar a parceria.`,
  },
  {
    number: "03",
    title: "O expositor vai para o seu balcão",
    text: "Aprovada a parceria, você recebe o expositor com semijoias e acessórios em consignação — sem pagar nada antes.",
  },
  {
    number: "04",
    title: "Suas clientes compram, você ganha",
    text: `No acerto, você repassa só o que foi vendido e fica com até ${COMISSAO_ANUNCIO} de comissão. As peças são renovadas para o expositor continuar bonito.`,
  },
]

const FAQ_ITEMS = [
  {
    question: "Preciso comprar as peças?",
    answer:
      "Não. O expositor é totalmente consignado: as peças ficam no seu espaço e você só repassa à Rosé o valor do que for vendido.",
  },
  {
    question: "Quanto eu ganho?",
    answer: `Você ganha até ${COMISSAO_ANUNCIO} de comissão sobre as vendas, conforme as regras combinadas com a ${BRAND.dona} na parceria. O ganho depende do que for vendido no seu espaço — não existe valor garantido.`,
  },
  {
    question: "Que tipo de peça vem no expositor?",
    answer:
      "Semijoias e acessórios: colares, brincos, pulseiras, anéis e conjuntos, já embalados e prontos para a sua cliente levar.",
  },
  {
    question: "Quem pode ser parceira?",
    answer:
      "Profissionais e donas de salão de cabeleireiro, manicure, estética, sobrancelha e cílios ou loja de moda e beleza, que atendam em Mauá e região.",
  },
  {
    question: "A Rosé atende a minha cidade?",
    answer: `Atendemos atualmente: ${BRAND.cidadesTexto}.`,
  },
  {
    question: "Preciso ter Instagram?",
    answer:
      "Não é obrigatório. Se você ou o seu espaço tiverem Instagram, informe no cadastro — ajuda na análise e na divulgação das peças.",
  },
  {
    question: "Qual é a idade mínima?",
    answer: "A idade mínima é 18 anos.",
  },
  {
    question: "Em quanto tempo recebo uma resposta?",
    answer: `Assim que você terminar o cadastro, a ${BRAND.dona} analisa pessoalmente e entra em contato pelo WhatsApp em alguns dias úteis.`,
  },
]

interface CtaProps {
  onClick: () => void
  className?: string
}

function CtaParceira({ onClick, className }: CtaProps) {
  return (
    <Button
      size="lg"
      variant="gold"
      onClick={onClick}
      className={`h-14 px-9 text-sm font-semibold tracking-wide shadow-lg shadow-primary/25 ${className ?? ""}`}
    >
      QUERO SER PARCEIRA
    </Button>
  )
}

export function BelezaPage() {
  const [sofiaOpen, setSofiaOpen] = useState(false)
  const [sofiaMounted, setSofiaMounted] = useState(false)
  const sessionId = useSessionId()
  const utm = useUtmParams()

  useLandingTracking(sessionId, utm)

  useEffect(() => {
    document.title = `Parceria para salões e estéticas — ${BRAND.nome}`
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    idle(() => void loadSofia())
  }, [])

  const openSofia = () => {
    setSofiaMounted(true)
    setSofiaOpen(true)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <a href="#top" className="shrink-0" aria-label={`${BRAND.nome} — início`}>
            <img
              src="/assets/rose-logo.webp"
              width={240}
              height={112}
              alt={BRAND.nome}
              className="h-12 w-auto sm:h-14"
            />
          </a>
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Parceria · Beleza
          </span>
        </div>
      </header>

      <main>
        {/* HERO — mesma promessa do anúncio */}
        <section id="top" className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[30%] bg-secondary lg:block" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-10 sm:pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-20">
            <div>
              {/* Mesma pergunta que abre o vídeo do anúncio — em destaque */}
              <p className="inline-flex items-center gap-2.5 rounded-2xl bg-primary px-5 py-3 text-lg font-semibold leading-snug text-primary-foreground shadow-lg shadow-primary/25 sm:text-xl">
                <MapPin className="size-5 shrink-0 sm:size-6" aria-hidden />
                Você é de Mauá e região e tem um salão ou estética?
              </p>

              <h1 className="mt-7 font-display text-[2.6rem] font-medium leading-[1.04] tracking-[-0.01em] text-foreground sm:text-6xl lg:text-[4rem]">
                Suas clientes adoram se cuidar.{" "}
                <em className="text-primary">Ofereça Rosé.</em>
              </h1>

              <p className="text-foil mt-7 font-display text-3xl font-semibold sm:text-[2.1rem]">
                Ganhe até {COMISSAO_ANUNCIO} de comissão!
              </p>

              <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Um expositor de semijoias e acessórios no seu balcão,{" "}
                <strong className="font-medium text-foreground">totalmente consignado</strong>. Você
                não compra nada — suas clientes compram enquanto são atendidas.
              </p>

              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <CtaParceira onClick={openSofia} />
                <a
                  href="#como-funciona"
                  className="self-start py-3 text-sm font-medium text-accent-foreground underline decoration-champagne underline-offset-[6px] hover:decoration-primary sm:self-auto"
                >
                  Ver como funciona
                </a>
              </div>

              <p className="mt-8 text-sm text-muted-foreground">
                Cadastro em menos de 2 minutos · Mauá e região · Sujeito à aprovação
              </p>
            </div>

            {/* Vitrine em arco, igual à landing geral */}
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

        {/* QUEM PODE */}
        <section className="border-y border-border/60 bg-card py-10">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p className="text-sm text-muted-foreground">Esse convite é pra você que tem:</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2.5">
              {PUBLICO.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-champagne bg-background px-4 py-2 text-sm text-accent-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* POR QUE FUNCIONA NO SALÃO */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Store className="mx-auto size-8 text-primary" aria-hidden />
              <h2 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
                Seu atendimento pode render mais
              </h2>
              <p className="mt-4 text-muted-foreground">
                Você já tem a confiança das suas clientes. A Rosé completa o visual delas — e o seu
                faturamento.
              </p>
            </Reveal>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {VANTAGENS.map((item, index) => (
                <Reveal key={item.title} delay={index * 0.08}>
                  <div className="h-full rounded-[var(--radius)] border border-border bg-card p-7">
                    <item.icon className="size-6 text-primary" aria-hidden />
                    <h3 className="mt-4 font-display text-2xl font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section id="como-funciona" className="bg-secondary/50 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
                Como funciona a parceria
              </h2>
              <p className="mt-4 text-muted-foreground">
                Do cadastro ao expositor no seu balcão, em quatro passos.
              </p>
            </Reveal>

            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {PASSOS.map((step, index) => (
                <Reveal key={step.number} delay={index * 0.1}>
                  <div className="flex flex-col gap-3">
                    <span className="text-foil font-display text-5xl font-medium leading-none">
                      {step.number}
                    </span>
                    <h3 className="font-medium text-foreground">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-14 flex justify-center">
              <CtaParceira onClick={openSofia} />
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-6">
            <Reveal className="text-center">
              <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
                Perguntas frequentes
              </h2>
            </Reveal>
            <Reveal delay={0.1} className="mt-12">
              <Accordion type="single" collapsible className="w-full">
                {FAQ_ITEMS.map((item, index) => (
                  <AccordionItem key={item.question} value={`item-${index}`}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent>{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* CHAMADA FINAL — fecha igual ao vídeo */}
        <section className="relative overflow-hidden bg-wine py-20 text-primary-foreground sm:py-28">
          <div className="pointer-events-none absolute -left-24 top-0 size-96 rounded-full bg-champagne/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-champagne/15 blur-3xl" />
          <CrownMark className="pointer-events-none absolute left-1/2 top-8 h-10 w-auto -translate-x-1/2 text-champagne/50" />

          <div className="relative mx-auto max-w-3xl px-6 text-center">
            <Reveal>
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                Faça seu cadastro e entraremos em contato com você!
              </h2>
              <p className="mt-4 text-primary-foreground/80">
                Fale com a {BRAND.assistente} agora. Leva menos de dois minutos e não tem
                compromisso.
              </p>
              <Button
                size="lg"
                variant="gold"
                onClick={openSofia}
                className="mt-9 h-14 bg-background px-10 text-base font-semibold tracking-wide text-wine shadow-xl shadow-black/25 ring-2 ring-background/40 ring-offset-4 ring-offset-wine transition-transform hover:scale-105 hover:bg-background"
              >
                QUERO SER PARCEIRA
              </Button>
              <p className="mt-6 text-xs text-primary-foreground/70">
                Parceria sujeita à análise de perfil e às condições comerciais vigentes. Não há
                garantia de ganhos.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />

      {sofiaMounted && (
        <Suspense fallback={null}>
          <SofiaAssistant
            open={sofiaOpen}
            onOpenChange={setSofiaOpen}
            origem={ORIGEM}
            introLines={SOFIA_BELEZA_INTRO_LINES}
            approvedLines={SOFIA_BELEZA_APPROVED_LINES}
          />
        </Suspense>
      )}
    </div>
  )
}
