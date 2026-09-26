// Edge Function: invalidate-indicacao (E3.5)
//
// A equipe invalida uma indicação do Programa Embaixadoras (ex.: teste,
// fraude). Marca `status = 'invalidada'` com data, autor (uid da conta) e
// motivo. Nunca apaga. Bloqueada se houver recompensa a pagar ou paga.
//
// AUTORIZAÇÃO — mesmo padrão de update-recompensa-status: JWT ->
// auth.getUser() -> RPC public.is_equipe() com o Authorization original.
//
// CORRIDA — o UPDATE filtra `status = 'atribuida'`; se duas pessoas agirem
// ao mesmo tempo, a segunda recebe 409 `status_mudou`. O CHECK da tabela
// exige `invalidada_em` preenchido quando `status = 'invalidada'`.
//
// Uma recompensa criada ENTRE a leitura e o UPDATE é improvável (a mesma
// conta faz as duas coisas); ainda assim `invalidate` consulta de novo se
// existe recompensa a pagar/paga logo antes do UPDATE e desiste se houver.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createInvalidateIndicacaoHandler, type AuthorizeResult } from "./handler.ts"
import type { IndicacaoParaInvalidar, RecompensaStatusRaw } from "./logic.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("EMBAIXADORAS_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim().length === 0) {
    throw new Error(`missing_required_env:${name}`)
  }
  return value
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function authorize(authorizationHeader: string | null): Promise<AuthorizeResult> {
  if (!authorizationHeader?.startsWith("Bearer ")) return { authorized: false, status: 401 }
  const jwt = authorizationHeader.slice("Bearer ".length).trim()
  if (!jwt) return { authorized: false, status: 401 }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(jwt)
  if (userError || !userData.user) return { authorized: false, status: 401 }

  const requestScopedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorizationHeader } },
  })
  const { data: isEquipeData, error: isEquipeError } = await requestScopedClient.rpc("is_equipe")
  if (isEquipeError || isEquipeData !== true) return { authorized: false, status: 403 }

  return { authorized: true, uid: userData.user.id }
}

interface IndicacaoQueryRow {
  id: string
  status: IndicacaoParaInvalidar["status"]
  recompensas_embaixadoras: { status: RecompensaStatusRaw } | { status: RecompensaStatusRaw }[] | null
}

function recompensaStatus(value: IndicacaoQueryRow["recompensas_embaixadoras"]): RecompensaStatusRaw | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.status ?? null
  return value.status
}

Deno.serve(
  createInvalidateIndicacaoHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    getIndicacao: async (indicacaoId) => {
      const { data, error } = await serviceClient
        .from("indicacoes_embaixadoras")
        .select("id, status, recompensas_embaixadoras(status)")
        .eq("id", indicacaoId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as IndicacaoQueryRow
      return { id: row.id, status: row.status, recompensa_status: recompensaStatus(row.recompensas_embaixadoras) }
    },
    invalidate: async ({ indicacaoId, motivo, actorUid }) => {
      // Re-checagem logo antes de escrever: se uma recompensa ativa
      // apareceu depois da leitura, não invalida.
      const { data: rec, error: recError } = await serviceClient
        .from("recompensas_embaixadoras")
        .select("status")
        .eq("indicacao_id", indicacaoId)
        .in("status", ["disponivel", "pago"])
        .maybeSingle()
      if (recError) throw recError
      if (rec) return false

      const { data, error } = await serviceClient
        .from("indicacoes_embaixadoras")
        .update({
          status: "invalidada",
          invalidada_em: new Date().toISOString(),
          invalidada_por: actorUid,
          invalidada_motivo: motivo,
        })
        .eq("id", indicacaoId)
        .eq("status", "atribuida")
        .select("id")
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "invalidate-indicacao", ts: new Date().toISOString(), ...fields })),
  }),
)
