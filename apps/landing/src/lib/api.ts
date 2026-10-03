import { supabase } from "@/lib/supabase"
import {
  finalizeCandidateResponseSchema,
  getFichaResponseSchema,
  type Database,
  type DocumentoTipo,
  type FichaDocumento,
  type FichaAprovacaoPayload,
  type FinalizeCandidatePayload,
  type FinalizeCandidateResponse,
  type GetFichaResponse,
} from "@tania-joias/shared"

type EventoFunil = Database["public"]["Enums"]["evento_funil"]

/**
 * Eventos que a própria Edge Function `finalize-candidate` já registra
 * server-side. O frontend NUNCA deve gravar esses (evita duplicidade no
 * "Radar da Sofia" do admin).
 */
const EVENTOS_GRAVADOS_PELO_BACKEND = [
  "respondeu_trabalha_sim",
  "respondeu_trabalha_nao",
  "aprovada",
  "reprovada",
  "analise_manual",
] as const satisfies readonly EventoFunil[]

interface LogEventParams {
  tipoEvento: Exclude<EventoFunil, (typeof EVENTOS_GRAVADOS_PELO_BACKEND)[number]>
  sessionId?: string
  campanha?: string | null
  origem?: string | null
}

/** Grava um evento de funil em `logs`. Fire-and-forget: nunca lança. */
export async function logEvent({
  tipoEvento,
  sessionId,
  campanha,
  origem,
}: LogEventParams): Promise<void> {
  try {
    const { error } = await supabase.from("logs").insert({
      tipo_evento: tipoEvento,
      session_id: sessionId ?? null,
      campanha: campanha ?? null,
      origem: origem ?? null,
    })
    if (error) throw error
  } catch (err) {
    console.warn(`[sofia] falha ao registrar log "${tipoEvento}"`, err)
  }
}

interface InsertAnswerParams {
  sessionId: string
  questionKey: string
  questionLabel: string
  answerValue: string
}

/** Grava uma resposta individual em `answers`. Fire-and-forget: nunca lança. */
export async function insertAnswer({
  sessionId,
  questionKey,
  questionLabel,
  answerValue,
}: InsertAnswerParams): Promise<void> {
  try {
    const { error } = await supabase.from("answers").insert({
      session_id: sessionId,
      question_key: questionKey,
      question_label: questionLabel,
      answer_value: answerValue,
    })
    if (error) throw error
  } catch (err) {
    console.warn(`[sofia] falha ao salvar resposta "${questionKey}"`, err)
  }
}

interface StartConversationParams {
  sessionId: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
}

/** Registra o início de uma conversa em `conversations`. Fire-and-forget: nunca lança. */
export async function startConversation({
  sessionId,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
}: StartConversationParams): Promise<void> {
  try {
    const { error } = await supabase.from("conversations").insert({
      session_id: sessionId,
      status: "em_andamento",
      utm_source: utmSource ?? null,
      utm_medium: utmMedium ?? null,
      utm_campaign: utmCampaign ?? null,
      utm_content: utmContent ?? null,
    })
    if (error) throw error
  } catch (err) {
    console.warn("[sofia] falha ao iniciar conversation", err)
  }
}


/**
 * Chama a Edge Function `finalize-candidate`, que calcula o IPR e decide o
 * status do lead server-side. Esta é a ÚNICA chamada que pode lançar — o
 * chamador deve tratar o erro (ex.: tela de "tentar novamente").
 */
export async function finalizeCandidate(
  payload: FinalizeCandidatePayload,
): Promise<FinalizeCandidateResponse> {
  const { data, error } = await supabase.functions.invoke("finalize-candidate", {
    body: payload,
  })

  if (error) throw error

  return finalizeCandidateResponseSchema.parse(data)
}

/**
 * Página pública `/ficha/:token` — checa se o link é válido, já foi
 * preenchido, ou está pendente. Pode lançar (a página trata o erro com uma
 * tela de "não deu pra carregar, tenta de novo").
 */
export async function getFicha(token: string): Promise<GetFichaResponse> {
  const { data, error } = await supabase.functions.invoke("get-ficha", { body: { token } })
  if (error) throw error
  return getFichaResponseSchema.parse(data)
}

/** Envia a Ficha de Aprovação preenchida. Pode lançar — a página trata o erro. */
export async function submitFicha(token: string, payload: FichaAprovacaoPayload): Promise<void> {
  const { error } = await supabase.functions.invoke("submit-ficha", {
    body: { token, ...payload },
  })
  if (error) throw error
}

const BUCKET_DOCUMENTOS = "fichas-documentos"

/**
 * Envia os documentos da ficha. O servidor (`submit-ficha`, ação
 * `upload_urls`) valida o token da ficha e devolve um link de upload
 * assinado por arquivo — a candidata nunca tem permissão direta no bucket.
 */
export async function uploadDocumentosFicha(
  token: string,
  documentos: Partial<Record<DocumentoTipo, File>>,
): Promise<FichaDocumento[]> {
  const arquivos = Object.entries(documentos).filter((entry): entry is [DocumentoTipo, File] => Boolean(entry[1]))
  if (arquivos.length === 0) return []

  const { data, error } = await supabase.functions.invoke("submit-ficha", {
    body: {
      action: "upload_urls",
      token,
      arquivos: arquivos.map(([tipo, file]) => ({ tipo, nome: file.name, tamanho: file.size })),
    },
  })
  if (error) throw error

  const urls = (data as { uploads: { tipo: DocumentoTipo; path: string; uploadToken: string }[] }).uploads
  const enviados: FichaDocumento[] = []
  for (const [tipo, file] of arquivos) {
    const alvo = urls.find((u) => u.tipo === tipo)
    if (!alvo) throw new Error(`sem link de upload para ${tipo}`)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .uploadToSignedUrl(alvo.path, alvo.uploadToken, file, { contentType: file.type || undefined })
    if (uploadError) throw uploadError
    enviados.push({ tipo, path: alvo.path })
  }
  return enviados
}
