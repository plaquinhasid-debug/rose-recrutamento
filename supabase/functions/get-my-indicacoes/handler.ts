// handler.ts (E2.9) — request handling de `get-my-indicacoes`. Mesmo
// padrão de get-my-embaixadora/handler.ts: extraído pra teste direto, sem
// precisar subir `Deno.serve` nem um cliente Supabase real. `index.ts`
// continua sendo o único ponto de I/O — todas as dependências externas
// chegam injetadas via `GetMyIndicacoesDependencies`.
//
// AUTORIZAÇÃO — reproduz exatamente a mesma cadeia autoritativa já validada
// em produção por get-my-embaixadora (E2.7-C/E2.8), NUNCA uma segunda
// interpretação de "quem é a Embaixadora autenticada":
//   JWT -> auth.uid() -> nega equipe -> embaixadoras.user_id = auth.uid()
//   -> exige status='ativa' -> embaixadora_id (interno) -> indicações dela.
// `embaixadora_id` nunca é lido de query/body/header em lugar nenhum deste
// arquivo — vem sempre do resultado de `findMinhaEmbaixadora`, que por sua
// vez só aceita o `uid` já validado por `authorize`.
//
// SOMENTE LEITURA — nunca escreve em indicacoes_embaixadoras, leads,
// embaixadoras nem em nenhuma outra tabela. E3.4: lê (nunca escreve)
// status/valor de recompensas_embaixadoras.

import {
  buildIndicacoesResponse,
  isPortalEligibleStatus,
  type EmbaixadoraStatus,
  type IndicacaoJoinRow,
  type MinhasIndicacoesResponse,
} from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 }

export interface GetMyIndicacoesDependencies {
  allowedOrigins: readonly string[]
  /** Valida o JWT do header Authorization e devolve o uid real (via auth.getUser). */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** Checagem autoritativa (mesma fonte de verdade de get-my-embaixadora) pro uid do JWT. `true` NEGA incondicionalmente, antes de qualquer consulta a embaixadoras/indicações. */
  checkIsEquipe: (uid: string) => Promise<boolean>
  /** SEMPRE filtra por `user_id = uid` (o uid vem só de `authorize`, nunca do request). `null` = sem vínculo — resultado normal, nunca erro. */
  findMinhaEmbaixadora: (uid: string) => Promise<{ id: string; status: EmbaixadoraStatus } | null>
  /** `embaixadoraId` vem só do resultado de `findMinhaEmbaixadora` acima — nunca de query/body. Só chamada depois de confirmar Embaixadora `ativa`. */
  findIndicacoes: (embaixadoraId: string) => Promise<IndicacaoJoinRow[]>
  /** Nunca deve receber nome da candidata, telefone ou qualquer PII — só o uid (identificador interno) e o tipo de evento. */
  logEvent: (fields: Record<string, unknown>) => void
}

function cors(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  }
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })
}

export function createGetMyIndicacoesHandler(dependencies: GetMyIndicacoesDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, headers)

    // Autorização ANTES de qualquer acesso ao banco — mesmo padrão de
    // get-my-embaixadora/handler.ts.
    const auth = await dependencies.authorize(req.headers.get("authorization"))
    if (!auth.authorized) return json({ error: "unauthorized" }, 401, headers)

    // CHECAGEM AUTORITATIVA DE EQUIPE — roda ANTES de tocar em embaixadoras
    // ou indicações. `true` nega incondicionalmente.
    let isEquipe: boolean
    try {
      isEquipe = await dependencies.checkIsEquipe(auth.uid)
    } catch {
      dependencies.logEvent({ event: "get_my_indicacoes_error", actorUid: auth.uid, reason: "equipe_check_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    if (isEquipe) {
      // Mesma resposta genérica de get-my-embaixadora — nunca revela
      // publicamente que o motivo foi "é equipe".
      dependencies.logEvent({ event: "get_my_indicacoes_denied", actorUid: auth.uid, reason: "equipe" })
      return json({ error: "embaixadora_nao_encontrada" }, 404, headers)
    }

    let embaixadora: { id: string; status: EmbaixadoraStatus } | null
    try {
      embaixadora = await dependencies.findMinhaEmbaixadora(auth.uid)
    } catch {
      dependencies.logEvent({ event: "get_my_indicacoes_error", actorUid: auth.uid, reason: "embaixadora_query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    // Mesmo 404 genérico pra "não existe linha" e "existe mas não é
    // elegível" (convidada/inativa/rejeitada) — nunca diferencia
    // publicamente o motivo, mesma disciplina de get-my-embaixadora.
    if (!embaixadora || !isPortalEligibleStatus(embaixadora.status)) {
      dependencies.logEvent({ event: "get_my_indicacoes_denied", actorUid: auth.uid, reason: "nao_elegivel" })
      return json({ error: "embaixadora_nao_encontrada" }, 404, headers)
    }

    let rows: IndicacaoJoinRow[]
    try {
      rows = await dependencies.findIndicacoes(embaixadora.id)
    } catch {
      dependencies.logEvent({ event: "get_my_indicacoes_error", actorUid: auth.uid, reason: "indicacoes_query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    const response: MinhasIndicacoesResponse = buildIndicacoesResponse(rows)
    dependencies.logEvent({ event: "get_my_indicacoes_success", actorUid: auth.uid, total: response.total })
    return json(response, 200, headers)
  }
}
