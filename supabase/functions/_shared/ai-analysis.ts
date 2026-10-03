import { BRAND } from "./brand.ts"
// Helper compartilhado para gerar, via Anthropic (Claude), a análise
// completa da Sofia sobre uma candidata (resumos, scores e recomendações
// consultivas).
//
// Usado em `finalize-candidate` apenas para enriquecer o que a equipe lê no
// Admin — a decisão de negócio (status aprovada/em_analise/reprovada e o
// rótulo oficial de perfil_comercial) continua sendo calculada pelo motor de
// regras (IPR), nunca pela IA. Todo campo consultivo (`perfil_sugerido_ia`,
// `icp_score`, `probabilidade_sucesso`, etc.) é explicitamente NÃO-VINCULANTE
// — ver comentário da coluna `ai_analysis.perfil_sugerido_ia` na migration.
//
// A saída estruturada é obtida forçando o uso de uma "tool" (não existe
// response_format/json_schema na Messages API da Anthropic).
//
// Lança em caso de falha de rede/API/timeout — o chamador deve capturar e
// cair no texto determinístico (best-effort, nunca deve derrubar o fluxo
// principal do lead).

export type PerfilSugeridoIa = "baixo" | "medio" | "alto" | "excelente"
export type PotencialEmpreendedor = "baixo" | "medio" | "alto" | "muito_alto"
export type ProximaAcao = "ligar_imediatamente" | "enviar_whatsapp" | "analise_manual" | "aguardar"
export type Sentimento = "muito_motivada" | "motivada" | "neutra" | "insegura" | "desmotivada"
export type MotivacaoPrincipal =
  | "renda_extra"
  | "independencia_financeira"
  | "sonho_pessoal"
  | "flexibilidade"
  | "empreender"
  | "outro"

/** Perfil de qualificação de negócio que orienta o raciocínio da IA — nunca vira pergunta explícita pra candidata. */
export interface PerfilQualificacaoNegocio {
  cidadesAtendidas: string[]
  profissoesPreferidas: string[]
}

export interface AiAnalysisInput {
  apiKey: string
  nome: string
  cidade?: string
  idade?: number
  profissao?: string
  empresaAtual?: string
  experienciaVendas?: boolean
  whatsapp?: boolean
  possuiInstagram: boolean
  tempoDisponivel?: string
  objetivo?: string
  perfilComercial: "alto" | "medio" | "baixo"
  ipr: number
  qualificacao: PerfilQualificacaoNegocio
}

export interface AiAnalysisResult {
  resumo: string
  perfilMotivo: string
  resumoExecutivo: string
  resumoComercial: string
  resumoComportamental: string
  resumoMotivacional: string
  icpScore: number
  perfilSugeridoIa: PerfilSugeridoIa
  potencialEmpreendedor: PotencialEmpreendedor
  probabilidadeSucesso: number
  grauConfiancaIa: number
  grauConfiancaExplicacao: string
  proximaAcao: ProximaAcao
  sentimento: Sentimento
  motivacaoPrincipal: MotivacaoPrincipal
  pontosFortes: string[]
  pontosAtencao: string[]
}

export const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
// A análise expandida pede 16 campos obrigatórios (vários parágrafos de
// texto) via tool-use — sai bem mais devagar que a versão simples original.
// 8s (usado no Nível 1) estava expirando com frequência e derrubando pro
// fallback determinístico silenciosamente. 20s dá margem confortável.
const REQUEST_TIMEOUT_MS = 20000
const ANTHROPIC_VERSION = "2023-06-01"

const PERFIL_SUGERIDO_VALUES = ["baixo", "medio", "alto", "excelente"] as const
const POTENCIAL_EMPREENDEDOR_VALUES = ["baixo", "medio", "alto", "muito_alto"] as const
const PROXIMA_ACAO_VALUES = ["ligar_imediatamente", "enviar_whatsapp", "analise_manual", "aguardar"] as const
const SENTIMENTO_VALUES = ["muito_motivada", "motivada", "neutra", "insegura", "desmotivada"] as const
const MOTIVACAO_PRINCIPAL_VALUES = [
  "renda_extra",
  "independencia_financeira",
  "sonho_pessoal",
  "flexibilidade",
  "empreender",
  "outro",
] as const

