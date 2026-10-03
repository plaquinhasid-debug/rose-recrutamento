import { BRAND } from "./brand.ts"
// Helper compartilhado para gerar, via Anthropic (Claude), uma reação curta
// e contextual da Sofia durante a conversa (não o resultado final — ver
// `ai-analysis.ts` para isso).
//
// Usado por `sofia-reagir`, chamada em só 2 pontos da conversa (depois de
// "profissao" e depois de "objetivo") para a Sofia não soar como formulário.
// Sempre best-effort: se falhar, o chamador cai no texto estático do roteiro
// (`sofia-script.ts`) — nunca deve travar ou quebrar a conversa da candidata.

export type SofiaReacaoIntent = "perguntar_proximo" | "fechar"

// IMPLEMENTATION-LGPD-001A — `respostasAnteriores` removido deliberadamente.
// O histórico acumulado da conversa (nome/telefone/cidade/idade/Instagram
// real) não é necessário para gerar uma reação curta de 1-3 linhas — só o
// campo que a candidata acabou de responder. Enviar o histórico inteiro à
// Anthropic era o maior excesso de dado pessoal identificado na auditoria
// LGPD deste sistema (RFC-LGPD-001, Seção 7.B); nunca reintroduzir esse
// campo aqui sem uma nova decisão explícita.
export interface SofiaReacaoInput {
  apiKey: string
  intent: SofiaReacaoIntent
  campo: string
  valor: string
  /** Texto estático que seria usado caso a IA estivesse desligada (dá contexto do que ainda falta perguntar). */
  proximaPerguntaBase?: string
}

const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
const REQUEST_TIMEOUT_MS = 4000
const ANTHROPIC_VERSION = "2023-06-01"

const REACAO_TOOL = {
  name: "responder_reacao",
  description: "Registra a próxima fala curta da Sofia na conversa.",
  input_schema: {
    type: "object",
    properties: {
      mensagem: {
        type: "string",
        description: "1 a 3 linhas curtas, tom Sofia (elegante, calma, empática, nunca robótica ou animada demais).",
      },
    },
    required: ["mensagem"],
  },
} as const

function buildSystemPrompt(intent: SofiaReacaoIntent): string {
  const base =
    `Você é a Sofia, Consultora Oficial de Recrutamento da ${BRAND.nome} (revenda de semijoias), conversando ` +
    "ao vivo com uma candidata. Tom: calmo, elegante, educado, amigável, objetivo, natural. Nunca infantil, " +
    "nunca gírias, nunca textos enormes — no máximo 3 linhas curtas. Use o que a candidata já respondeu para " +
    "soar natural e evitar repetir perguntas. Escreva em português do Brasil."

  if (intent === "perguntar_proximo") {
    return (
      base +
      " Agora reaja brevemente à última resposta dela (reconhecendo algo específico, sem exagero) e, na mesma " +
      "mensagem, conduza para a próxima pergunta necessária — reformulada de forma natural e contextual, nunca " +
      "como um formulário. Sempre use a ferramenta `responder_reacao`."
    )
  }

  return (
    base +
    " Agora escreva só um agradecimento/reação breve e calorosa à última resposta dela, sem fazer nenhuma " +
    "pergunta nova (a conversa está sendo encerrada logo em seguida). Sempre use a ferramenta `responder_reacao`."
  )
}

/**
 * IMPLEMENTATION-LGPD-001A — exportada (era privada) só para permitir teste
 * direto de que o prompt nunca inclui nada além do campo/valor atual e da
 * próxima pergunta base. Sem histórico acumulado da conversa.
 */
export function buildUserPrompt(input: SofiaReacaoInput): string {
  const linhas = [
    `Campo que a candidata acabou de responder: ${input.campo}`,
    `Resposta: "${input.valor}"`,
    input.intent === "perguntar_proximo" && input.proximaPerguntaBase
      ? `Próxima informação que ainda precisa ser coletada (pergunta base, pode reformular): "${input.proximaPerguntaBase}"`
      : null,
  ]
  return linhas.filter(Boolean).join("\n")
}

/** Lança em caso de falha — o chamador deve capturar e cair no texto estático do roteiro. */
export async function generateSofiaReacao(input: SofiaReacaoInput): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: buildSystemPrompt(input.intent),
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [REACAO_TOOL],
      tool_choice: { type: "tool", name: REACAO_TOOL.name },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`anthropic_api_error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const toolUse = (data?.content as Array<Record<string, unknown>> | undefined)?.find(
    (block) => block.type === "tool_use" && block.name === REACAO_TOOL.name,
  )
  const mensagem = (toolUse?.input as { mensagem?: unknown } | undefined)?.mensagem

  if (typeof mensagem !== "string" || !mensagem.trim()) {
    throw new Error("anthropic_api_error: resposta fora do formato esperado")
  }

  return mensagem.trim()
}
