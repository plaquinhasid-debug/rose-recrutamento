import { BRAND } from "@tania-joias/shared"
// IMPLEMENTATION-LGPD-001A — atualização mínima: corrige a codificação de
// caracteres (o texto anterior estava salvo com acentuação corrompida,
// ex.: "PolÃ­tica" em vez de "Política") e acrescenta transparência sobre
// Inteligência Artificial, Meta Ads (Pixel/CAPI) e os prestadores realmente
// usados hoje. Não declara base legal para Pixel/CAPI (pendente de
// validação jurídica, RFC-LGPD-002) e não cria nenhum mecanismo de
// consentimento novo — só texto informativo.
const sections = [
  {
    title: "1. Dados que podemos coletar",
    body: "Podemos coletar nome, telefone, cidade, respostas fornecidas em formulários ou conversas, dados de candidatura e informações técnicas de acesso, como data, horário, dispositivo e origem da visita.",
  },
  {
    title: "2. Como usamos os dados",
    body: "Usamos os dados para atender interessadas, conduzir processos de cadastro e seleção de revendedoras, responder mensagens, enviar informações solicitadas, melhorar nossos serviços, prevenir fraudes e cumprir obrigações legais.",
  },
  {
    title: "3. Uso de Inteligência Artificial",
    body: "Tecnologias de Inteligência Artificial podem auxiliar na análise das informações fornecidas, na interação com a assistente virtual Sofia e nas respostas a dúvidas durante a conversa. A IA é uma ferramenta de apoio: as regras de elegibilidade e avaliação do processo seletivo são determinísticas e independentes da IA, que nunca decide sozinha quem é aprovado ou reprovado.",
  },
  {
    title: "4. Meta Ads e mensuração de campanhas",
    body: "Utilizamos tecnologias da Meta (Pixel e API de Conversões) para medir o desempenho de campanhas publicitárias e entender de qual anúncio uma visita ou candidatura se originou. Isso pode envolver o envio de dados técnicos do navegador e um número de telefone criptografado à Meta. Essas mesmas tecnologias (Meta/WhatsApp) também são usadas para comunicação, como explicado na seção seguinte.",
  },
  {
    title: "5. WhatsApp e comunicações",
    body: `Quando você entra em contato pelo WhatsApp, tratamos seu número, nome de perfil e o conteúdo das mensagens para prestar atendimento. Mensagens iniciadas pela ${BRAND.nome} respeitarão as permissões concedidas, as regras da Plataforma WhatsApp Business e a legislação aplicável.`,
  },
  {
    title: "6. Compartilhamento",
    body: "Os dados podem ser processados por fornecedores essenciais de tecnologia, hospedagem, banco de dados, comunicação e Inteligência Artificial, incluindo Meta/WhatsApp, Vercel, Supabase, Anthropic (Claude) e Resend, somente na medida necessária para operar os serviços. Não vendemos dados pessoais.",
  },
  {
    title: "7. Armazenamento e segurança",
    body: "Mantemos os dados pelo tempo necessário às finalidades informadas, ao exercício regular de direitos e ao cumprimento de obrigações legais. Adotamos medidas técnicas e administrativas razoáveis para protegê-los contra acesso, alteração ou divulgação indevidos.",
  },
  {
    title: "8. Seus direitos",
    body: "Nos termos da LGPD, você pode solicitar confirmação do tratamento, acesso, correção, portabilidade, informações sobre compartilhamento, revogação do consentimento e, quando aplicável, anonimização, bloqueio ou exclusão dos dados.",
  },
  {
    title: "9. Exclusão de dados",
    body: `Para solicitar acesso, correção ou exclusão de seus dados, envie um e-mail para ${BRAND.emailContato}, informando seu nome e telefone. Poderemos solicitar informações adicionais apenas para confirmar a identidade do solicitante.`,
  },
  {
    title: "10. Atualizações desta política",
    body: "Esta política pode ser atualizada para refletir mudanças legais ou operacionais. A versão vigente estará sempre disponível nesta página.",
  },
]

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <a href="/" className="font-display text-xl font-semibold">
            {BRAND.nome}
          </a>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar ao site
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-gold">
          Privacidade e proteção de dados
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Política de Privacidade
        </h1>
        <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
          A {BRAND.nome} respeita sua privacidade e trata dados pessoais com transparência,
          segurança e de acordo com a Lei Geral de Proteção de Dados (LGPD). Esta política
          explica como os dados são tratados em nosso site, formulários e atendimento pelo
          WhatsApp.
        </p>

        <div className="mt-12 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-2xl font-semibold">{section.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-2xl border border-border bg-secondary p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold">Contato</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Controladora: {BRAND.nome}<br />
            E-mail: <a className="underline hover:text-foreground" href={`mailto:${BRAND.emailContato}`}>{BRAND.emailContato}</a>
          </p>
        </section>

        <p className="mt-8 text-sm text-muted-foreground">Última atualização: 19 de agosto de 2026.</p>
      </main>
    </div>
  )
}
