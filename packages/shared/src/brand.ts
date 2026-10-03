/**
 * FICHA DA MARCA — único lugar com nome, contatos, textos comerciais e
 * depoimentos da empresa. Para criar o sistema de outra empresa, copie o
 * projeto e edite SÓ este arquivo (+ logo/fotos em apps/landing/public/assets
 * e cores em apps/landing/src/index.css / apps/admin/src/index.css).
 *
 * Regras que ficam no BANCO (Admin → Configurações), não aqui:
 * cidades atendidas, pesos/notas do IPR, flags de IA.
 *
 * ⚠️ Campos marcados com TODO ainda precisam da informação real da Carol.
 */

export interface Depoimento {
  nome: string
  cidade: string
  texto: string
}

export const BRAND = {
  /** Nome comercial exibido em todo o sistema. */
  nome: "Rose Semi Jóias",
  /** Nome curto (cabeçalho, rodapé, SEO). */
  nomeCurto: "Rose Semi Jóias",
  slogan: "Semijoias premium",

  /** Dona que aprova as revendedoras (aparece no Admin e nas mensagens). */
  dona: "Carol",

  /** Assistente virtual da landing. */
  assistente: "Sofia",

  /** Destaque comercial do Hero e do card de margem. TODO: confirmar com a Carol. */
  comissaoMaxima: "40%",

  /** Texto livre das cidades atendidas (exibição). A regra que pontua fica no banco. TODO */
  cidadesTexto: "TODO: cidades atendidas pela Rose",

  /** E-mail de contato (política de privacidade / LGPD). TODO */
  emailContato: "TODO@gmail.com",

  instagramUrl: "https://www.instagram.com/TODO/", // TODO
  endereco: "TODO: endereço da Rose Semi Jóias", // TODO
  telefoneExibicao: "(11) 9TODO-0000", // TODO
  telefoneTel: "+5511900000000", // TODO

  /** Faixas de ganho exibidas em "Quanto posso ganhar". TODO: validar com a Carol. */
  faixasGanho: [
    { label: "Começando", horas: "1 hora por dia", faixa: "R$ 300 – R$ 600 /mês", descricao: "Vendendo para amigas e família, divulgando nas suas redes.", destaque: false },
    { label: "Consistente", horas: "2 a 3 horas por dia", faixa: "R$ 800 – R$ 1.800 /mês", descricao: "Com uma carteira de clientes fiéis e divulgação regular.", destaque: true },
    { label: "Dedicada", horas: "4+ horas por dia", faixa: "R$ 2.000+ /mês", descricao: "Tratando a revenda como uma atividade principal.", destaque: false },
  ],

  /**
   * Depoimentos REAIS de revendedoras da marca. Enquanto estiver vazio, a
   * seção "Depoimentos" não aparece na página (nunca usar depoimento de outra
   * empresa nem inventado).
   */
  depoimentos: [] as Depoimento[],

  /** Módulos opcionais. Embaixadoras (programa de indicação) fica desligado no início. */
  modulos: {
    embaixadoras: false,
  },
} as const
