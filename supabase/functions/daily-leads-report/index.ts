import { BRAND } from "../_shared/brand.ts"
// Edge Function: daily-leads-report
//
// Roda todo dia de manhã via pg_cron (ver migração `schedule_daily_leads_report`),
// monta um resumo dos leads do dia anterior e envia por e-mail via Resend.
//
// Brasil não observa horário de verão desde 2019, então usamos um offset fixo
// de -03:00 para calcular o "dia" em horário local sem depender de fusos do Deno.
import { createClient } from "npm:@supabase/supabase-js@2"

const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000

function getBrazilYesterdayRangeUtc(): { start: Date; end: Date; label: string } {
  const nowBrazil = new Date(Date.now() - BRAZIL_OFFSET_MS)
  const yesterdayBrazil = new Date(
    Date.UTC(nowBrazil.getUTCFullYear(), nowBrazil.getUTCMonth(), nowBrazil.getUTCDate() - 1),
  )

  const start = new Date(yesterdayBrazil.getTime() + BRAZIL_OFFSET_MS)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const label = yesterdayBrazil.toLocaleDateString("pt-BR", { timeZone: "UTC" })

  return { start, end, label }
}

function formatPhone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return telefone
}

type LeadRow = {
  nome: string
  telefone: string
  cidade: string | null
  status: string
  ipr: number
  perfil_comercial: string | null
  origem: string | null
  campanha: string | null
}

function renderLeadItem(lead: LeadRow): string {
  return `
    <li style="margin-bottom:8px;">
      <strong>${lead.nome}</strong> — ${formatPhone(lead.telefone)}
      ${lead.cidade ? ` · ${lead.cidade}` : ""}
      · IPR ${lead.ipr}
    </li>
  `
}

type AbandonedRow = {
  session_id: string
  started_at: string
  nome: string | null
  telefone: string | null
}

function renderAbandonedItem(row: AbandonedRow): string {
  return `
    <li style="margin-bottom:8px;">
      <strong>${row.nome ?? "Sem nome ainda"}</strong>
      ${row.telefone ? ` — ${formatPhone(row.telefone)}` : ""}
    </li>
  `
}