const ANALYSIS_TOOL = {
  name: "registrar_analise",
  description: "Registra a análise completa da Sofia sobre a candidata.",
  input_schema: {
    type: "object",
    properties: {
      resumo_executivo: {
        type: "string",
        description: "2 a 3 frases: visão geral rápida da candidata, para leitura em poucos segundos.",
      },
      resumo_comercial: {
        type: "string",
        description: "2 a 3 frases focadas em potencial comercial/de vendas.",
      },
      resumo_comportamental: {
        type: "string",
        description: "2 a 3 frases sobre comunicação, organização, segurança e facilidade de relacionamento.",
      },
      resumo_motivacional: {
        type: "string",
        description: "2 a 3 frases sobre o que motiva a candidata a querer essa oportunidade.",
      },
      perfil_motivo: {
        type: "string",
        description:
          "1 a 2 frases explicando por que a candidata recebeu o perfil comercial OFICIAL já decidido pelo motor de regras, citando os fatores concretos (sem contradizer ou sugerir mudar o rótulo).",
      },
      icp_score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Índice de Compatibilidade de Perfil (0-100), com base em motivação, comunicação, perfil comercial, objetivos, interesse, experiência e organização.",
      },
      perfil_sugerido_ia: {
        type: "string",
        enum: PERFIL_SUGERIDO_VALUES,
        description: "Impressão consultiva da IA sobre o perfil comercial — independente do perfil oficial, pode divergir.",
      },
      potencial_empreendedor: {
        type: "string",
        enum: POTENCIAL_EMPREENDEDOR_VALUES,
      },
      probabilidade_sucesso: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Probabilidade estimada de sucesso como revendedora (0-100%).",
      },
      grau_confianca_ia: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Quão confiante a IA está na própria análise, dado o quanto de informação a candidata compartilhou.",
      },
      grau_confianca_explicacao: {
        type: "string",
        description: "1 frase curta explicando o grau de confiança.",
      },
      proxima_acao: {
        type: "string",
        enum: PROXIMA_ACAO_VALUES,
        description: "Ação recomendada para a equipe — sugestão apenas, a equipe decide de fato.",
      },
      sentimento: {
        type: "string",
        enum: SENTIMENTO_VALUES,
        description: "Sentimento percebido na forma como a candidata respondeu.",
      },
      motivacao_principal: {
        type: "string",
        enum: MOTIVACAO_PRINCIPAL_VALUES,
      },
      pontos_fortes: {
        type: "array",
        items: { type: "string" },
        description: "Lista curta (2 a 5 itens) de pontos fortes concretos, frases curtas.",
      },
      pontos_atencao: {
        type: "array",
        items: { type: "string" },
        description: "Lista curta (0 a 5 itens) de pontos de atenção concretos, frases curtas. Pode ser vazia.",
      },
    },
    required: [
      "resumo_executivo",
      "resumo_comercial",
      "resumo_comportamental",
      "resumo_motivacional",
      "perfil_motivo",
      "icp_score",
      "perfil_sugerido_ia",
      "potencial_empreendedor",
      "probabilidade_sucesso",
      "grau_confianca_ia",
      "grau_confianca_explicacao",
      "proxima_acao",
      "sentimento",
      "motivacao_principal",
      "pontos_fortes",
      "pontos_atencao",
    ],
  },
} as const

function buildSystemPrompt(qualificacao: PerfilQualificacaoNegocio): string {
  return (
    `Você é a Sofia, Consultora Oficial de Recrutamento da ${BRAND.nome} (revenda de semijoias). Sua missão é ` +
    "avaliar candidatas a revendedora com a sensibilidade de uma recrutadora humana experiente: elegante, calma, " +
    "empática, nunca robótica. Escreva sempre em português do Brasil.\n\n" +
    "Use apenas os fatos fornecidos — nunca invente informação. A decisão de aprovar/reprovar/colocar em análise " +
    "NÃO é sua: isso já foi calculado por um motor de regras determinístico (IPR) antes de você ser chamada. Você " +
    "também não decide o perfil_comercial oficial — apenas explica-o em perfil_motivo. Todos os outros campos " +
    "(icp_score, perfil_sugerido_ia, potencial_empreendedor, probabilidade_sucesso, etc.) são sua opinião " +
    `CONSULTIVA e NÃO-VINCULANTE — a equipe da ${BRAND.nome} decide o que fazer com ela.\n\n` +
    "Contexto de negócio para orientar seu raciocínio (nunca cite isso como pergunta à candidata, ela já respondeu " +
    "tudo que precisava):\n" +
    `- Cidades atendidas pela revenda: ${qualificacao.cidadesAtendidas.join(", ") || "não restrito"}.\n` +
    `- Profissões que costumam indicar bom encaixe (sinal positivo, não obrigatório — reconheça profissões ` +
    `semelhantes ou do mesmo tipo, como atendimento ao público/círculo social de confiança): ` +
    `${qualificacao.profissoesPreferidas.join(", ")}.\n` +
    "- Há preferência por candidatas que trabalham em uma empresa/local fixo, não de forma autônoma/em casa. " +
    "Infira isso a partir da profissão e do nome da empresa informados, quando der pra perceber com razoável " +
    "confiança; se não for possível saber, não penalize por isso, apenas não conte como sinal extra.\n\n" +
    "Sempre use a ferramenta `registrar_analise` para responder."
  )
}

