// handler.ts (E3.1) — request handling de `list-indicacoes-admin`. Mesmo
// padrão de list-ambassadors-admin/handler.ts: extraído pra teste direto,
// sem precisar subir `Deno.serve` nem um cliente Supabase real. `index.ts`
// continua sendo o único ponto de I/O — todas as dependências externas
// chegam injetadas via `ListIndicacoesAdminDependencies`.
//
// AUTORIZAÇÃO — `authorize` é responsabilidade de `index.ts` (JWT real +
// public.is_equipe() via RPC); este arquivo nunca decide sozinho quem é
// equipe, só reage ao resultado.
//
// SOMENTE LEITURA — esta function nunca escreve em nenhuma tabela.

import { projectIndicacoesAdmin, type IndicacaoAdminItem, type IndicacaoAdminJoinRow } from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

export interface ListIndicacoesAdminDependencies {
  allowedOrigins: readonly string[]
  /** Valida o JWT do header Authorization e checa public.is_equipe() server-side. Nunca confia em nada vindo do body/query. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** Deve rejeitar (throw) em qualquer falha de query — nunca devolver uma lista vazia/parcial silenciosamente em caso de erro. */
  listIndicacoes: () => Promise<IndicacaoAdminJoinRow[]>
  /** Nunca deve receber nomes/lista — só metadados minimizados (ex.: contagem). */
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

export interface ListIndicacoesAdminSuccessBody {
  indicacoes: IndicacaoAdminItem[]
}

export function createListIndicacoesAdminHandler(dependencies: ListIndicacoesAdminDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, headers)

    // Autorização ANTES de qualquer acesso ao banco.
    const auth = await dependencies.authorize(req.headers.get("authorization"))
    if (!auth.authorized) {
      return json({ error: auth.status === 401 ? "unauthorized" : "forbidden" }, auth.status, headers)
    }

    let rows: IndicacaoAdminJoinRow[]
    try {
      rows = await dependencies.listIndicacoes()
    } catch {
      dependencies.logEvent({ event: "list_indicacoes_admin_error", actorUid: auth.uid, reason: "query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    const indicacoes = projectIndicacoesAdmin(rows)

    dependencies.logEvent({ event: "list_indicacoes_admin", actorUid: auth.uid, count: indicacoes.length })

    const body: ListIndicacoesAdminSuccessBody = { indicacoes }
    return json(body, 200, headers)
  }
}
