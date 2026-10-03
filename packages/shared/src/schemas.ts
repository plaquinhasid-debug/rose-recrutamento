import { z } from "zod"

export const identificacaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome completo"),
  cidade: z.string().trim().min(2, "Informe sua cidade"),
  idade: z.coerce
    .number({ invalid_type_error: "Informe uma idade válida" })
    .int()
    .min(18, "Idade mínima de 18 anos")
    .max(99, "Informe uma idade válida"),
  telefone: z
    .string()
    .trim()
    .min(10, "Informe um telefone com DDD")
    .regex(/^[\d()\s-]+$/, "Use apenas números, espaços e parênteses"),
})

export const trabalhaAtualmenteSchema = z.object({
  trabalha: z.boolean(),
})

export const qualificacaoSchema = z.object({
  empresa_atual: z.string().trim().min(1, "Conte onde você trabalha"),
  profissao: z.string().trim().min(1, "Informe sua profissão"),
  // QUALIFICACAO-002, Parte 1 — texto livre de propósito (mesmo padrão de
  // `tempo_disponivel`, que também é `chips` + fallback de texto). A
  // normalização pras 3 categorias (ALTA/MEDIA/BAIXA) acontece só no
  // servidor (`finalize-candidate`), nunca aqui.
  estabilidade_profissional: z.string().trim().min(1, "Selecione uma opção"),
  experiencia_vendas: z.boolean(),
  whatsapp: z.boolean(),
  possui_instagram: z.boolean(),
  instagram: z.string().trim().optional(),
  tempo_disponivel: z.string().trim().min(1, "Conte quanto tempo pode dedicar"),
  objetivo: z.string().trim().min(5, "Conte um pouco mais sobre o motivo"),
})

/** Payload aceito pela Edge Function `finalize-candidate`. */
export const finalizeCandidatePayloadSchema = z.object({
  session_id: z.string().min(1),
  nome: z.string().min(1),
  telefone: z.string().min(1),
  cidade: z.string().optional(),
  idade: z.number().int().optional(),
  trabalha: z.boolean(),
  empresa_atual: z.string().optional(),
  profissao: z.string().optional(),
  // QUALIFICACAO-002, Parte 1 — texto bruto do chip escolhido (ou texto
  // livre digitado). NUNCA usada em calcularIpr/decidirStatus/classificarPerfil
  // — só normalizada pra ALTA/MEDIA/BAIXA (ou null) dentro de finalize-candidate.
  estabilidade_profissional: z.string().optional(),
  experiencia_vendas: z.boolean().optional(),
  instagram: z.string().optional().nullable(),
  whatsapp: z.boolean().optional(),
  tempo_disponivel: z.string().optional(),
  objetivo: z.string().optional(),
  origem: z.string().optional(),
  campanha: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
  fbclid: z.string().optional(),
  // IMPLEMENTATION-EMBAIXADORAS-E2.8 — código de indicação público de uma
  // Embaixadora (embaixadoras.codigo_referral), nunca um UUID interno.
  // Opcional: a grande maioria das candidatas chega sem indicação nenhuma.
  // A resolução (código -> Embaixadora ativa -> vínculo) é inteiramente
  // responsabilidade do servidor (finalize-candidate) — o navegador nunca
  // escolhe a Embaixadora, só repassa o código que capturou da URL.
  ref: z.string().optional(),
})

export type FinalizeCandidatePayload = z.infer<typeof finalizeCandidatePayloadSchema>

export const finalizeCandidateResponseSchema = z.object({
  lead_id: z.string(),
  status: z.enum(["novo", "em_analise", "aprovada", "reprovada"]),
  ipr: z.number(),
  perfil_comercial: z.enum(["baixo", "medio", "alto"]).nullable(),
  resumo_ia: z.string().nullable(),
})

export type FinalizeCandidateResponse = z.infer<typeof finalizeCandidateResponseSchema>

/**
 * Resposta da Edge Function `agent-ai-gateway` (RFC-011). Duplicação
 * deliberada do contrato Deno-side (`supabase/functions/agent-ai-gateway/index.ts`)
 * — mesma convenção já usada para `finalizeCandidateResponseSchema` acima
 * (Edge Functions não importam `@tania-joias/shared`, então não há um tipo
 * único compartilhado entre os dois lados; mudanças no contrato precisam
 * ser replicadas manualmente nos dois arquivos).
 */
