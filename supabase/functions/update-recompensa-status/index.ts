// Edge Function: update-recompensa-status (E3.3)
//
// A equipe marca a recompensa de R$40 de uma indicação como PAGA (Pix
// feito, com a data) ou CANCELADA (com motivo). Só a partir de
// `disponivel`; `pago` e `cancelada` são finais. O sistema não faz o Pix.
//
// AUTORIZAÇÃO — mesmo padrão de confirm-primeiro-mostruario: JWT ->
// auth.getUser() -> RPC public.is_equipe() com o Authorization original.
//
// CORRIDA — o UPDATE filtra `status = 'disponivel'`: se duas pessoas
// agirem ao mesmo tempo, só a primeira muda a linha; a segunda recebe 409
// `status_mudou`. `pago_por`/`cancelada_por` gravam o uid da conta (que é
// o mesmo id do `profiles`; a conta da equipe é compartilhada).
import { createClient } from "npm:@supabase/supabase-js@2"

import { createUpdateRecompensaStatusHandler, type AuthorizeResult } from "./handler.ts"
import type { RecompensaAtual, RecompensaAtualizada } from "./logic.ts"

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

const RETURN_COLUMNS = "id, status, valor_centavos, pago_em, cancelada_em"

Deno.serve(
  createUpdateRecompensaStatusHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    getRecompensa: async (indicacaoId) => {
      const { data, error } = await serviceClient
        .from("recompensas_embaixadoras")
        .select("id, status, disponivel_em")
        .eq("indicacao_id", indicacaoId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as RecompensaAtual | null
    },
    applyAcao: async (recompensaId, acao, actorUid) => {
      const changes = acao.acao === "pagar"
        ? { status: "pago", pago_em: acao.pagoEm, pago_por: actorUid }
        : { status: "cancelada", cancelada_em: new Date().toISOString(), cancelada_por: actorUid, cancelada_motivo: acao.motivo }
      const { data, error } = await serviceClient
        .from("recompensas_embaixadoras")
        .update(changes)
        .eq("id", recompensaId)
        .eq("status", "disponivel")
        .select(RETURN_COLUMNS)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as RecompensaAtualizada | null
    },
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "update-recompensa-status", ts: new Date().toISOString(), ...fields })),
    now: () => new Date(),
  }),
)
