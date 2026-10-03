import { BRAND } from "@tania-joias/shared"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Reveal } from "@/components/Reveal"

const FAQ_ITEMS = [
  {
    question: "Preciso estar empregada para participar?",
    answer:
      "Hoje priorizamos candidatas que já estejam trabalhando, pois isso costuma indicar mais estabilidade para conciliar a revenda. Se não for o seu caso no momento, seu cadastro fica salvo para futuras oportunidades.",
  },
  {
    question: "Preciso investir algum valor para começar?",
    answer:
      `Não. Você não precisa comprar estoque antecipado para começar a revender com a ${BRAND.nome}.`,
  },
  {
    question: "Preciso ter experiência com vendas?",
    answer:
      "Não é obrigatório. Damos treinamento completo para quem está começando agora. Ter alguma experiência é um diferencial, mas não é exigido.",
  },
  {
    question: "Quanto tempo por dia preciso dedicar?",
    answer:
      "Você decide. Muitas revendedoras começam com 1 a 2 horas por dia e ajustam o ritmo conforme os resultados.",
  },
  {
    question: "Como recebo o Mostruário de produtos?",
    answer:
      "Após a aprovação do seu cadastro, nossa equipe libera o acesso ao Mostruário completo e aos materiais de divulgação.",
  },
  {
    question: "Em quanto tempo recebo uma resposta após o cadastro?",
    answer:
      "Normalmente em poucos dias úteis. Você será avisada assim que sua candidatura for analisada.",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="mt-4 text-muted-foreground">
            Tudo o que você precisa saber antes de se candidatar.
          </p>
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
  )
}
