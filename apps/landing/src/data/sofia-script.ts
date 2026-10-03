/**
 * Roteiro da Sofia como DADOS, não como IA de verdade — é um wizard
 * determinístico. Cada etapa descreve a pergunta, o tipo de input e a
 * validação (Zod) esperada. `useSofiaFlow` percorre este array e decide
 * a próxima etapa com base nas respostas já dadas (função `skip`).
 */
import { z } from "zod"
import { BRAND, identificacaoSchema, qualificacaoSchema } from "@tania-joias/shared"

import type { SofiaAnswerKey, SofiaAnswers } from "@/types/sofia"

// Reforça logo de cara que é rápido e sem compromisso — dado real (Admin >
// Abandonos, 12/08/2026): ~78% de quem abandona a conversa sai antes de
// responder a primeira pergunta, sem digitar nada. Objetivo é reduzir essa
// hesitação inicial.
export const SOFIA_INTRO_LINES = [
  "Olá 🌸",
  `Sou a ${BRAND.assistente}, assistente virtual da ${BRAND.nome}.`,
  "Vou te fazer só algumas perguntas rápidas pra ver se você já pode começar a vender com a gente — sem compromisso.",
  "Leva menos de 2 minutos.",
] as const

// Texto oficial e imutável da regra "Você trabalha atualmente?" — nunca deve
// ser gerado ou parafraseado por IA. Atualizado na RFC-INTELLIGENCE-006 pra
// refletir a regra ampla de atividade profissional do Knowledge Layer
// (docs/knowledge/COM-002-recrutamento.md v1.2) — a lista fechada anterior
// (empresa/escola/hospital/cabeleireira) foi substituída por uma descrição
// aberta, sem revelar o racional interno de risco/segurança da consignação.
// Verbatim, sem paráfrase — só dividido em 2 linhas pra caber no formato de
// bolhas de chat já usado no roteiro.
export const SOFIA_REJECTION_LINES = [
  "No momento, um dos requisitos para ser revendedora é estar trabalhando ou exercer alguma atividade profissional ativa — seja como funcionária, autônoma, comerciante ou em qualquer outra ocupação real.",
  "Por esse motivo, não conseguimos seguir com sua candidatura agora — mas você pode se candidatar novamente assim que essa situação mudar.",
] as const

// Deixa explícito que isso é só a 1ª etapa e o que vem a seguir — antes só
// dizia "aprovado" sem dizer o quê, o que deixava a candidata sem saber que
// ainda falta preencher a Ficha (segunda etapa) pra receber o Mostruário.
export const SOFIA_APPROVED_LINES = [
  "Parabéns! 🌸",
  "Você concluiu a primeira etapa e está pré-aprovada!",
  "Em breve você vai receber um link pelo WhatsApp pra preencher a segunda parte do cadastro — é rápido.",
  "Depois de confirmado, seu Mostruário já pode ser liberado.",
] as const

export const SOFIA_EM_ANALISE_LINES = [
  "Muito obrigada por compartilhar tudo isso com a gente!",
  "Sua candidatura já está em análise pela nossa equipe.",
  "Em breve entraremos em contato com uma novidade.",
] as const

export const SOFIA_REPROVADA_FINAL_LINES = [
  "Muito obrigada por compartilhar tudo isso com a gente!",
  "Hoje seu perfil não seguiu para a próxima etapa.",
  `Vamos guardar seu cadastro para futuras oportunidades na ${BRAND.nome}.`,
] as const

// IMPLEMENTATION-LGPD-001A — mesmo valor do gate server-side
// (`finalize-candidate/logic.ts`, `IDADE_MINIMA`). Duplicado deliberadamente:
// o encerramento por menoridade precisa acontecer no CLIENTE, antes de
// telefone/profissão/empresa/Instagram serem perguntados e antes de
// qualquer chamada a `finalize-candidate` — não dá pra depender só do gate
// do servidor, que já roda tarde demais (depois de coletar tudo).
export const IDADE_MINIMA = 18

/** `true` quando a idade informada é insuficiente para seguir no processo. */
export function isMenorDeIdade(idade: number): boolean {
  return Number.isInteger(idade) && idade < IDADE_MINIMA
}