function buildUserPrompt(input: AiAnalysisInput): string {
  const linhas = [
    `Nome: ${input.nome}`,
    input.cidade ? `Cidade: ${input.cidade}` : null,
    input.idade ? `Idade: ${input.idade}` : null,
    `Profissão atual: ${input.profissao ?? "não informado"}`,
    input.empresaAtual ? `Empresa atual: ${input.empresaAtual}` : null,
    `Já trabalhou com vendas: ${input.experienciaVendas ? "sim" : "não"}`,
    `Tem WhatsApp no telefone informado: ${input.whatsapp ? "sim" : "não"}`,
    `Tem Instagram: ${input.possuiInstagram ? "sim" : "não"}`,
    input.tempoDisponivel ? `Tempo disponível por dia: ${input.tempoDisponivel}` : null,
    input.objetivo ? `Motivação relatada pela candidata (texto livre): "${input.objetivo}"` : null,
    `Perfil comercial OFICIAL já decidido pelo motor de regras: ${input.perfilComercial} (score IPR: ${input.ipr})`,
  ]
  return linhas.filter(Boolean).join("\n")
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

export async function generateAiAnalysis(input: AiAnalysisInput): Promise<AiAnalysisResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1536,
      system: buildSystemPrompt(input.qualificacao),
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`anthropic_api_error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const toolUse = (data?.content as Array<Record<string, unknown>> | undefined)?.find(
    (block) => block.type === "tool_use" && block.name === ANALYSIS_TOOL.name,
  )
  const out = toolUse?.input as Record<string, unknown> | undefined

  if (
    typeof out?.resumo_executivo !== "string" ||
    typeof out?.resumo_comercial !== "string" ||
    typeof out?.resumo_comportamental !== "string" ||
    typeof out?.resumo_motivacional !== "string" ||
    typeof out?.perfil_motivo !== "string" ||
    typeof out?.icp_score !== "number" ||
    !asOneOf(out?.perfil_sugerido_ia, PERFIL_SUGERIDO_VALUES) ||
    !asOneOf(out?.potencial_empreendedor, POTENCIAL_EMPREENDEDOR_VALUES) ||
    typeof out?.probabilidade_sucesso !== "number" ||
    typeof out?.grau_confianca_ia !== "number" ||
    typeof out?.grau_confianca_explicacao !== "string" ||
    !asOneOf(out?.proxima_acao, PROXIMA_ACAO_VALUES) ||
    !asOneOf(out?.sentimento, SENTIMENTO_VALUES) ||
    !asOneOf(out?.motivacao_principal, MOTIVACAO_PRINCIPAL_VALUES)
  ) {
    throw new Error("anthropic_api_error: resposta fora do formato esperado")
  }

  return {
    resumo: out.resumo_executivo,
    perfilMotivo: out.perfil_motivo,
    resumoExecutivo: out.resumo_executivo,
    resumoComercial: out.resumo_comercial,
    resumoComportamental: out.resumo_comportamental,
    resumoMotivacional: out.resumo_motivacional,
    icpScore: Math.max(0, Math.min(100, Math.round(out.icp_score))),
    perfilSugeridoIa: out.perfil_sugerido_ia,
    potencialEmpreendedor: out.potencial_empreendedor,
    probabilidadeSucesso: Math.max(0, Math.min(100, Math.round(out.probabilidade_sucesso))),
    grauConfiancaIa: Math.max(0, Math.min(100, Math.round(out.grau_confianca_ia))),
    grauConfiancaExplicacao: out.grau_confianca_explicacao,
    proximaAcao: out.proxima_acao,
    sentimento: out.sentimento,
    motivacaoPrincipal: out.motivacao_principal,
    pontosFortes: asStringArray(out.pontos_fortes),
    pontosAtencao: asStringArray(out.pontos_atencao),
  }
}
