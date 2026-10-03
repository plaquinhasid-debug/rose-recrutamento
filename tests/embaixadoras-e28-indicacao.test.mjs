import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  buildIndicacaoEmbaixadoraRow,
  decideAttribution,
  isPlausibleReferralCode,
} from "../supabase/functions/finalize-candidate/logic.ts"
import { finalizeCandidatePayloadSchema } from "../packages/shared/src/schemas.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.8. Indicação de candidata pela
// Embaixadora. Cobre logic.ts (puro, sem I/O), schema compartilhado,
// captura client-side (tracking.ts), lib do link no Portal, e asserções
// estáticas de código-fonte pra confirmar a fiação (SofiaAssistant/
// useSofiaFlow/finalize-candidate index.ts) sem precisar de Deno/rede real.
// -----------------------------------------------------------------------

const EMBAIXADORA_ID = "aaaaaaaa-0000-0000-0000-000000000001"
const LEAD_ID = "bbbbbbbb-0000-0000-0000-000000000002"

// =========================================================================
// logic.ts — isPlausibleReferralCode
// =========================================================================

test("isPlausibleReferralCode: aceita string não-vazia, rejeita o resto", () => {
  assert.ok(isPlausibleReferralCode("7E9NH4VD"))
  for (const bad of ["", "   ", null, undefined, 123, {}]) {
    assert.ok(!isPlausibleReferralCode(bad), `deveria rejeitar ${JSON.stringify(bad)}`)
  }
})

// =========================================================================
// logic.ts — buildIndicacaoEmbaixadoraRow (defesa em profundidade)
// =========================================================================

test("buildIndicacaoEmbaixadoraRow: projeta exatamente os 4 campos esperados", () => {
  const row = buildIndicacaoEmbaixadoraRow({
    embaixadoraId: EMBAIXADORA_ID,
    leadId: LEAD_ID,
    telefoneNormalizado: "5511989459188",
    codigoReferralUsado: "7E9NH4VD",
  })
  assert.deepEqual(Object.keys(row).sort(), ["candidata_telefone_normalizado", "codigo_referral_usado", "embaixadora_id", "lead_id"])
  assert.deepEqual(row, {
    embaixadora_id: EMBAIXADORA_ID,
    lead_id: LEAD_ID,
    candidata_telefone_normalizado: "5511989459188",
    codigo_referral_usado: "7E9NH4VD",
  })
})

test("buildIndicacaoEmbaixadoraRow: codigo_referral_usado é sempre o valor ORIGINAL recebido, nunca reescrito", () => {
  const row = buildIndicacaoEmbaixadoraRow({
    embaixadoraId: EMBAIXADORA_ID,
    leadId: LEAD_ID,
    telefoneNormalizado: "5511989459188",
    codigoReferralUsado: "minusculo-ou-o-que-for",
  })
  assert.equal(row.codigo_referral_usado, "minusculo-ou-o-que-for")
})

// =========================================================================
// logic.ts — decideAttribution (exaustivo — mapeia os casos E/F/D do pedido)
// =========================================================================

test("Caso E — sem ref: skip 'no_ref', nunca tenta gravar nada", () => {
  const decisao = decideAttribution({
    ref: undefined,
    embaixadora: { id: EMBAIXADORA_ID },
    leadId: LEAD_ID,
    telefoneNormalizado: { valid: true, e164: "5511989459188" },
  })
  assert.deepEqual(decisao, { action: "skip", reason: "no_ref" })
})

test("Caso F — ref presente mas embaixadora não encontrada/não ativa: skip 'embaixadora_not_found'", () => {
  const decisao = decideAttribution({
    ref: "CODIGO_INEXISTENTE",
    embaixadora: null,
    leadId: LEAD_ID,
    telefoneNormalizado: { valid: true, e164: "5511989459188" },
  })
  assert.deepEqual(decisao, { action: "skip", reason: "embaixadora_not_found" })
})

test("ref presente, embaixadora válida, telefone não normaliza: skip 'phone_invalid', nunca tenta gravar", () => {
  const decisao = decideAttribution({
    ref: "7E9NH4VD",
    embaixadora: { id: EMBAIXADORA_ID },
    leadId: LEAD_ID,
    telefoneNormalizado: { valid: false },
  })
  assert.deepEqual(decisao, { action: "skip", reason: "phone_invalid" })
})

