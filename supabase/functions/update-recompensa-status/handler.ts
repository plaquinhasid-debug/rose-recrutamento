// handler.ts (E3.3) — request handling de `update-recompensa-status`.
// Mesmo padrão das outras functions de Embaixadoras: extraído pra teste
// direto; `index.ts` é o único ponto de I/O e injeta as dependências.
//
// ESCRITA ÚNICA: um UPDATE em UMA linha de `recompensas_embaixadoras`
// (disponivel -> pago | cancelada). Nunca cria nem apaga nada.

import {
  checkTransition, projectRecompensa, validateAcaoPayload,
  type AcaoRecompensa, type RecompensaAtual, type RecompensaAtualizada,
} from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

export interface UpdateRecompensaStatusDependencies {
  allowedOrigins: readonly string[]
  /** JWT + public.is_equipe() server-side. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** Recompensa da indicação, ou null se a indicação ainda não tem recompensa. Deve lançar em falha de query. */
  getRecompensa: (indicacaoId: string) => Promise<RecompensaAtual | null>
  /**
   * UPDATE condicional (`WHERE id = ? AND status = 'disponivel'`). Devolve
   * null quando nenhuma linha mudou — alguém alterou o status no meio.
   */
  applyAcao: (recompensaId: string, acao: AcaoRecompensa, actorUid: string) => Promise<RecompensaAtualizada | null>
  logEvent: (fields: Record<string, unknown>) => void
  now: () => Date
}

function cors(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })
}

export function createUpdateRecompensaStatusHandler(dependencies: UpdateRecompensaStatusDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers)

    const auth = await dependencies.authorize(req.headers.get("authorization"))
    if (!auth.authorized) {
      return json({ error: auth.status === 401 ? "unauthorized" : "forbidden" }, auth.status, headers)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json({ error: "invalid_json" }, 400, headers)
    }

    const validation = validateAcaoPayload(body, dependencies.now())
    if (!validation.valid) return json({ error: validation.reason }, 400, headers)
    const acao = validation.payload

    let recompensa: RecompensaAtual | null
    try {
      recompensa = await dependencies.getRecompensa(acao.indicacaoId)
    } catch {
      dependencies.logEvent({ event: "update_recompensa_error", actorUid: auth.uid, reason: "query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }
    if (!recompensa) return json({ error: "recompensa_nao_encontrada" }, 404, headers)

    const transition = checkTransition(recompensa, acao)
    if (!transition.allowed) {
      dependencies.logEvent({
        event: "update_recompensa_rejected", actorUid: auth.uid, recompensaId: recompensa.id, acao: acao.acao, reason: transition.reason,
      })
      return json({ error: transition.reason }, transition.httpStatus, headers)
    }

    let atualizada: RecompensaAtualizada | null
    try {
      atualizada = await dependencies.applyAcao(recompensa.id, acao, auth.uid)
    } catch {
      dependencies.logEvent({ event: "update_recompensa_error", actorUid: auth.uid, reason: "update_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }
    if (!atualizada) {
      dependencies.logEvent({
        event: "update_recompensa_rejected", actorUid: auth.uid, recompensaId: recompensa.id, acao: acao.acao, reason: "status_mudou",
      })
      return json({ error: "status_mudou" }, 409, headers)
    }

    // Nunca loga o motivo (texto livre, pode conter dado pessoal).
    dependencies.logEvent({ event: "update_recompensa", actorUid: auth.uid, recompensaId: atualizada.id, novoStatus: atualizada.status })
    return json({ recompensa: projectRecompensa(atualizada) }, 200, headers)
  }
}
