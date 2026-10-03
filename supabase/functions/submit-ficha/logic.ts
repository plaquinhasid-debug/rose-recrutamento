// Lógica pura (sem I/O) de `submit-ficha` — validação da ficha da Rose e
// montagem do e-mail de aviso. Testável sem subir o servidor (ver
// tests/rose-submit-ficha.test.mjs).
import { BRAND } from "../_shared/brand.ts"

export const BUCKET_DOCUMENTOS = "fichas-documentos"
export const DOCUMENTO_TIPOS = ["documento_frente", "documento_verso", "comprovante_residencia"] as const
export type DocumentoTipo = (typeof DOCUMENTO_TIPOS)[number]
export const DOCUMENTO_TIPO_LABEL: Record<DocumentoTipo, string> = {
  documento_frente: "RG ou CNH (frente)",
  documento_verso: "RG ou CNH (verso)",
  comprovante_residencia: "Comprovante de residência",
}
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024

const REQUIRED_STRING_FIELDS = [
  "endereco_rua",
  "endereco_numero",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_cep",
  "ref1_nome",
  "ref1_telefone",
  "ref2_nome",
  "ref2_telefone",
] as const

const CASA_PROPRIA = ["propria", "alugada", "familia"] as const
const RESTRICAO_CPF = ["nao", "sim", "nao_sei"] as const

export type ValidationResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; field: string }

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Extensão segura a partir do nome do arquivo (nunca confia em caminho vindo do cliente). */
export function extensaoSegura(nome: unknown): string {
  const m = typeof nome === "string" ? /\.([a-zA-Z0-9]{1,5})$/.exec(nome) : null
  const ext = m ? m[1].toLowerCase() : ""
  return ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(ext) ? ext : "bin"
}

/** Valida o pedido de links de upload. Devolve a lista limpa ou o campo inválido. */
export function validarPedidoUpload(
  arquivos: unknown,
): { ok: true; arquivos: { tipo: DocumentoTipo; ext: string }[] } | { ok: false; field: string } {
  if (!Array.isArray(arquivos) || arquivos.length === 0 || arquivos.length > DOCUMENTO_TIPOS.length) {
    return { ok: false, field: "arquivos" }
  }
  const out: { tipo: DocumentoTipo; ext: string }[] = []
  for (const a of arquivos) {
    const tipo = (a as { tipo?: unknown })?.tipo
    const tamanho = (a as { tamanho?: unknown })?.tamanho
    if (!DOCUMENTO_TIPOS.includes(tipo as DocumentoTipo)) return { ok: false, field: "tipo" }
    if (typeof tamanho !== "number" || tamanho <= 0 || tamanho > MAX_DOCUMENTO_BYTES) {
      return { ok: false, field: "tamanho" }
    }
    if (out.some((o) => o.tipo === tipo)) return { ok: false, field: "tipo" }
    out.push({ tipo: tipo as DocumentoTipo, ext: extensaoSegura((a as { nome?: unknown }).nome) })
  }
  return { ok: true, arquivos: out }
}

/**
 * Valida a ficha e devolve o patch pronto pra gravar em `leads_ficha`.
 * `fichaId` garante que os documentos aceitos sejam só os que estão na
 * pasta desta ficha (o cliente não consegue apontar pra arquivo de outra).
 */