test("Caso D — ref válido + embaixadora ativa + telefone normalizável: attempt_insert com a linha certa", () => {
  const decisao = decideAttribution({
    ref: "7E9NH4VD",
    embaixadora: { id: EMBAIXADORA_ID },
    leadId: LEAD_ID,
    telefoneNormalizado: { valid: true, e164: "5511989459188" },
  })
  assert.equal(decisao.action, "attempt_insert")
  assert.deepEqual(decisao.row, {
    embaixadora_id: EMBAIXADORA_ID,
    lead_id: LEAD_ID,
    candidata_telefone_normalizado: "5511989459188",
    codigo_referral_usado: "7E9NH4VD",
  })
})

test("fail-closed exaustivo: 'attempt_insert' só acontece quando ref plausível + embaixadora não-nula + telefone válido, em qualquer outra combinação é sempre 'skip'", () => {
  const refValues = [undefined, "", "7E9NH4VD"]
  const embaixadoraValues = [null, { id: EMBAIXADORA_ID }]
  const telefoneValues = [{ valid: false }, { valid: true, e164: "5511989459188" }]

  for (const ref of refValues) {
    for (const embaixadora of embaixadoraValues) {
      for (const telefoneNormalizado of telefoneValues) {
        const decisao = decideAttribution({ ref, embaixadora, leadId: LEAD_ID, telefoneNormalizado })
        const deveriaInserir = isPlausibleReferralCode(ref) && embaixadora !== null && telefoneNormalizado.valid === true
        assert.equal(
          decisao.action === "attempt_insert",
          deveriaInserir,
          `combinação inesperada: ${JSON.stringify({ ref, embaixadora, telefoneNormalizado })}`,
        )
      }
    }
  }
})

// =========================================================================
// Schema compartilhado — ref é opcional, não quebra payload sem ele
// =========================================================================

const VALID_PAYLOAD_BASE = { session_id: "s1", nome: "Maria", telefone: "11999998888", trabalha: true }

test("finalizeCandidatePayloadSchema: aceita payload sem ref (comportamento atual preservado)", () => {
  const result = finalizeCandidatePayloadSchema.safeParse(VALID_PAYLOAD_BASE)
  assert.ok(result.success)
  assert.equal(result.data.ref, undefined)
})

test("finalizeCandidatePayloadSchema: aceita payload com ref", () => {
  const result = finalizeCandidatePayloadSchema.safeParse({ ...VALID_PAYLOAD_BASE, ref: "7E9NH4VD" })
  assert.ok(result.success)
  assert.equal(result.data.ref, "7E9NH4VD")
})

test("finalizeCandidatePayloadSchema: continua exigindo session_id/nome/telefone/trabalha (nenhuma validação existente foi afrouxada)", () => {
  assert.ok(!finalizeCandidatePayloadSchema.safeParse({ ...VALID_PAYLOAD_BASE, session_id: undefined }).success)
  assert.ok(!finalizeCandidatePayloadSchema.safeParse({ ...VALID_PAYLOAD_BASE, nome: undefined }).success)
  assert.ok(!finalizeCandidatePayloadSchema.safeParse({ ...VALID_PAYLOAD_BASE, telefone: undefined }).success)
})

// =========================================================================
// finalize-candidate/index.ts — asserções estáticas (não executável sem
// Deno real, mesmo padrão já usado nas outras Edge Functions do projeto)
// =========================================================================

function codeOnly(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}

test("index.ts: o bloco de atribuição roda para QUALQUER status (não só aprovada) — vem antes do 'if (status === \"aprovada\")'", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  const idxAtribuicao = code.indexOf("isPlausibleReferralCode(payload.ref)")
  const idxAprovada = code.indexOf('if (status === "aprovada")')
  assert.ok(idxAtribuicao > -1, "bloco de atribuição deveria existir")
  assert.ok(idxAprovada > -1, "bloco de aprovada deveria existir")
  assert.ok(idxAtribuicao < idxAprovada, "atribuição deveria rodar ANTES do bloco condicionado a status==='aprovada'")
})

test("index.ts: resolve embaixadora só por status='ativa', nunca aceita id vindo do payload", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  assert.match(code, /\.eq\("codigo_referral", payload\.ref\)/)
  assert.match(code, /\.eq\("status", "ativa"\)/)
  assert.doesNotMatch(code, /payload\.embaixadora_id/, "nunca deveria ler um embaixadora_id do payload do cliente")
})

test("index.ts: usa UPSERT com ignoreDuplicates na constraint candidata_telefone_normalizado — nunca um INSERT simples que quebraria em conflito", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  assert.match(code, /\.from\("indicacoes_embaixadoras"\)/)
  assert.match(code, /\.upsert\(\s*decisao\.row,\s*\{\s*onConflict:\s*"candidata_telefone_normalizado",\s*ignoreDuplicates:\s*true\s*\}\s*\)/)
})

