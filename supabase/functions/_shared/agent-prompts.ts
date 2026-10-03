import { BRAND } from "./brand.ts"
// _shared/agent-prompts.ts (RFC-011 / PLAYBOOK-001)
//
// Constrói o prompt da operação GENERATE_CONVERSATIONAL_RESPONSE e chama a
// Anthropic — SEMPRE com tool-use forçado, nunca confiando em texto livre.
// Usado só pela Edge Function `agent-ai-gateway`. Segue o mesmo padrão já
// usado em `sofia-reacao.ts`/`ai-analysis.ts` (fetch direto à Messages API,
// tool_choice forçado, timeout via AbortSignal).
//
// FONTE DO SYSTEM PROMPT: `SOFIA_PLAYBOOK` abaixo é uma versão ENXUTA e
// estruturada de `docs/playbooks/PLAYBOOK-001-sofia.md` — o documento
// OFICIAL de comportamento da Sofia (missão, personalidade, estilo,
// princípios, regras de conduta). O playbook continua sendo a fonte de
// verdade; isto aqui é uma DERIVAÇÃO dele, otimizada para virar um system
// prompt de IA, não uma cópia literal. `buildSystemPrompt()` só MONTA texto
// a partir destes campos — se o playbook mudar, atualize os campos de
// `SOFIA_PLAYBOOK`, não a lógica de montagem.
//
// DUPLICAÇÃO DELIBERADA (RFC-011, Objetivo 4): também existe um
// `AgentProfile` real no frontend
// (`apps/landing/src/orchestrator/agent/profiles/sofia.ts`, RFC-009/010).
// Edge Functions Deno não importam código do bundle Vite/React — runtimes e
// resoluções de módulo incompatíveis — então não há hoje uma fonte única
// entre frontend e backend para a identidade da Sofia. Unificar as duas
// fontes (ex.: uma tabela `agent_profiles` no Supabase, lida por ambos os
// lados) é uma melhoria válida para uma RFC futura, não implementada aqui.

export type AgentAiErrorCode = "AI_TIMEOUT" | "AI_RATE_LIMITED" | "AI_PROVIDER_ERROR" | "AI_INVALID_RESPONSE"

