// Edge Function: confirm-primeiro-mostruario (E3.2)
//
// A equipe confirma que o primeiro mostruário foi ENTREGUE à candidata
// indicada. Cria a recompensa da Embaixadora (R$40, `disponivel` = a pagar
// via Pix). Única escrita: INSERT em `recompensas_embaixadoras`.
//
// AUTORIZAÇÃO — mesmo padrão de list-indicacoes-admin: JWT ->
// auth.getUser() -> RPC public.is_equipe() com o Authorization original.
//
// VALOR — nunca enviado pelo cliente nem calculado aqui: o INSERT omite
// `valor_centavos` e `status`, que vêm dos DEFAULTs da tabela (4000 /
// 'disponivel'). IA/código não recalculam valores (regra do Cérebro).
//
// DUPLICIDADE — o UNIQUE de `indicacao_id` é a trava final: duas
// confirmações simultâneas da mesma indicação geram no máximo 1 linha; a
// segunda recebe 409 `ja_confirmada`.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createConfirmPrimeiroMostruarioHandler, RecompensaJaExisteError, type AuthorizeResult } from "./handler.ts"
import type { EtapaPosAprovacaoRaw, IndicacaoParaConfirmar, LeadStatusRaw, RecompensaCriada } from "./logic.ts"

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
  status: IndicacaoParaConfirmar["status"]
  primeira_atribuicao_em: string
  leads: { status: string; etapa_pos_aprovacao: string | null } | null
  recompensas_embaixadoras: { id: string } | { id: string }[] | null
}

Deno.serve(
  createConfirmPrimeiroMostruarioHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    getIndicacao: async (indicacaoId) => {
      const { data, error } = await serviceClient
        .from("indicacoes_embaixadoras")
        .select("id, status, primeira_atribuicao_em, leads(status, etapa_pos_aprovacao), recompensas_embaixadoras(id)")
        .eq("id", indicacaoId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as IndicacaoQueryRow
      const recompensas = row.recompensas_embaixadoras
      const temRecompensa = Array.isArray(recompensas) ? recompensas.length > 0 : Boolean(recompensas)
      return {
        id: row.id,
        status: row.status,
        primeira_atribuicao_em: row.primeira_atribuicao_em,
        lead: row.leads
          ? {
              status: row.leads.status as LeadStatusRaw,
              etapa_pos_aprovacao: row.leads.etapa_pos_aprovacao as EtapaPosAprovacaoRaw,
            }
          : null,
        tem_recompensa: temRecompensa,
      }
    },
    insertRecompensa: async ({ indicacaoId, primeiroMostruarioEm }) => {
      const { data, error } = await serviceClient
        .from("recompensas_embaixadoras")
        .insert({ indicacao_id: indicacaoId, primeiro_mostruario_em: primeiroMostruarioEm })
        .select("id, status, valor_centavos, primeiro_mostruario_em")
        .single()
      if (error) {
        if (error.code === "23505") throw new RecompensaJaExisteError()
        throw error
      }
      return data as RecompensaCriada
    },
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "confirm-primeiro-mostruario", ts: new Date().toISOString(), ...fields })),
    now: () => new Date(),
  }),
)