test("index.ts: o bloco inteiro de atribuição está em try/catch — nunca pode derrubar a resposta principal do recrutamento", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  const blockStart = code.indexOf("if (isPlausibleReferralCode(payload.ref)) {")
  const blockEnd = code.indexOf("if (status === \"aprovada\")")
  const block = code.slice(blockStart, blockEnd)
  assert.match(block, /try\s*\{/)
  assert.match(block, /catch\s*\(err\)\s*\{/)
})

test("index.ts: o log de erro da atribuição nunca inclui o telefone ou o código de indicação em texto livre (só o objeto err genérico)", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  const blockStart = code.indexOf("if (isPlausibleReferralCode(payload.ref)) {")
  const blockEnd = code.indexOf("if (status === \"aprovada\")")
  const block = code.slice(blockStart, blockEnd)
  assert.match(block, /console\.error\("\[finalize-candidate\] falha ao processar atribuição de indicação", err\)/)
  assert.doesNotMatch(block, /console\.error\([^)]*payload\.telefone/)
  assert.doesNotMatch(block, /console\.error\([^)]*payload\.ref/)
})

test("index.ts: importa o normalizador de _shared/phone.ts (não packages/shared — esta function é empacotada como source/+_shared/ siblings, um import de 3 níveis acima escaparia do bundle)", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  assert.match(code, /import \{ normalizeBrazilianPhone \} from "\.\.\/_shared\/phone\.ts"/)
})

test("_shared/phone.ts: é cópia funcional de packages/shared/src/phone.ts — mesmas funções exportadas, mesmo comportamento (regressão contra divergência silenciosa)", async () => {
  const sharedMod = await import("../packages/shared/src/phone.ts")
  const localMod = await import("../supabase/functions/_shared/phone.ts")
  const casosDeTeste = [
    "11 989459188",
    "5511989459188",
    "55 98888-7777",
    "",
    "123",
    "(11) 3333-4444",
  ]
  for (const caso of casosDeTeste) {
    assert.deepEqual(
      localMod.normalizeBrazilianPhone(caso),
      sharedMod.normalizeBrazilianPhone(caso),
      `divergência pra entrada ${JSON.stringify(caso)}`,
    )
  }
})

test("index.ts: nunca cria endpoint/rota de validação de ref separado — toda leitura de payload.ref fica dentro do único bloco de atribuição", () => {
  const code = codeOnly("../supabase/functions/finalize-candidate/index.ts")
  const blockStart = code.indexOf("if (isPlausibleReferralCode(payload.ref)) {")
  const blockEnd = code.indexOf("if (status === \"aprovada\")")
  const before = code.slice(0, blockStart)
  const after = code.slice(blockEnd)
  assert.doesNotMatch(before, /payload\.ref/, "nenhuma leitura de payload.ref antes do bloco de atribuição")
  assert.doesNotMatch(after, /payload\.ref/, "nenhuma leitura de payload.ref depois do bloco de atribuição (ex.: dentro do bloco 'aprovada', na resposta final)")
})

// =========================================================================
// Landing — captura do ?ref= (tracking.ts), mesmo padrão de getOrCaptureFbclid
// =========================================================================

test("tracking.ts: getOrCaptureReferralCode existe e segue o mesmo padrão de getOrCaptureFbclid (URL > sessionStorage > undefined)", () => {
  const code = codeOnly("../apps/landing/src/lib/tracking.ts")
  assert.match(code, /export function getOrCaptureReferralCode/)
  assert.match(code, /get\("ref"\)/)
  assert.match(code, /REFERRAL_CODE_KEY/)
})

test("useSofiaFlow.ts: aceita `ref` nos params e anexa ao payload de finalizeCandidate", () => {
  const code = codeOnly("../apps/landing/src/hooks/useSofiaFlow.ts")
  assert.match(code, /ref\?:\s*string/)
  assert.match(code, /ref,\s*\n\s*\}/, "payload deveria incluir `ref,` logo antes de fechar o objeto")
})

test("SofiaAssistant.tsx: usa useReferralCode() e repassa pro useSofiaFlow", () => {
  const code = codeOnly("../apps/landing/src/components/sofia/SofiaAssistant.tsx")
  assert.match(code, /import \{ useReferralCode \} from "@\/hooks\/useReferralCode"/)
  assert.match(code, /const ref = useReferralCode\(\)/)
  assert.match(code, /ref,/)
})

