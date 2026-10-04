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
    question: "Como funciona? Preciso comprar estoque?",
    answer:
      `Não! A ${BRAND.nome} trabalha no sistema de consignação. Você recebe a maleta com as peças, vende durante 30 dias e depois vem até a loja para fazer o acerto: paga só o que vendeu e devolve o restante. Sem investimento inicial e sem risco.`,
  },
  {
    question: "Qual é a comissão que vou ganhar?",
    answer:
      "A comissão começa em 30% e pode chegar a 50% conforme o seu volume de vendas. Quanto mais você vende, maior a sua porcentagem. Tudo combinado com transparência na hora do acerto.",
  },
  {
    question: "Quantas peças vêm na primeira maleta?",
    answer:
      "Na primeira maleta você recebe cerca de 50 peças. São semijoias selecionadas para facilitar a sua apresentação para as clientes, incluindo brincos, anéis, colares e pulseiras.",
  },
  {
    question: "Com que frequência faço o acerto?",
    answer:
      `O acerto é feito uma vez por mês, 30 dias após retirar a maleta. Você vem até a ${BRAND.nome}, apresenta o que vendeu, faz o pagamento e pode renovar as peças.`,
  },
  {
    question: "Preciso ter experiência com vendas?",
    answer:
      "Não é obrigatório. Damos treinamento completo para quem está começando agora. Ter experiência com vendas de roupas, cosméticos ou joias conta como diferencial, mas não é exigido.",
  },
  {
    question: "Qual é a idade mínima para participar?",
    answer:
      "A idade mínima é 18 anos.",
  },
  {
    question: "Preciso ter Instagram para me candidatar?",
    answer:
      "Sim! O Instagram é obrigatório no nosso processo. Ele é importante para a análise do perfil e também será uma das suas principais ferramentas de vendas. Instagram pessoal e profissional (se tiver) devem ser informados.",
  },
  {
    question: "Preciso estar empregada para participar?",
    answer:
      "Sim, priorizamos candidatas que estejam trabalhando atualmente. Ter estabilidade profissional é um fator importante no nosso processo de seleção.",
  },
  {
    question: "A Rose atende a minha cidade?",
    answer:
      `Atendemos atualmente: ${BRAND.cidadesTexto}. Se você mora em outra cidade da região do ABC Paulista, entre em contato para verificarmos a viabilidade.`,
  },
  {
    question: "Em quanto tempo recebo uma resposta após o cadastro?",
    answer:
      `Assim que recebermos sua candidatura, a ${BRAND.dona} analisa pessoalmente. Você será avisada por WhatsApp em alguns dias úteis.`,
  },
  {
    question: "O que acontece depois que sou aprovada?",
    answer:
      `Após a pré-aprovação, a ${BRAND.dona} entra em contato pelo WhatsApp para dar os próximos passos. Você vai preencher uma ficha completa, enviar documentos (RG e comprovante de residência) e, depois, retirar a sua primeira maleta.`,
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