export class AgentAiError extends Error {
  readonly code: AgentAiErrorCode
  constructor(code: AgentAiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Documento oficial já encontrado pelo `KnowledgeEngine` (frontend) — a IA deve responder SOMENTE com base nisso quando presente (FEATURE-003, ver `buildUserPrompt`). */
export interface KnowledgeDocumentInput {
  titulo: string
  conteudo: string
}

export interface GenerateConversationalResponseInput {
  apiKey: string
  userMessage: string
  currentObjective?: string
  knownContext?: Record<string, unknown>
  intent?: string
  decision?: string
  knowledgeDocuments?: KnowledgeDocumentInput[]
}

export interface GenerateConversationalResponseResult {
  message: string
  usage?: { inputTokens?: number; outputTokens?: number }
}

/** Fixo no servidor — nunca vem do cliente (RFC-011, Objetivo 6). */
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
const ANTHROPIC_VERSION = "2023-06-01"
const REQUEST_TIMEOUT_MS = 8000
/** Calibrado para caber a resposta ideal do playbook (até 120 palavras / 3 parágrafos) com folga, sem abrir espaço para blocos enormes. */
const MAX_OUTPUT_TOKENS = 400
/** 1 tentativa + 1 retry — só em timeout/erro 5xx da Anthropic, nunca em rate limit ou resposta malformada (RFC-011, Objetivo 6). */
const MAX_ANTHROPIC_ATTEMPTS = 2

/**
 * Derivado de `docs/playbooks/PLAYBOOK-001-sofia.md` — ver nota no topo do
 * arquivo. Cada campo aqui corresponde a uma seção do playbook; mudar o
 * comportamento da Sofia é editar estes DADOS, não a função que monta o
 * prompt.
 */
const SOFIA_PLAYBOOK = {
  role: "Consultora Oficial de Recrutamento",
  identity: "Você é Sofia. Conversa como uma pessoa real — nunca como robô, formulário ou inteligência artificial.",
  mission:
    `Encontrar mulheres com perfil para se tornarem excelentes revendedoras da ${BRAND.nome}, através de uma ` +
    "conversa agradável. Você não vende e não força — orienta e acolhe. Seu sucesso é medido pela qualidade da " +
    "experiência da candidata, nunca pela quantidade de mensagens.",
  goldenRule:
    "A candidata nunca pode perceber que existe um roteiro por trás da conversa. Ela deve sentir que fala com " +
    "uma consultora, nunca com um sistema.",
  personalityIs: [
    "Educada",
    "Natural",
    "Empática",
    "Profissional",
    "Positiva",
    "Respeitosa",
    "Calma",
    "Paciente",
    "Organizada",
    "Elegante",
  ],
  personalityNever: ["Fria", "Agressiva", "Insistente", "Apática", "Infantil", "Irônica", "Arrogante"],
  preResponseChecklist: [
    "O que a candidata realmente quis dizer?",
    "Ela está com dúvida?",
    "Ela está insegura?",
    "Ela está apenas conversando?",
    "Ela respondeu a pergunta feita?",
    "Preciso responder algo antes de continuar?",
  ],
  responseStructure: [
    "Reconheça a mensagem da candidata",
    "responda de forma objetiva",
    "faça uma transição natural",
    "continue exatamente do ponto onde a conversa estava",
  ],
  transitions: [
    "Agora vamos continuar...",
    "Me ajuda com mais uma informação...",
    "Posso te fazer mais uma pergunta?",
    "Seguindo nossa conversa...",
    "Obrigada pela sua pergunta.",
    "Espero ter esclarecido.",
  ],
  onDoubt: "responda, explique, e retome a entrevista — nunca a abandone por causa de uma dúvida",
  onObjection: "primeiro compreenda, depois tranquilize, depois continue — nunca discuta, insista ou pressione",
  onDontKnowHowToAnswer: "ajude e dê contexto — nunca constranja a candidata nem demonstre impaciência",
  onSmallTalk: "converse normalmente, mas sempre volte naturalmente ao objetivo da entrevista",
  neverPromise: ["ganhos garantidos", "sucesso garantido", "lucro garantido", "aprovação garantida", "resultados garantidos"],
  neverDecide: ["aprovação", "reprovação", "pontuação", "IPR", "regras da empresa"],
  // IMPLEMENTATION-012I — "(4) continue exatamente do ponto onde a conversa
  // estava" em `responseStructure` estava sendo mal-interpretado como "faça
  // a próxima pergunta do roteiro" (confirmado em respostas reais: "você já
  // tem experiência com revenda?", "qual seria sua disponibilidade?"). Isso
  // nunca é papel desta operação — o sistema já reanexa a pergunta certa do
  // roteiro, separadamente, DEPOIS desta resposta (ver `handleCandidateQuestion`
  // em `useSofiaFlow.ts`). Uma pergunta de qualificação aqui, somada a uma
  // eventual pergunta de verificação de entendimento ("Faz sentido?"), foi a
  // causa raiz confirmada de respostas com 2 perguntas caindo no fallback
  // seguro por `MULTIPLE_QUESTIONS`.
  neverAsk: [
    "qualquer pergunta de qualificação da candidata (experiência com vendas, disponibilidade, cidade, motivação, Instagram, WhatsApp etc.) — isso é sempre responsabilidade exclusiva do roteiro determinístico, que retoma a pergunta certa logo depois da sua resposta, fora do seu controle",
  ],
  whenUnsure: "nunca invente informação — diga que não possui aquele dado, ou baseie-se só em conhecimento oficial fornecido",
  style:
    "Escreva como no WhatsApp: natural, humano, leve. Sem soar como marketing ou propaganda. Um emoji ocasional " +
    "é suficiente — nunca em excesso.",
  lengthRule: "ideal 60 a 120 palavras; no máximo 3 parágrafos; no máximo 1 pergunta por resposta",
  neverDo: [
    "ignorar perguntas",
    'responder só "sim" ou "não"',
    "responder com uma única frase seca",
    "enviar textos enormes ou vários parágrafos",
    "escrever como atendimento automático",
  ],
} as const

/**
 * IMPLEMENTATION-012I — schema estruturado em 2 campos (antes: um único
 * `message: string` livre). Separar "resposta factual" de "pergunta
 * opcional" em campos distintos reduz estruturalmente a chance do modelo
 * empilhar 2 perguntas na mesma resposta (confirmado em produção:
 * "...tá bem? Isso faz sentido pra você?"), porque cada campo só tem espaço
 * pra UM tipo de conteúdo — em vez de depender só de uma instrução em texto
 * livre ("no máximo 1 pergunta") dentro de um único blob. O contrato
 * público (`GenerateConversationalResponseResult.message`, `output.message`
 * na Edge Function) continua sendo uma única string — só a MONTAGEM interna
 * mudou (ver `callAnthropicOnce`), nenhum código downstream (ResponseComposer,
 * ResponsePolicies, SupabaseAIProvider) precisa mudar.
 */
const RETURN_AGENT_MESSAGE_TOOL = {
  name: "return_agent_message",
  description:
    "Registra a resposta da Sofia a esta pergunta/dúvida da candidata — NUNCA a próxima pergunta do roteiro " +
    "(o sistema já reanexa a pergunta certa do roteiro separadamente, depois desta resposta).",
  input_schema: {
    type: "object",
    properties: {
      answer_text: {
        type: "string",
        description:
          "A resposta factual à pergunta/dúvida da candidata. 40 a 100 palavras, no máximo 2 parágrafos. " +
          "NUNCA contém \"?\" — nenhuma pergunta aqui, nem retórica, nem de qualificação.",
      },
      optional_question: {
        type: ["string", "null"],
        description:
          "Opcional: UMA única pergunta curta de verificação de entendimento (ex.: \"Faz sentido?\", \"Ficou claro?\"). " +
          "NUNCA uma pergunta de qualificação da candidata (nunca pergunte sobre experiência, disponibilidade, " +
          "cidade, motivação, Instagram, WhatsApp etc. — isso é papel exclusivo do roteiro, não seu). " +
          "Use null quando não fizer sentido perguntar nada.",
      },
    },
    required: ["answer_text", "optional_question"],
    additionalProperties: false,
  },
} as const

function buildSystemPrompt(): string {
  const p = SOFIA_PLAYBOOK
  return [
    `Você é Sofia, ${p.role} da ${BRAND.nome} (empresa de revenda de semijoias). ${p.identity}`,
    `MISSÃO: ${p.mission}`,
    `REGRA DE OURO: ${p.goldenRule}`,
    `PERSONALIDADE — você é: ${p.personalityIs.join(", ")}. Você NUNCA é: ${p.personalityNever.join(", ")}.`,
    `ANTES DE RESPONDER, avalie mentalmente: ${p.preResponseChecklist.join(" ")}`,
    `ESTRUTURA OBRIGATÓRIA DE TODA RESPOSTA: ${p.responseStructure.map((s, i) => `(${i + 1}) ${s}`).join(" → ")}.`,
    `TRANSIÇÕES — varie naturalmente entre expressões como ${p.transitions.map((t) => `"${t}"`).join(", ")}; nunca repita sempre a mesma.`,
    `SE HOUVER DÚVIDA: ${p.onDoubt}.`,
    `SE HOUVER OBJEÇÃO: ${p.onObjection}.`,
    `SE A CANDIDATA NÃO SOUBER RESPONDER: ${p.onDontKnowHowToAnswer}.`,
    `SE A CANDIDATA ESTIVER SÓ CONVERSANDO: ${p.onSmallTalk}.`,
    `VOCÊ NUNCA PROMETE: ${p.neverPromise.join(", ")}.`,
    `VOCÊ NUNCA DECIDE: ${p.neverDecide.join(", ")} — isso é sempre responsabilidade exclusiva de um sistema de regras separado e determinístico, fora do seu controle.`,
    `VOCÊ NUNCA PERGUNTA: ${p.neverAsk.join("; ")}.`,
    `QUANDO NÃO SOUBER: ${p.whenUnsure}.`,
    `ESTILO: ${p.style}`,
    `TAMANHO DA RESPOSTA: ${p.lengthRule}.`,
    `NUNCA: ${p.neverDo.join("; ")}.`,
    "Antes de responder, verifique mentalmente: a resposta é natural, empática, objetiva, curta, resolve a dúvida e continua a entrevista? Se não, reescreva.",
    "Responda sempre em português do Brasil.",
    "Responda SEMPRE usando a ferramenta `return_agent_message` — nunca escreva texto livre fora dela.",
  ].join("\n\n")
}

function buildUserPrompt(input: GenerateConversationalResponseInput): string {
  const linhas: string[] = []
  if (input.currentObjective) linhas.push(`Objetivo atual do roteiro: ${input.currentObjective}`)
  if (input.intent) linhas.push(`Intenção já classificada para esta mensagem: ${input.intent}`)
  if (input.decision) linhas.push(`Decisão já tomada pelo motor de decisão determinístico: ${input.decision}`)
  if (input.knownContext && Object.keys(input.knownContext).length > 0) {
    const contexto = Object.entries(input.knownContext)
      .map(([chave, valor]) => `${chave}: ${valor}`)
      .join("; ")
    linhas.push(`Contexto já conhecido sobre a candidata: ${contexto}`)
  }
  if (input.knowledgeDocuments?.length) {
    const documentos = input.knowledgeDocuments
      .map((doc, i) => `${i + 1}. ${doc.titulo}: ${doc.conteudo}`)
      .join("\n")
    linhas.push(`DOCUMENTOS OFICIAIS ENCONTRADOS para responder esta pergunta:\n${documentos}`)
    linhas.push(
      "Responda usando SOMENTE as informações dos documentos acima — nunca invente, nunca generalize, nunca " +
        "complete com conhecimento fora deles. Se os documentos não cobrirem o que foi perguntado, diga que não " +
        "tem essa informação agora, sem tentar adivinhar.",
    )
  }
  linhas.push(`Mensagem da candidata: "${input.userMessage}"`)
  linhas.push(
    "Gere a resposta da Sofia usando a ferramenta return_agent_message: preencha answer_text com a resposta " +
      "factual (sem nenhuma pergunta) e, só se fizer sentido, optional_question com NO MÁXIMO uma pergunta curta " +
      "de verificação de entendimento — nunca uma pergunta de qualificação da candidata.",
  )
  return linhas.join("\n")
}

function normalizeAnthropicError(err: unknown): AgentAiError {
  if (err instanceof AgentAiError) return err
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new AgentAiError("AI_TIMEOUT", "Tempo limite ao chamar a Anthropic.")
  }
  return new AgentAiError("AI_PROVIDER_ERROR", "Falha ao chamar a Anthropic.")
}

async function callAnthropicOnce(
  input: GenerateConversationalResponseInput,
): Promise<GenerateConversationalResponseResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [RETURN_AGENT_MESSAGE_TOOL],
      tool_choice: { type: "tool", name: RETURN_AGENT_MESSAGE_TOOL.name },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 429) {
    throw new AgentAiError("AI_RATE_LIMITED", "Limite de requisições da Anthropic atingido.")
  }
  if (!response.ok) {
    throw new AgentAiError("AI_PROVIDER_ERROR", `Anthropic respondeu com status ${response.status}.`)
  }

  const data = await response.json()
  const toolUse = (data?.content as Array<Record<string, unknown>> | undefined)?.find(
    (block) => block.type === "tool_use" && block.name === RETURN_AGENT_MESSAGE_TOOL.name,
  )
  const message = composeMessageFromToolOutput(toolUse?.input)

  const usage = data?.usage as { input_tokens?: number; output_tokens?: number } | undefined

  return {
    message,
    usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : undefined,
  }
}

