// Edge Function: get-my-indicacoes (E2.9)
//
// Portal da Embaixadora, aba "Minhas indicações": devolve a lista mínima
// de indicações (nome da candidata, situação amigável, data) pra QUALQUER
// usuário autenticado cujo `auth.uid()` corresponda a
// `embaixadoras.user_id`, cujo status seja `ativa`, E que NÃO seja equipe.
// SOMENTE LEITURA — nunca insere/atualiza/apaga nada. E3.4: passa a LER
// status/valor de `recompensas_embaixadoras` (nunca escreve).
//
// Function NOVA e SEPARADA de get-my-embaixadora (decisão de arquitetura
// E2.9, seção 4) — nunca estende aquela function já validada em produção.
// Reproduz a MESMA cadeia autoritativa, código replicado de forma quase
// mecânica (não é uma segunda interpretação de "quem é a Embaixadora
// autenticada"): JWT -> auth.getUser() -> checkIsEquipe (consulta direta a
// profiles.papel) -> embaixadoras.user_id = uid + status='ativa' ->
// embaixadora_id (interno, nunca exposto) -> indicacoes_embaixadoras
// filtradas por esse id.
//
// PRIVACIDADE (E2.9, seção 5) — o SELECT de `leads` via embedded join pede
// só nome/status/etapa_pos_aprovacao; nunca telefone, cidade, profissão,
// Instagram, IPR, UTMs, IP, session_id, conversation_id, observações.
//
// CORS — mesma allowlist de get-my-embaixadora (EMBAIXADORAS_ALLOWED_ORIGINS).
//
// service_role só existe aqui dentro (I/O real) — nunca é exposto ao
// browser. Nenhuma GRANT/RLS nova foi criada pra `authenticated` ler
// `indicacoes_embaixadoras`/`leads` direto — o acesso continua mediado só
// por esta function.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createGetMyIndicacoesHandler, type AuthorizeResult } from "./handler.ts"
import type { EmbaixadoraStatus, IndicacaoJoinRow } from "./logic.ts"

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
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function authorize(authorizationHeader: string | null): Promise<AuthorizeResult> {
  if (!authorizationHeader?.startsWith("Bearer ")) return { authorized: false, status: 401 }
  const jwt = authorizationHeader.slice("Bearer ".length).trim()
  if (!jwt) return { authorized: false, status: 401 }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(jwt)
  if (userError || !userData.user) return { authorized: false, status: 401 }

  return { authorized: true, uid: userData.user.id }
}

Deno.serve(
  createGetMyIndicacoesHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    // Mesma condição autoritativa de get-my-embaixadora: `papel = 'equipe'`,
    // consultada direto pelo uid já validado por auth.getUser() acima.
    checkIsEquipe: async (uid) => {
      const { data, error } = await serviceClient
        .from("profiles")
        .select("papel")
        .eq("id", uid)
        .maybeSingle()
      if (error) throw error
      return data?.papel === "equipe"
    },
    // SELECT explícito — nunca "*". Só os 2 campos que o handler precisa
    // (id interno, nunca exposto ao cliente; status pra checar elegibilidade).
    // `.eq("user_id", uid)`: uid vem SÓ de `authorize`, nunca de body/query.
    findMinhaEmbaixadora: async (uid) => {
      const { data, error } = await serviceClient
        .from("embaixadoras")
        .select("id, status")
        .eq("user_id", uid)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as { id: string; status: EmbaixadoraStatus } | null
    },
    // `embaixadoraId` vem só do resultado de findMinhaEmbaixadora acima —
    // nunca de query/body/header. Filtra status='atribuida' aqui (eficiência
    // de query) E de novo em logic.ts (defesa em profundidade — nunca confia
    // só no filtro do banco). Embedded select de `leads` pede só os 3 campos
    // mínimos necessários para montar a situação pública.
    findIndicacoes: async (embaixadoraId) => {
      const { data, error } = await serviceClient
        .from("indicacoes_embaixadoras")
        .select("status, primeira_atribuicao_em, leads(nome, status, etapa_pos_aprovacao), recompensas_embaixadoras(status, valor_centavos)")
        .eq("embaixadora_id", embaixadoraId)
        .eq("status", "atribuida")
        .order("primeira_atribuicao_em", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as IndicacaoJoinRow[]
    },
    // Log estruturado e minimizado — nunca grava nome da candidata,
    // telefone ou qualquer PII, só o uid (identificador interno), o tipo de
    // evento e (no sucesso) a contagem total.
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "get-my-indicacoes", ts: new Date().toISOString(), ...fields })),
  }),
)