export function validarFicha(body: Record<string, unknown>, fichaId: string): ValidationResult {
  for (const field of REQUIRED_STRING_FIELDS) {
    if (!str(body[field])) return { ok: false, field }
  }
  if (!CASA_PROPRIA.includes(body.casa_propria as (typeof CASA_PROPRIA)[number])) {
    return { ok: false, field: "casa_propria" }
  }
  if (!RESTRICAO_CPF.includes(body.restricao_cpf as (typeof RESTRICAO_CPF)[number])) {
    return { ok: false, field: "restricao_cpf" }
  }
  const filhos = Number(body.filhos_quantidade)
  if (!Number.isInteger(filhos) || filhos < 0 || filhos > 20) return { ok: false, field: "filhos_quantidade" }

  const trabalha = body.trabalha_atualmente
  if (typeof trabalha !== "boolean") return { ok: false, field: "trabalha_atualmente" }
  if (trabalha) {
    for (const f of ["trabalho_endereco", "trabalho_telefone", "trabalho_horario"]) {
      if (!str(body[f])) return { ok: false, field: f }
    }
  }

  const temConjuge = body.tem_conjuge
  if (typeof temConjuge !== "boolean") return { ok: false, field: "tem_conjuge" }
  let conjugeTrabalha = false
  if (temConjuge) {
    if (!str(body.conjuge_nome)) return { ok: false, field: "conjuge_nome" }
    if (!str(body.conjuge_telefone)) return { ok: false, field: "conjuge_telefone" }
    if (typeof body.conjuge_trabalha !== "boolean") return { ok: false, field: "conjuge_trabalha" }
    conjugeTrabalha = body.conjuge_trabalha
    if (conjugeTrabalha) {
      if (!str(body.conjuge_trabalho_local)) return { ok: false, field: "conjuge_trabalho_local" }
      if (!str(body.conjuge_trabalho_telefone)) return { ok: false, field: "conjuge_trabalho_telefone" }
    }
  }

  const docs = Array.isArray(body.documentos) ? body.documentos : []
  const documentos: { tipo: DocumentoTipo; path: string }[] = []
  for (const d of docs) {
    const tipo = (d as { tipo?: unknown })?.tipo
    const path = (d as { path?: unknown })?.path
    if (!DOCUMENTO_TIPOS.includes(tipo as DocumentoTipo)) return { ok: false, field: "documentos" }
    if (typeof path !== "string" || !path.startsWith(`${fichaId}/`) || path.includes("..")) {
      return { ok: false, field: "documentos" }
    }
    documentos.push({ tipo: tipo as DocumentoTipo, path })
  }
  for (const tipo of DOCUMENTO_TIPOS) {
    if (!documentos.some((d) => d.tipo === tipo)) return { ok: false, field: "documentos" }
  }

  return {
    ok: true,
    patch: {
      endereco_rua: str(body.endereco_rua),
      endereco_numero: str(body.endereco_numero),
      endereco_bairro: str(body.endereco_bairro),
      endereco_cidade: str(body.endereco_cidade),
      endereco_cep: str(body.endereco_cep),
      casa_propria: body.casa_propria,
      trabalha_atualmente: trabalha,
      trabalho_endereco: trabalha ? str(body.trabalho_endereco) : null,
      trabalho_telefone: trabalha ? str(body.trabalho_telefone) : null,
      trabalho_horario: trabalha ? str(body.trabalho_horario) : null,
      tem_conjuge: temConjuge,
      conjuge_nome: temConjuge ? str(body.conjuge_nome) : null,
      conjuge_telefone: temConjuge ? str(body.conjuge_telefone) : null,
      conjuge_trabalha: temConjuge ? conjugeTrabalha : null,
      conjuge_trabalho_local: temConjuge && conjugeTrabalha ? str(body.conjuge_trabalho_local) : null,
      conjuge_trabalho_telefone: temConjuge && conjugeTrabalha ? str(body.conjuge_trabalho_telefone) : null,
      filhos_quantidade: filhos,
      instagram_profissional: str(body.instagram_profissional),
      restricao_cpf: body.restricao_cpf,
      ref1_nome: str(body.ref1_nome),
      ref1_telefone: str(body.ref1_telefone),
      ref2_nome: str(body.ref2_nome),
      ref2_telefone: str(body.ref2_telefone),
      documentos,
      preenchido_em: new Date().toISOString(),
    },
  }
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const CASA_LABEL: Record<string, string> = { propria: "Própria", alugada: "Alugada", familia: "De familiares / cedida" }
const CPF_LABEL: Record<string, string> = { nao: "Não", sim: "Sim", nao_sei: "Não sabe" }

export interface LeadResumo {
  id: string
  nome: string
  telefone: string
  cidade: string | null
  idade: number | null
  profissao: string | null
  empresa_atual: string | null
  instagram: string | null
}

/** E-mail de aviso pra dona: tudo que ela pediu pra decidir rápido. */
export function montarEmailFicha(lead: LeadResumo, patch: Record<string, unknown>, adminUrl: string | null) {
  const p = patch
  const linhas: [string, unknown][] = [
    ["Nome", lead.nome],
    ["WhatsApp", lead.telefone],
    ["Cidade", lead.cidade],
    ["Idade", lead.idade],
    ["Profissão", lead.profissao],
    ["Onde trabalha", lead.empresa_atual],
    ["Horário de trabalho", p.trabalho_horario],
    ["Instagram pessoal", lead.instagram],
    ["Instagram profissional", p.instagram_profissional],
    ["Casa", CASA_LABEL[String(p.casa_propria)]],
    ["Filhos", p.filhos_quantidade],
    ["Casada / companheiro", p.tem_conjuge ? "Sim" : "Não"],
    ["Nome do companheiro", p.conjuge_nome],
    ["Onde ele trabalha", p.conjuge_trabalho_local],
    ["Restrição no CPF", CPF_LABEL[String(p.restricao_cpf)]],
  ]
  const tabela = linhas
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">${esc(k)}</td><td style="padding:4px 0;"><strong>${esc(v)}</strong></td></tr>`,
    )
    .join("")
  const link = adminUrl
    ? `<p><a href="${esc(adminUrl)}" style="background:#C6A664;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Abrir no painel</a></p>`
    : ""
  const primeiroNome = lead.nome.split(" ")[0]
  return {
    subject: `Nova ficha: ${primeiroNome}${lead.cidade ? ` (${lead.cidade})` : ""} — ${BRAND.nome}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c1c;">
<h2 style="color:#8a6d3b;">Nova ficha recebida 🌸</h2>
<p>${esc(primeiroNome)} completou o cadastro e enviou os documentos. Falta só a sua decisão, ${esc(BRAND.dona)}.</p>
<table>${tabela}</table>
${link}
<p style="color:#6b6b6b;font-size:12px;">Enviado automaticamente pelo sistema de recrutamento da ${esc(BRAND.nome)}.</p>
</div>`,
  }
}