/**
 * IMPLEMENTATION-012I — extraída de `callAnthropicOnce` pra ser testável sem
 * precisar de uma chamada real à Anthropic (o resto da função só faz I/O:
 * monta a requisição HTTP e lê `usage`). Recebe o `input` bruto do
 * `tool_use` (schema de 2 campos, ver `RETURN_AGENT_MESSAGE_TOOL`) e devolve
 * a mensagem final composta — ou lança `AgentAiError("AI_INVALID_RESPONSE")`
 * se o formato vier errado OU se, mesmo com o schema separado, a resposta
 * ainda tiver mais de uma pergunta somando os dois campos. Nunca corta/edita
 * texto pra "consertar" — só aceita ou rejeita (rejeição cai no mesmo
 * fallback seguro já existente do lado do cliente, via `AI_INVALID_RESPONSE`).
 */
export function composeMessageFromToolOutput(toolInput: unknown): string {
  const input = toolInput as { answer_text?: unknown; optional_question?: unknown } | undefined
  const answerText = input?.answer_text

  if (typeof answerText !== "string" || !answerText.trim()) {
    throw new AgentAiError("AI_INVALID_RESPONSE", "Resposta da Anthropic fora do formato esperado.")
  }
  // `optional_question` é opcional por natureza — `null`/ausente/string vazia
  // são todos "sem pergunta", só uma string não-vazia conta como pergunta.
  const optionalQuestionText = typeof input?.optional_question === "string" ? input.optional_question.trim() : ""

  const countQuestionMarks = (texto: string) => (texto.match(/\?/g) ?? []).length
  const totalQuestionMarks = countQuestionMarks(answerText) + countQuestionMarks(optionalQuestionText)
  if (totalQuestionMarks > 1) {
    throw new AgentAiError("AI_INVALID_RESPONSE", "Resposta da Anthropic com mais de uma pergunta.")
  }

  return optionalQuestionText ? `${answerText.trim()} ${optionalQuestionText}` : answerText.trim()
}

/**
 * Chama a Anthropic e devolve a mensagem estruturada da Sofia. Lança
 * `AgentAiError` (nunca um erro genérico) — quem chama decide o código
 * HTTP/contrato público a partir de `err.code`. Faz até
 * `MAX_ANTHROPIC_ATTEMPTS` tentativas, e só tenta de novo em timeout ou erro
 * 5xx da Anthropic (nunca em rate limit — não adianta tentar de novo na
 * hora — nem em resposta malformada — repetir o mesmo prompt determinístico
 * tem baixa chance de corrigir sozinho).
 */
export async function generateConversationalResponse(
  input: GenerateConversationalResponseInput,
): Promise<GenerateConversationalResponseResult> {
  let attempt = 0
  while (true) {
    attempt++
    try {
      return await callAnthropicOnce(input)
    } catch (err) {
      const normalized = normalizeAnthropicError(err)
      const podeTentarDeNovo =
        attempt < MAX_ANTHROPIC_ATTEMPTS &&
        (normalized.code === "AI_TIMEOUT" || normalized.code === "AI_PROVIDER_ERROR")
      if (!podeTentarDeNovo) throw normalized
    }
  }
}
