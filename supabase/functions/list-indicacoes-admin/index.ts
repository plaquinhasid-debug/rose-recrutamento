// Edge Function: list-indicacoes-admin (E3.1)
//
// Lista as indicações do Programa Embaixadoras pro Admin, chamada só por
// equipe autenticada. SOMENTE LEITURA — nunca insere/atualiza/apaga nada.
// Pré-requisito da E3.2 (Tania confirmar o primeiro mostruário e gerar a
// recompensa de R$40).
//
// AUTORIZAÇÃO — mesmo padrão de list-ambassadors-admin/index.ts (duplicado
// de propósito, não compartilhado):
//   1. extrai o JWT do header Authorization;
//   2. valida-o com supabase.auth.getUser(jwt) (client service-role);
//   3. usa um segundo client, com a ANON key + o Authorization original,
//      pra chamar a RPC public.is_equipe() — auth.uid() resolve pro
//      usuário real da requisição.
// Nunca lê papel/email/user_id de query string ou body.
//
// PRIVACIDADE — o embedded select de `leads` pede só id/nome/cidade/status/
// etapa_pos_aprovacao; nunca telefone, Instagram, IPR, UTMs, IP.
//
// CORS — mesma EMBAIXADORAS_ALLOWED_ORIGINS das outras functions do Admin.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createListIndicacoesAdminHandler, type AuthorizeResult } from "./handler.ts"
import type { IndicacaoAdminJoinRow } from "./logic.ts"

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

Deno.serve(
  createListIndicacoesAdminHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    listIndicacoes: async () => {
      // SELECT explícito — nunca "*".
      const { data, error } = await serviceClient
        .from("indicacoes_embaixadoras")
        .select(
          "id, status, primeira_atribuicao_em, codigo_referral_usado, invalidada_em, " +
            "embaixadoras(id, nome), " +
            "leads(id, nome, cidade, status, etapa_pos_aprovacao), " +
            "recompensas_embaixadoras(status, valor_centavos)",
        )
        .order("primeira_atribuicao_em", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as IndicacaoAdminJoinRow[]
    },
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "list-indicacoes-admin", ts: new Date().toISOString(), ...fields })),
  }),
)
