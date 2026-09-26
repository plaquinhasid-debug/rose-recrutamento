// handler.ts (E3.2) — request handling de `confirm-primeiro-mostruario`.
// Mesmo padrão das outras functions de Embaixadoras: extraído pra teste
// direto; `index.ts` é o único ponto de I/O e injeta as dependências.
//
// ESCRITA ÚNICA: só insere UMA linha em `recompensas_embaixadoras`. Nunca
// altera indicação, lead, Embaixadora, nem recompensa existente.

import {
  checkEligibility, projectRecompensa, validateConfirmPayload,
  type IndicacaoParaConfirmar, type RecompensaCriada,
} from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

/** Lançado por `insertRecompensa` quando o UNIQUE de indicacao_id barra uma segunda recompensa. */
export class RecompensaJaExisteError extends Error {
  constructor() {
    super("recompensa_ja_existe")
  }
}

export interface ConfirmPrimeiroMostruarioDependencies {
  allowedOrigins: readonly string[]
  /** JWT + public.is_equipe() server-side. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** null quando a indicação não existe. Deve lançar em falha de query. */
  getIndicacao: (indicacaoId: string) => Promise<IndicacaoParaConfirmar | null>
  /** Insere só indicacao_id + primeiro_mostruario_em (valor/status vêm dos DEFAULTs do banco). */
  insertRecompensa: (input: { indicacaoId: string; primeiroMostruarioEm: string }) => Promise<RecompensaCriada>
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

export function createConfirmPrimeiroMostruarioHandler(dependencies: ConfirmPrimeiroMostruarioDependencies) {
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

    const validation = validateConfirmPayload(body, dependencies.now())
    if (!validation.valid) return json({ error: validation.reason }, 400, headers)
    const { indicacaoId, dataEntrega, primeiroMostruarioEm } = validation.payload

    let indicacao: IndicacaoParaConfirmar | null
    try {
      indicacao = await dependencies.getIndicacao(indicacaoId)
    } catch {
      dependencies.logEvent({ event: "confirm_mostruario_error", actorUid: auth.uid, reason: "query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }
    if (!indicacao) return json({ error: "indicacao_nao_encontrada" }, 404, headers)

    const eligibility = checkEligibility(indicacao, dataEntrega)
    if (!eligibility.eligible) {
      dependencies.logEvent({ event: "confirm_mostruario_rejected", actorUid: auth.uid, indicacaoId, reason: eligibility.reason })
      return json({ error: eligibility.reason }, eligibility.httpStatus, headers)
    }

    let recompensa: RecompensaCriada
    try {
      recompensa = await dependencies.insertRecompensa({ indicacaoId, primeiroMostruarioEm })
    } catch (error) {
      if (error instanceof RecompensaJaExisteError) {
        dependencies.logEvent({ event: "confirm_mostruario_rejected", actorUid: auth.uid, indicacaoId, reason: "ja_confirmada" })
        return json({ error: "ja_confirmada" }, 409, headers)
      }
      dependencies.logEvent({ event: "confirm_mostruario_error", actorUid: auth.uid, reason: "insert_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    dependencies.logEvent({
      event: "confirm_mostruario",
      actorUid: auth.uid,
      indicacaoId,
      recompensaId: recompensa.id,
      valorCentavos: recompensa.valor_centavos,
    })
    return json({ recompensa: projectRecompensa(recompensa) }, 201, headers)
  }
}
