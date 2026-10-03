// Edge Function: finalize-candidate
//
// Único ponto de escrita da tabela `leads` a partir da Landing Page.
// Roda com a service role key (RLS não se aplica aqui), então é o lugar certo
// para aplicar as regras de negócio de forma que o cliente nunca possa
// fabricar um IPR ou status.
//
// `decidirStatus`/`classificarPerfil` continuam 100% determinísticos (motor
// de regras baseado no IPR) — isso decide aprovação/reprovação e nunca deve
// depender de uma chamada externa. A Anthropic/Claude (ver `_shared/ai-analysis.ts`)
// entra só depois, como enriquecimento best-effort do texto (`resumo`/
// `perfil_motivo`); se falhar ou a chave não estiver configurada, cai no
// texto determinístico de `gerarResumo`/`classificarPerfil` sem afetar nada.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendMetaLeadEvent } from "../_shared/meta-conversions.ts"
import { CLAUDE_MODEL, generateAiAnalysis } from "../_shared/ai-analysis.ts"
// IMPLEMENTATION-EMBAIXADORAS-E2.8 — cópia local (não import cruzando pra
// packages/shared): finalize-candidate já é deployado com a convenção
// "source/index.ts" + "_shared/*.ts" siblings (sem espelhar a árvore real
// do repo), então um import de 3 níveis acima escaparia do bundle nesse
// empacotamento. Mesma disciplina já usada por normalizeBrazilPhone em
// _shared/whatsapp-cloud-api.ts — ver cabeçalho de _shared/phone.ts pro
// motivo completo.
import {
  PROFISSOES_PREFERIDAS,
  calcularElegibilidade,
  calcularIpr,
  classificarPerfil,
  decidirStatus,
  gerarResumo,
  isCidadeAtendida,
  mapEstabilidadeProfissional,
  type CidadesAtendidas,
  type IprPesos,
  type IprThresholds,
  type Payload,
  type SofiaIaAtiva,
} from "./logic.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  if (!payload?.session_id || !payload?.nome || !payload?.telefone) {
    return jsonResponse({ error: "missing_required_fields" }, 400)
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const userAgent = req.headers.get("user-agent")

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("chave, valor")
    .in("chave", [
      "ipr_pesos",
      "ipr_thresholds",
      "cidades_atendidas",
      "sofia_ia_ativa",
    ])

  if (settingsError) {
    return jsonResponse({ error: "settings_fetch_failed", detail: settingsError.message }, 500)
  }

  const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.chave, s.valor]))
  const pesos = settingsMap.ipr_pesos as IprPesos
  const thresholds = settingsMap.ipr_thresholds as IprThresholds
  const cidadesConfig = settingsMap.cidades_atendidas as CidadesAtendidas
  const sofiaIaAtiva = Boolean((settingsMap.sofia_ia_ativa as SofiaIaAtiva | undefined)?.ativa)

  const cidadeAtendida = isCidadeAtendida(payload.cidade, cidadesConfig)
  // RFC-INTELLIGENCE-006 — idade e WhatsApp, junto com `trabalha`, são gates
  // de elegibilidade fora da soma de pontos do IPR (Abordagem A da RFC-006):
  // `elegivel=false` reprova incondicionalmente, IPR e breakdown vêm
  // zerados, e nenhum dos dois entra em `settings.ipr_pesos`.
  const { elegivel, idadeElegivel } = calcularElegibilidade(payload)
  const { total: ipr, breakdown } = calcularIpr(payload, pesos, cidadeAtendida, elegivel)
  const status = decidirStatus(elegivel, ipr, thresholds, Boolean(payload.instagram))
  const { perfil, motivo } = classificarPerfil(elegivel, ipr, thresholds)
  const recomendacao =
    status === "aprovada" ? "aprovar" : status === "reprovada" ? "reprovar" : "analise_manual"

  // Fallback determinístico (sempre calculado). Se a candidata é elegível, a
  // flag `sofia_ia_ativa` está ligada e a chave da Anthropic está
  // configurada, tentamos substituir por uma análise real — o rótulo de
  // perfil (`perfil`) e o `status` nunca mudam com isso, só o texto
  // explicativo e os campos consultivos abaixo ficam mais ricos.
  let resumo = gerarResumo(payload, idadeElegivel, perfil)
  let motivoFinal = motivo
  let analiseModel = "rules-engine-v1"
  let analiseExpandida: Awaited<ReturnType<typeof generateAiAnalysis>> | null = null

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (elegivel && perfil && sofiaIaAtiva && anthropicApiKey) {
    try {
      const ai = await generateAiAnalysis({
        apiKey: anthropicApiKey,
        nome: payload.nome,
        cidade: payload.cidade,
        idade: payload.idade,
        profissao: payload.profissao,
        empresaAtual: payload.empresa_atual,
        experienciaVendas: payload.experiencia_vendas,
        whatsapp: payload.whatsapp,
        possuiInstagram: Boolean(payload.instagram),
        tempoDisponivel: payload.tempo_disponivel,
        objetivo: payload.objetivo,
        perfilComercial: perfil,
        ipr,
        qualificacao: {
          cidadesAtendidas: cidadesConfig.restringir ? cidadesConfig.lista : [],
          profissoesPreferidas: PROFISSOES_PREFERIDAS,
        },
      })
      resumo = ai.resumo
      motivoFinal = ai.perfilMotivo
      analiseModel = CLAUDE_MODEL
      analiseExpandida = ai
    } catch (err) {
      console.error("[finalize-candidate] falha na análise IA, usando fallback determinístico", err)
    }
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      nome: payload.nome,
      telefone: payload.telefone,
      cidade: payload.cidade ?? null,
      idade: payload.idade ?? null,
      trabalha: payload.trabalha,
      empresa_atual: payload.empresa_atual ?? null,
      profissao: payload.profissao ?? null,
      // QUALIFICACAO-002, Parte 1 — só persistência estruturada. Nunca
      // entra em `calcularIpr`/`decidirStatus`/`classificarPerfil` acima
      // (calculados antes desta linha, sem nenhuma referência a este campo).
      estabilidade_profissional: mapEstabilidadeProfissional(payload.estabilidade_profissional),
      experiencia_vendas: payload.experiencia_vendas ?? null,
      instagram: payload.instagram ?? null,
      whatsapp: payload.whatsapp ?? null,
      tempo_disponivel: payload.tempo_disponivel ?? null,
      objetivo: payload.objetivo ?? null,
      ipr,
      perfil_comercial: perfil,
      resumo_ia: resumo,
      status,
      origem: payload.origem ?? "organico",
      campanha: payload.campanha ?? null,
      utm_source: payload.utm_source ?? null,
      utm_medium: payload.utm_medium ?? null,
      utm_campaign: payload.utm_campaign ?? null,
      utm_content: payload.utm_content ?? null,
      fbp: payload.fbp ?? null,
      fbc: payload.fbc ?? null,
      fbclid: payload.fbclid ?? null,
      client_ip: clientIp,
      client_user_agent: userAgent,
    })
    .select("id")
    .single()

  if (leadError || !lead) {
    return jsonResponse({ error: "lead_insert_failed", detail: leadError?.message }, 500)
  }

  await supabase.from("ai_analysis").insert({
    lead_id: lead.id,
    resumo,
    perfil_comercial: perfil,
    perfil_motivo: motivoFinal,
    ipr_score: ipr,
    ipr_breakdown: breakdown,
    recomendacao,
    model: analiseModel,
    resumo_executivo: analiseExpandida?.resumoExecutivo ?? null,
    resumo_comercial: analiseExpandida?.resumoComercial ?? null,
    resumo_comportamental: analiseExpandida?.resumoComportamental ?? null,
    resumo_motivacional: analiseExpandida?.resumoMotivacional ?? null,
    icp_score: analiseExpandida?.icpScore ?? null,
    perfil_sugerido_ia: analiseExpandida?.perfilSugeridoIa ?? null,
    potencial_empreendedor: analiseExpandida?.potencialEmpreendedor ?? null,
    probabilidade_sucesso: analiseExpandida?.probabilidadeSucesso ?? null,
    grau_confianca_ia: analiseExpandida?.grauConfiancaIa ?? null,
    grau_confianca_explicacao: analiseExpandida?.grauConfiancaExplicacao ?? null,
    proxima_acao: analiseExpandida?.proximaAcao ?? null,
    sentimento: analiseExpandida?.sentimento ?? null,
    motivacao_principal: analiseExpandida?.motivacaoPrincipal ?? null,
    pontos_fortes: analiseExpandida?.pontosFortes ?? null,
    pontos_atencao: analiseExpandida?.pontosAtencao ?? null,
  })

  await supabase
    .from("conversations")
    .update({ status: "concluida", completed_at: new Date().toISOString(), lead_id: lead.id })
    .eq("session_id", payload.session_id)

  // `is("lead_id", null)` evita "roubar" respostas de um lead anterior caso o
  // mesmo session_id (persistido em sessionStorage) seja reaproveitado por uma
  // conversa completamente nova na mesma aba do navegador.
  await supabase
    .from("answers")
    .update({ lead_id: lead.id })
    .eq("session_id", payload.session_id)
    .is("lead_id", null)

  const eventos = [
    payload.trabalha ? "respondeu_trabalha_sim" : "respondeu_trabalha_nao",
    status === "aprovada" ? "aprovada" : status === "em_analise" ? "analise_manual" : "reprovada",
  ] as const

  await supabase.from("logs").insert(
    eventos.map((tipo_evento) => ({
      tipo_evento,
      lead_id: lead.id,
      session_id: payload.session_id,
      campanha: payload.campanha ?? null,
      origem: payload.origem ?? null,
    })),
  )

  if (status === "aprovada") {
    // Gera o link da Ficha de Aprovação sozinho, mesmo quando a própria IPR
    // já aprova a candidata na hora (sem passar pela equipe no Admin) — sem
    // isso, essa lead ficava esperando alguém lembrar de gerar o link
    // manualmente. Best-effort: nunca deve derrubar a resposta principal.
    try {
      const { data: ficha, error: fichaError } = await supabase
        .from("leads_ficha")
        .insert({ lead_id: lead.id })
        .select("token")
        .single()
      if (fichaError) throw fichaError
      await supabase
        .from("leads")
        .update({ etapa_pos_aprovacao: "contatada" })
        .eq("id", lead.id)
        .is("etapa_pos_aprovacao", null)

    } catch (err) {
      console.error("[finalize-candidate] falha ao gerar link da Ficha automaticamente", err)
    }

    const pixelId = Deno.env.get("META_PIXEL_ID")
    const accessToken = Deno.env.get("META_CONVERSIONS_API_TOKEN")
    if (pixelId && accessToken) {
      try {
        await sendMetaLeadEvent({
          pixelId,
          accessToken,
          leadId: lead.id,
          telefone: payload.telefone,
          fbp: payload.fbp,
          fbc: payload.fbc,
          clientIp,
          userAgent,
        })
        await supabase
          .from("leads")
          .update({ meta_lead_sent_at: new Date().toISOString() })
          .eq("id", lead.id)
      } catch (err) {
        console.error("[finalize-candidate] falha ao enviar evento Lead ao Meta", err)
      }
    }

  }

  return jsonResponse({
    lead_id: lead.id,
    status,
    ipr,
    perfil_comercial: perfil,
    resumo_ia: resumo,
  })
})
