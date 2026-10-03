import { Reveal } from "@/components/Reveal"
import { Button } from "@/components/ui/button"

interface ComoFuncionaProps {
  onOpenSofia: () => void
}

const STEPS = [
  {
    number: "01",
    title: "Candidatura rápida",
    text: "Converse com a Sofia, nossa assistente, e conte um pouco sobre você. Leva menos de 2 minutos.",
  },
  {
    number: "02",
    title: "Análise e pré-aprovação",
    text: "A Carol analisa seu perfil pessoalmente e entra em contato pelo WhatsApp. Você preenche a ficha completa e envia seus documentos.",
  },
  {
    number: "03",
    title: "Pegue o mostruário",
    text: "Aprovada! Você vem até a loja, conhece a Carol e sai com ~50 peças no sistema de consignação — sem pagar nada antecipado.",
  },
  {
    number: "04",
    title: "Venda e faça o acerto",
    text: "Você tem 30 dias para vender. Depois, vem até a loja, paga só o que vendeu, devolve o restante e pode renovar as peças.",
  },
]

export function ComoFunciona({ onOpenSofia }: ComoFuncionaProps) {
  return (
    <section id="como-funciona" className="bg-secondary/50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-muted-foreground">
            Do primeiro contato até a sua primeira venda, um caminho simples e sem risco.
          </p>
        </Reveal>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.1} className="relative">
              <div className="flex flex-col gap-3">
                <span className="font-display text-4xl font-semibold text-gold/70">
                  {step.number}
                </span>
                <h3 className="font-medium text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14 flex justify-center">
          <Button size="lg" variant="gold" onClick={onOpenSofia}>
            Quero começar agora
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