// Auditoria set/2026 — a etapa "Qual é o seu @ do Instagram?" prendia a
// candidata num loop de "não peguei sua resposta" quando ela dizia que possui
// Instagram mas respondia com algo que o classificador não reconhecia como
// handle (nome do perfil/negócio, "não uso muito", etc.). Caso real: 9
// tentativas e abandono. `isInstagramSkipSignal` distingue "não sei / não
// tenho / não quero informar" (segue SEM Instagram, campo nulo — nunca
// inventamos um @) de um valor informado de verdade. Lista curta e
// conservadora, mesma filosofia baseada em marcador do resto do roteiro
// (não é NLP). Instagram NÃO é gate de elegibilidade (`finalize-candidate/
// logic.ts` -> `calcularElegibilidade`); no IPR ele soma pontos apenas pela
// PRESENÇA do campo (`instagram: payload.instagram ? pesos.instagram : 0`),
// então quem pular só deixa de somar esses pontos — nunca é reprovada por isso.
export function isInstagramSkipSignal(raw: string): boolean {
  const texto = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!?…]+$/u, "")
    .trim()

  if (!texto) return true

  const EXATOS = new Set(["nao", "n", "-", "--", "x", "nenhum", "nenhuma", "pular", "passar", "skip"])
  if (EXATOS.has(texto)) return true

  const CONTIDOS = [
    "nao sei",
    "n sei",
    "sei nao",
    "nao lembro",
    "n lembro",
    "nao me lembro",
    "nao recordo",
    "nao tenho",
    "n tenho",
    "nao possuo",
    "nao uso",
    "n uso",
    "quase nao uso",
    "nao mexo",
    "sem instagram",
    "nao tenho conta",
    "nao quero",
    "prefiro nao",
    "nao vou informar",
    "nao informo",
  ]
  return CONTIDOS.some((marcador) => texto.includes(marcador))
}

// Texto cordial de encerramento por menoridade — nunca deve soar como um
// erro de formulário. Diferente de `SOFIA_REJECTION_LINES` (que é sobre não
// estar trabalhando), este encerramento é definitivo pra ESTA candidatura,
// mas deixa claro que ela pode voltar ao completar 18 anos.
export const SOFIA_MENOR_IDADE_LINES = [
  "Obrigada pelo seu interesse 💛",
  "Para participar do nosso processo de revendedoras, é necessário ter 18 anos ou mais.",
  "Quando você completar 18 anos, poderá fazer uma nova inscrição.",
] as const

interface SofiaStepBase {
  key: SofiaAnswerKey
  question: string
  /** Se retornar true, esta etapa é pulada dado o estado atual das respostas. */
  skip?: (answers: SofiaAnswers) => boolean
}

export interface SofiaTextStep extends SofiaStepBase {
  kind: "text" | "textarea"
  placeholder?: string
  schema: z.ZodTypeAny
}

export interface SofiaYesNoStep extends SofiaStepBase {
  kind: "yesno"
  yesLabel: string
  noLabel: string
}

export interface SofiaChipsStep extends SofiaStepBase {
  kind: "chips"
  chips: readonly string[]
  placeholder?: string
  schema: z.ZodTypeAny
}

export type SofiaStep = SofiaTextStep | SofiaYesNoStep | SofiaChipsStep

const instagramHandleSchema = z
  .string()
  .trim()
  // `.min(1)` só garante que a candidata escreveu ALGUMA coisa (um @, o nome
  // do perfil, ou "não tenho" pra pular) — nunca é gate de aprovação. Quem
  // pula tem o campo tratado como nulo em `useSofiaFlow` (ver
  // `isInstagramSkipSignal`).
  .min(1, 'Escreva seu @ do Instagram ou "não tenho".')

// IMPLEMENTATION-LGPD-001A — deliberadamente SEM `.min(18)` (diferente de
// `identificacaoSchema.shape.idade`, que continua com o mínimo de 18 pra
// qualquer outro uso futuro). A candidata precisa conseguir DIGITAR a idade
// real e ter a resposta aceita — é `useSofiaFlow.ts` (via `isMenorDeIdade`)
// quem decide o que fazer depois, de forma conversacional (mensagem cordial
// + encerramento), em vez do formulário rejeitar com um erro de validação
// cru antes da Sofia sequer "saber" a idade informada.
const idadeWizardSchema = z.coerce
  .number({ invalid_type_error: "Informe uma idade válida" })
  .int()
  .min(1, "Informe uma idade válida")
  .max(99, "Informe uma idade válida")

const trabalhaFalso = (answers: SofiaAnswers) => answers.trabalha !== true