export const agentAiGatewayResponseSchema = z.object({
  success: z.boolean(),
  requestId: z.string(),
  operation: z.literal("GENERATE_CONVERSATIONAL_RESPONSE"),
  output: z.object({ message: z.string() }).optional(),
  usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() }).optional(),
  latencyMs: z.number(),
  fallbackRequired: z.boolean(),
  error: z
    .object({
      code: z.enum([
        "INVALID_METHOD",
        "ORIGIN_NOT_ALLOWED",
        "INVALID_PAYLOAD",
        "PAYLOAD_TOO_LARGE",
        "UNSUPPORTED_OPERATION",
        "UNKNOWN_AGENT",
        "AI_TIMEOUT",
        "AI_RATE_LIMITED",
        "AI_PROVIDER_ERROR",
        "AI_INVALID_RESPONSE",
        "INTERNAL_ERROR",
      ]),
      message: z.string(),
      retryable: z.boolean(),
    })
    .optional(),
})

export type AgentAiGatewayResponse = z.infer<typeof agentAiGatewayResponseSchema>
export type AgentAiGatewayErrorCode = NonNullable<AgentAiGatewayResponse["error"]>["code"]

/**
 * FEATURE-005 Parte 5 — modo da "condução natural" da Sofia. `ACTIVE` existe
 * como valor reconhecido no contrato, mas ainda não tem comportamento
 * próprio implementado em nenhum lugar — quem consome isso (`useSofiaFlow.ts`
 * via `resolveNaturalConversationMode`) trata `ACTIVE` como `SHADOW` até uma
 * fase futura validar e ligar o modo de verdade.
 */
export const naturalConversationModeSchema = z.enum(["OFF", "SHADOW", "ACTIVE"])
export type NaturalConversationModeValue = z.infer<typeof naturalConversationModeSchema>

export const knowledgeSourceModeSchema = z.enum(["LOCAL", "SHADOW", "PILOT"])
export type KnowledgeSourceModeValue = z.infer<typeof knowledgeSourceModeSchema>

/**
 * Resposta da Edge Function `sofia-config` (FEATURE-004 + FEATURE-005 Parte
 * 5). Mesma observação de duplicação da `agentAiGatewayResponseSchema`
 * acima: a Edge Function (Deno) não importa `@tania-joias/shared`, então a
 * mesma forma é validada manualmente do lado dela — mudanças aqui precisam
 * ser replicadas em `supabase/functions/sofia-config/index.ts`.
 *
 * `conducao_natural_modo` é OPCIONAL de propósito: entre o deploy do código
 * novo da Landing e o deploy da Edge Function atualizada, a function em
 * produção ainda só devolve `perguntas_ia_ativa`. Se este campo fosse
 * obrigatório, a validação da resposta INTEIRA falharia nesse intervalo —
 * derrubando `perguntas_ia_ativa` (FEATURE-004) junto, mesmo esse campo
 * continuando presente e válido na resposta real. Descoberto ao vivo
 * durante a verificação desta parte, contra a function real ainda não
 * redeployada.
 */
export const sofiaConfigResponseSchema = z.object({
  perguntas_ia_ativa: z.boolean(),
  conducao_natural_modo: naturalConversationModeSchema.optional(),
  knowledge_source_mode: knowledgeSourceModeSchema.optional(),
})
export type SofiaConfigResponse = z.infer<typeof sofiaConfigResponseSchema>

/**
 * Ficha de Aprovação — preenchida pela própria candidata via link único
 * (`/ficha/:token` na Landing), depois de aprovada. Validado no cliente
 * (`react-hook-form` + este schema) e de novo no servidor (Edge Function
 * `submit-ficha`, que replica esta forma manualmente — mesma convenção de
 * duplicação do resto deste arquivo, já que Edge Functions não importam
 * `@tania-joias/shared`).
 */
export const DOCUMENTO_TIPOS = ["documento_frente", "documento_verso", "comprovante_residencia"] as const
export type DocumentoTipo = (typeof DOCUMENTO_TIPOS)[number]
export const DOCUMENTO_TIPO_LABEL: Record<DocumentoTipo, string> = {
  documento_frente: "RG ou CNH (frente)",
  documento_verso: "RG ou CNH (verso)",
  comprovante_residencia: "Comprovante de residência",
}

export const fichaDocumentoSchema = z.object({
  tipo: z.enum(DOCUMENTO_TIPOS),
  path: z.string().min(1),
})
export type FichaDocumento = z.infer<typeof fichaDocumentoSchema>