function renderEmailHtml(params: {
  label: string
  total: number
  aprovadas: LeadRow[]
  emAnalise: LeadRow[]
  reprovadasCount: number
  abandonadas: AbandonedRow[]
}): string {
  const { label, total, aprovadas, emAnalise, reprovadasCount, abandonadas } = params

  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
    <h2 style="color:#8a6d3b;">Relatório diário — ${BRAND.nome}</h2>
    <p style="color:#555;">Leads de <strong>${label}</strong></p>

    <div style="display:flex; gap:12px; margin: 20px 0;">
      <div style="background:#faf6ee; border-radius:8px; padding:14px 18px; margin-right:10px;">
        <div style="font-size:22px; font-weight:bold;">${total}</div>
        <div style="font-size:12px; color:#777;">Total de leads</div>
      </div>
      <div style="background:#eefaf0; border-radius:8px; padding:14px 18px; margin-right:10px;">
        <div style="font-size:22px; font-weight:bold; color:#2e7d32;">${aprovadas.length}</div>
        <div style="font-size:12px; color:#777;">Aprovadas</div>
      </div>
      <div style="background:#fff8e1; border-radius:8px; padding:14px 18px; margin-right:10px;">
        <div style="font-size:22px; font-weight:bold; color:#b8860b;">${emAnalise.length}</div>
        <div style="font-size:12px; color:#777;">Em análise</div>
      </div>
      <div style="background:#fbebee; border-radius:8px; padding:14px 18px;">
        <div style="font-size:22px; font-weight:bold; color:#c62828;">${reprovadasCount}</div>
        <div style="font-size:12px; color:#777;">Reprovadas</div>
      </div>
    </div>

    ${
      aprovadas.length > 0
        ? `<h3 style="color:#2e7d32;">✅ Aprovadas — pode chamar no WhatsApp</h3>
           <ul style="padding-left:18px;">${aprovadas.map(renderLeadItem).join("")}</ul>`
        : ""
    }

    ${
      emAnalise.length > 0
        ? `<h3 style="color:#b8860b;">🕒 Em análise — precisa decidir</h3>
           <ul style="padding-left:18px;">${emAnalise.map(renderLeadItem).join("")}</ul>`
        : ""
    }

    ${total === 0 ? `<p style="color:#777;">Nenhum lead novo nesse dia.</p>` : ""}

    ${
      abandonadas.length > 0
        ? `<h3 style="color:#8a6d3b;">💬 Abandonaram a conversa — sem finalizar</h3>
           <ul style="padding-left:18px;">${abandonadas.map(renderAbandonedItem).join("")}</ul>`
        : ""
    }

    <p style="margin-top:30px; font-size:12px; color:#999;">
      Enviado automaticamente pelo sistema ${BRAND.nome}. Veja todos os detalhes no
      <a href="https://tania-joias-recrutamento.vercel.app" style="color:#8a6d3b;">painel Admin</a>.
    </p>
  </div>
  `
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { start, end, label } = getBrazilYesterdayRangeUtc()

  const { data: leads, error } = await supabase
    .from("leads")
    .select("nome, telefone, cidade, status, ipr, perfil_comercial, origem, campanha")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const rows = (leads ?? []) as LeadRow[]
  const aprovadas = rows.filter((l) => l.status === "aprovada")
  const emAnalise = rows.filter((l) => l.status === "em_analise")
  const reprovadasCount = rows.filter((l) => l.status === "reprovada").length

  // Conversas iniciadas ontem que nunca viraram lead (RFC-012) — cruza
  // `conversations` com as respostas parciais em `answers` pelo mesmo
  // `session_id`, sem nenhuma tabela ou coluna nova.
  const { data: abandonedConversations, error: abandonedError } = await supabase
    .from("conversations")
    .select("session_id, started_at")
    .is("completed_at", null)
    .is("lead_id", null)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString())
    .order("started_at", { ascending: true })

  if (abandonedError) {
    return new Response(JSON.stringify({ error: abandonedError.message }), { status: 500 })
  }

  const abandonedSessionIds = (abandonedConversations ?? []).map((c) => c.session_id)
  const { data: abandonedAnswers, error: abandonedAnswersError } = abandonedSessionIds.length
    ? await supabase
        .from("answers")
        .select("session_id, question_key, answer_value")
        .in("session_id", abandonedSessionIds)
    : { data: [], error: null }

  if (abandonedAnswersError) {
    return new Response(JSON.stringify({ error: abandonedAnswersError.message }), { status: 500 })
  }

  const abandonadas: AbandonedRow[] = (abandonedConversations ?? []).map((conv) => {
    const ownAnswers = (abandonedAnswers ?? []).filter((a) => a.session_id === conv.session_id)
    // findLast: `answers` permite múltiplas linhas pra mesma question_key
    // (RFC-012) — a mais recente é a que vale.
    const findAnswer = (key: string) =>
      ownAnswers.findLast((a) => a.question_key === key)?.answer_value ?? null
    return {
      session_id: conv.session_id,
      started_at: conv.started_at,
      nome: findAnswer("nome"),
      telefone: findAnswer("telefone"),
    }
  })

  const html = renderEmailHtml({
    label,
    total: rows.length,
    aprovadas,
    emAnalise,
    reprovadasCount,
    abandonadas,
  })

  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "resend_api_key_not_configured" }), { status: 500 })
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${BRAND.nome} <onboarding@resend.dev>`,
      to: ["taniajoiasmaua@gmail.com"],
      subject: `Relatório diário de leads — ${label}`,
      html,
    }),
  })

  if (!emailResponse.ok) {
    const detail = await emailResponse.text()
    return new Response(JSON.stringify({ error: "resend_send_failed", detail }), { status: 502 })
  }

  return new Response(
    JSON.stringify({ sent: true, total: rows.length, abandonadas: abandonadas.length, label }),
    { status: 200 },
  )
})