/** Roteiro completo, na ordem em que deve ser perguntado. */
export const SOFIA_STEPS: SofiaStep[] = [
  {
    key: "nome",
    kind: "text",
    question: "Qual é o seu nome completo?",
    placeholder: "Seu nome completo",
    schema: identificacaoSchema.shape.nome,
  },
  {
    key: "cidade",
    kind: "text",
    question: "Em qual cidade você mora?",
    placeholder: "Sua cidade",
    schema: identificacaoSchema.shape.cidade,
  },
  {
    key: "idade",
    kind: "text",
    question: "Qual é a sua idade?",
    placeholder: "Ex.: 28",
    schema: idadeWizardSchema,
  },
  {
    key: "telefone",
    kind: "text",
    question: "Qual é o seu telefone com DDD?",
    placeholder: "(11) 91234-5678",
    schema: identificacaoSchema.shape.telefone,
  },
  {
    key: "trabalha",
    kind: "yesno",
    question: "Você trabalha atualmente?",
    yesLabel: "Sim, trabalho",
    noLabel: "Não trabalho",
  },
  {
    key: "profissao",
    kind: "text",
    question: "Profissão?",
    placeholder: "Sua profissão",
    schema: qualificacaoSchema.shape.profissao,
    skip: trabalhaFalso,
  },
  {
    key: "empresa_atual",
    kind: "text",
    // Pergunta base — quando a IA contextual estiver ativa (`sofia_ia_ativa`),
    // esta linha é substituída por uma variante que já reage à profissão
    // informada no passo anterior (ver `useSofiaFlow.ts`/`sofia-reagir`).
    // RFC-INTELLIGENCE-006: texto ajustado pra deixar claro que atividade
    // autônoma/comercial também conta — o campo já aceitava qualquer texto
    // (nunca foi gate), só a pergunta sugeria "nome de empresa" com força
    // demais.
    question: "Me conta rapidinho sobre seu trabalho hoje — pode ser empresa, seu próprio negócio, ou atividade autônoma.",
    placeholder: "Ex.: nome da empresa, ou 'trabalho por conta própria'",
    schema: qualificacaoSchema.shape.empresa_atual,
    skip: trabalhaFalso,
  },
  {
    // QUALIFICACAO-002, Parte 1 — coleta estruturada de "estabilidade
    // profissional" (regularidade da atividade AUTODECLARADA, não é medida
    // de risco/garantia). Mesmo padrão de `tempo_disponivel`: chips com
    // fallback de texto livre. A normalização do texto do chip pra
    // ALTA/MEDIA/BAIXA acontece só em `finalize-candidate` — este passo
    // NUNCA participa de calcularIpr/decidirStatus/classificarPerfil.
    key: "estabilidade_profissional",
    kind: "chips",
    question: "Sua rotina de trabalho hoje é mais fixa, ou mais variável?",
    chips: ["Fixa — mesma empresa/local, mesma escala", "Variável, mas recorrente", "Esporádica, sem muita regularidade"],
    placeholder: "Ou descreva com suas palavras",
    schema: qualificacaoSchema.shape.estabilidade_profissional,
    skip: trabalhaFalso,
  },
  {
    key: "experiencia_vendas",
    kind: "yesno",
    question: "Você já trabalhou com vendas?",
    yesLabel: "Sim",
    noLabel: "Não",
    skip: trabalhaFalso,
  },
  {
    key: "whatsapp",
    kind: "yesno",
    question: "O telefone informado possui WhatsApp?",
    yesLabel: "Sim",
    noLabel: "Não",
    skip: trabalhaFalso,
  },
  {
    key: "possui_instagram",
    kind: "yesno",
    question: "Você possui Instagram?",
    yesLabel: "Sim",
    noLabel: "Não",
    skip: trabalhaFalso,
  },
  {
    key: "instagram",
    kind: "text",
    // Auditoria set/2026 — a pergunta central ("Qual é o seu @ do Instagram?")
    // é preservada, mas agora traz uma saída explícita: a candidata que não
    // tiver/não lembrar escreve "não tenho" e o fluxo segue sem Instagram, em
    // vez de ficar re-perguntando (ver `isInstagramSkipSignal` e o tratamento
    // desta etapa em `useSofiaFlow.ts`).
    question:
      'Qual é o seu @ do Instagram?\n\nSe você não tiver ou não lembrar agora, é só escrever "não tenho" que a gente segue sem.',
    placeholder: '@seuusuario (ou "não tenho")',
    schema: instagramHandleSchema,
    skip: (answers) => trabalhaFalso(answers) || answers.possui_instagram !== true,
  },
  {
    key: "tempo_disponivel",
    kind: "chips",
    question: "Quanto tempo você pode dedicar por dia?",
    chips: ["1 hora", "2 horas", "3+ horas"],
    placeholder: "Ou digite outro valor",
    schema: qualificacaoSchema.shape.tempo_disponivel,
    skip: trabalhaFalso,
  },
  {
    key: "objetivo",
    kind: "textarea",
    question: `Por que você deseja trabalhar com a ${BRAND.nome}?`,
    placeholder: "Conte um pouco sobre o seu objetivo...",
    schema: qualificacaoSchema.shape.objetivo,
    skip: trabalhaFalso,
  },
]

/** Encontra o índice da próxima etapa não pulada, a partir de `fromIndex` (inclusive). */
export function findNextStepIndex(fromIndex: number, answers: SofiaAnswers): number {
  for (let i = fromIndex; i < SOFIA_STEPS.length; i++) {
    const step = SOFIA_STEPS[i]
    if (!step.skip || !step.skip(answers)) return i
  }
  return SOFIA_STEPS.length
}