/**
 * Ficha da Rose — preenchida pela própria candidata via link único
 * (`/ficha/:token`), depois de pré-aprovada. Validada no cliente e de novo no
 * servidor (`submit-ficha`, que replica estas regras manualmente).
 */
export const fichaAprovacaoSchema = z
  .object({
    endereco_rua: z.string().trim().min(1, "Informe a rua"),
    endereco_numero: z.string().trim().min(1, "Informe o número"),
    endereco_bairro: z.string().trim().min(1, "Informe o bairro"),
    endereco_cidade: z.string().trim().min(1, "Informe a cidade"),
    endereco_cep: z.string().trim().min(1, "Informe o CEP"),
    casa_propria: z.enum(["propria", "alugada", "familia"], {
      errorMap: () => ({ message: "Escolha uma opção" }),
    }),

    trabalha_atualmente: z.boolean().optional(),
    trabalho_endereco: z.string().trim().optional(),
    trabalho_telefone: z.string().trim().optional(),
    trabalho_horario: z.string().trim().optional(),

    tem_conjuge: z.boolean(),
    conjuge_nome: z.string().trim().optional(),
    conjuge_telefone: z.string().trim().optional(),
    conjuge_trabalha: z.boolean().optional(),
    conjuge_trabalho_local: z.string().trim().optional(),
    conjuge_trabalho_telefone: z.string().trim().optional(),

    filhos_quantidade: z.coerce
      .number({ invalid_type_error: "Informe um número (0 se não tiver)" })
      .int("Informe um número inteiro")
      .min(0, "Informe um número (0 se não tiver)")
      .max(20, "Confira o número"),

    instagram_profissional: z.string().trim().optional(),
    restricao_cpf: z.enum(["nao", "sim", "nao_sei"], {
      errorMap: () => ({ message: "Escolha uma opção" }),
    }),

    ref1_nome: z.string().trim().min(1, "Informe o nome"),
    ref1_telefone: z.string().trim().min(1, "Informe o telefone"),
    ref2_nome: z.string().trim().min(1, "Informe o nome"),
    ref2_telefone: z.string().trim().min(1, "Informe o telefone"),

    /** Preenchido pela página depois do upload (nunca digitado). */
    documentos: z.array(fichaDocumentoSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trabalha_atualmente && !data.trabalho_endereco?.trim()) {
      ctx.addIssue({ code: "custom", path: ["trabalho_endereco"], message: "Informe o endereço do trabalho" })
    }
    if (data.trabalha_atualmente && !data.trabalho_telefone?.trim()) {
      ctx.addIssue({ code: "custom", path: ["trabalho_telefone"], message: "Informe o telefone do trabalho" })
    }
    if (data.trabalha_atualmente && !data.trabalho_horario?.trim()) {
      ctx.addIssue({ code: "custom", path: ["trabalho_horario"], message: "Informe seu horário de trabalho" })
    }
    if (data.tem_conjuge && !data.conjuge_nome?.trim()) {
      ctx.addIssue({ code: "custom", path: ["conjuge_nome"], message: "Informe o nome dele" })
    }
    if (data.tem_conjuge && !data.conjuge_telefone?.trim()) {
      ctx.addIssue({ code: "custom", path: ["conjuge_telefone"], message: "Informe o telefone dele" })
    }
    if (data.tem_conjuge && data.conjuge_trabalha && !data.conjuge_trabalho_local?.trim()) {
      ctx.addIssue({ code: "custom", path: ["conjuge_trabalho_local"], message: "Informe onde ele trabalha" })
    }
    if (data.tem_conjuge && data.conjuge_trabalha && !data.conjuge_trabalho_telefone?.trim()) {
      ctx.addIssue({ code: "custom", path: ["conjuge_trabalho_telefone"], message: "Informe o telefone do trabalho" })
    }
  })
export type FichaAprovacaoPayload = z.infer<typeof fichaAprovacaoSchema>

/** Resposta da Edge Function `get-ficha` (duplicada manualmente do lado dela, mesma convenção do resto deste arquivo). */
export const getFichaResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("invalido") }),
  z.object({ status: z.literal("preenchida") }),
  z.object({ status: z.literal("pendente"), nome: z.string() }),
])
export type GetFichaResponse = z.infer<typeof getFichaResponseSchema>
