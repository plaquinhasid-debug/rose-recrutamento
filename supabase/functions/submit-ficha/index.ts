// Edge Function `submit-ficha` (Rose) — duas ações, sempre validadas pelo
// token único da ficha:
//   action "upload_urls": devolve links assinados pra candidata enviar os
//     documentos direto pro bucket privado (ela nunca tem acesso ao bucket).
//   (padrão) envio da ficha: valida, grava, move a lead pra "Ficha recebida"
//     e avisa a dona por e-mail (Resend).
import { createClient } from "npm:@supabase/supabase-js@2"

import {
  BUCKET_DOCUMENTOS,
  montarEmailFicha,
  validarFicha,
  validarPedidoUpload,
  type LeadResumo,
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

async function enviarEmailAviso(subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  const destinatarios = (Deno.env.get("NOTIFICACAO_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
  if (!apiKey || destinatarios.length === 0) {
    console.warn("[submit-ficha] aviso por e-mail desligado (RESEND_API_KEY/NOTIFICACAO_EMAILS ausentes)")
    return
  }
  const from = Deno.env.get("EMAIL_REMETENTE") ?? "Rose Semi Jóias <onboarding@resend.dev>"
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: destinatarios, subject, html }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  const token = body.token
  if (typeof token !== "string" || !token) return jsonResponse({ error: "missing_token" }, 400)

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: ficha } = await supabase
    .from("leads_ficha")
    .select("id, lead_id, preenchido_em")
    .eq("token", token)
    .maybeSingle()

  if (!ficha) return jsonResponse({ error: "invalid_token" }, 404)
  if (ficha.preenchido_em) return jsonResponse({ error: "already_submitted" }, 409)

  // ---- Links de upload dos documentos ----
  if (body.action === "upload_urls") {
    const pedido = validarPedidoUpload(body.arquivos)
    if (!pedido.ok) return jsonResponse({ error: "invalid_payload", field: pedido.field }, 400)

    const uploads: { tipo: string; path: string; uploadToken: string }[] = []
    for (const { tipo, ext } of pedido.arquivos) {
      const path = `${ficha.id}/${tipo}-${crypto.randomUUID()}.${ext}`
      const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(path)
      if (error || !data) {
        console.error("[submit-ficha] falha ao gerar link de upload", error)
        return jsonResponse({ error: "internal_error" }, 500)
      }
      uploads.push({ tipo, path: data.path, uploadToken: data.token })
    }
    return jsonResponse({ uploads })
  }

  // ---- Envio da ficha ----
  const validacao = validarFicha(body, ficha.id)
  if (!validacao.ok) return jsonResponse({ error: "invalid_payload", field: validacao.field }, 400)

  const { error: updateError } = await supabase.from("leads_ficha").update(validacao.patch).eq("id", ficha.id)
  if (updateError) {
    console.error("[submit-ficha] falha ao gravar", updateError)
    return jsonResponse({ error: "internal_error" }, 500)
  }

  // Coluna "Ficha recebida" do CRM (só avança se estava em "Pré-aprovada / ficha pendente").
  const { error: stageError } = await supabase
    .from("leads")
    .update({ etapa_pos_aprovacao: "confirmada" })
    .eq("id", ficha.lead_id)
    .eq("etapa_pos_aprovacao", "contatada")
  if (stageError) console.error("[submit-ficha] falha ao avançar etapa no CRM", stageError)

  try {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, telefone, cidade, idade, profissao, empresa_atual, instagram")
      .eq("id", ficha.lead_id)
      .single()
    if (lead) {
      const adminUrl = Deno.env.get("ADMIN_URL") ?? null
      const { subject, html } = montarEmailFicha(lead as LeadResumo, validacao.patch, adminUrl)
      await enviarEmailAviso(subject, html)
    }
  } catch (err) {
    // Nunca falha o envio da candidata por causa do aviso — a ficha já está salva.
    console.error("[submit-ficha] falha ao enviar aviso por e-mail", err)
  }

  return jsonResponse({ ok: true })
})