test("App.tsx (landing): nenhuma rota nova foi criada para ?ref= — cai naturalmente na LandingPage existente", () => {
  const code = codeOnly("../apps/landing/src/App.tsx")
  assert.doesNotMatch(code, /ref/i, "App.tsx não deveria ter nenhuma menção a 'ref' — o query param não precisa de rota nova")
})

// =========================================================================
// Portal — lib/referralLink.ts (puro) + EmbaixadoraPortalPage.tsx (estático)
// =========================================================================

// Import dinâmico do lib do Portal (admin) — precisa do loader que resolve
// "@/" pro app certo (ver tests/ts-extension-loader.mjs, estendido na E2.7-B).
const { buildReferralUrl, buildWhatsappShareMessage, buildWhatsappShareUrl, copyReferralLink } =
  await import("../apps/admin/src/lib/referralLink.ts")

test("buildReferralUrl: monta a URL com ?ref=<codigo>, domínio da Landing, nunca um path novo", () => {
  const url = buildReferralUrl("7E9NH4VD")
  assert.equal(url, "https://www.taniajoiasmaua.com.br/?ref=7E9NH4VD")
})

test("buildReferralUrl: URL-encoda o código corretamente mesmo com caracteres especiais (defesa, embora codigo_referral real nunca tenha)", () => {
  const url = buildReferralUrl("A B&C")
  assert.ok(url.includes("ref=A+B%26C") || url.includes("ref=A%20B%26C"))
})

test("buildWhatsappShareMessage: contém o link completo e o texto padrão do pedido", () => {
  const url = buildReferralUrl("7E9NH4VD")
  const msg = buildWhatsappShareMessage(url)
  assert.ok(msg.includes(url))
  assert.ok(msg.includes("Rose Semi Jóias"))
  assert.ok(msg.includes("revendedoras"))
})

test("buildWhatsappShareUrl: usa wa.me (sem API paga), mensagem URL-encoded", () => {
  const shareUrl = buildWhatsappShareUrl("Oi! Teste & link: https://example.com/?ref=X")
  assert.ok(shareUrl.startsWith("https://wa.me/?text="))
  assert.ok(!shareUrl.includes("&link"), "o '&' da mensagem deveria estar url-encoded, nunca cru")
})

test("copyReferralLink: aguarda sucesso e entrega só a URL ao clipboard", async () => {
  const writes = []
  const ok = await copyReferralLink("https://x.com/?ref=Y", async (v) => { writes.push(v) })
  assert.equal(ok, true)
  assert.deepEqual(writes, ["https://x.com/?ref=Y"])
})

test("copyReferralLink: falha no clipboard retorna false, nunca lança", async () => {
  const ok = await copyReferralLink("https://x.com/?ref=Y", async () => { throw new Error("boom") })
  assert.equal(ok, false)
})

test("EmbaixadoraPortalPage.tsx: mostra o link, botão Copiar link e botão Compartilhar pelo WhatsApp", () => {
  const code = codeOnly("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx")
  assert.match(code, /Indique uma amiga/)
  assert.match(code, /Seu link de indicação/)
  assert.match(code, /Copiar link/)
  assert.match(code, /Compartilhar pelo WhatsApp/)
  assert.match(code, /buildReferralUrl\(codigo_referral\)/)
})

test("EmbaixadoraPortalPage.tsx: não implementa indicações realizadas/conversões/recompensas/saldo/ConsigGold/R$40 (fora de escopo da E2.8)", () => {
  const code = codeOnly("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx")
  // E3.4: prêmio/totais passaram a ser escopo real; continua proibido o resto.
  assert.doesNotMatch(code, /indicações realizadas|convers(ã|a)o|consiggold|r\$\s*40|dashboard/i)
})

test("EmbaixadoraPortalPage.tsx: nunca faz chamada de rede nova — usa só o codigo_referral que useMyEmbaixadora já devolve", () => {
  const code = codeOnly("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx")
  assert.doesNotMatch(code, /supabase\.functions\.invoke|fetch\(/)
})

test("segurança estática: referralLink.ts nunca menciona service_role, UUID de embaixadora, nem armazenamento", () => {
  const code = codeOnly("../apps/admin/src/lib/referralLink.ts")
  assert.doesNotMatch(code, /service_role|SUPABASE_SERVICE_ROLE_KEY|embaixadora_id|localStorage|sessionStorage|console\.(log|error)/)
})
