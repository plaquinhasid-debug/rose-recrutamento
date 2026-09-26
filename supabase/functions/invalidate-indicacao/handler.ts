// handler.ts (E3.5) — request handling de `invalidate-indicacao`. Mesmo
// padrão das outras functions de Embaixadoras: extraído pra teste direto;
// `index.ts` é o único ponto de I/O e injeta as dependências.
//
// ESCRITA ÚNICA: um UPDATE em UMA linha de `indicacoes_embaixadoras`
// (atribuida -> invalidada). Nunca apaga nada, nunca mexe em recompensa.

import { checkInvalidation, validateInvalidatePayload, type IndicacaoParaInvalidar } from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

export interface InvalidateIndicacaoDependencies {
  allowedOrigins: readonly string[]
  /** JWT + public.is_equipe() server-side. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** null quando a indicação não existe. Deve lançar em falha de query. */
  getIndicacao: (indicacaoId: string) => Promise<IndicacaoParaInvalidar | null>
  /**
   * UPDATE condicional (`WHERE id = ? AND status = 'atribuida'`). Devolve
   * false quando nenhuma linha mudou (alguém invalidou no meio).
   */
  invalidate: (input: { indicacaoId: string; motivo: string; actorUid: string }) => Promise<boolean>
  logEvent: (fields: Record<string, unknown>) => void
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

export function createInvalidateIndicacaoHandler(dependencies: InvalidateIndicacaoDependencies) {
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

    const validation = validateInvalidatePayload(body)
    if (!validation.valid) return json({ error: validation.reason }, 400, headers)
    const { indicacaoId, motivo } = validation.payload

    let indicacao: IndicacaoParaInvalidar | null
    try {
      indicacao = await dependencies.getIndicacao(indicacaoId)
    } catch {
      dependencies.logEvent({ event: "invalidate_indicacao_error", actorUid: auth.uid, reason: "query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }
    if (!indicacao) return json({ error: "indicacao_nao_encontrada" }, 404, headers)

    const eligibility = checkInvalidation(indicacao)
    if (!eligibility.eligible) {
      dependencies.logEvent({ event: "invalidate_indicacao_rejected", actorUid: auth.uid, indicacaoId, reason: eligibility.reason })
      return json({ error: eligibility.reason }, 409, headers)
    }

    let changed: boolean
    try {
      changed = await dependencies.invalidate({ indicacaoId, motivo, actorUid: auth.uid })
    } catch {
      dependencies.logEvent({ event: "invalidate_indicacao_error", actorUid: auth.uid, reason: "update_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }
    if (!changed) {
      dependencies.logEvent({ event: "invalidate_indicacao_rejected", actorUid: auth.uid, indicacaoId, reason: "status_mudou" })
      return json({ error: "status_mudou" }, 409, headers)
    }

    // Nunca loga o motivo (texto livre, pode conter dado pessoal).
    dependencies.logEvent({ event: "invalidate_indicacao", actorUid: auth.uid, indicacaoId })
    return json({ ok: true }, 200, headers)
  }
}
