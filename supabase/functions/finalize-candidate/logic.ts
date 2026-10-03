import { BRAND } from "../_shared/brand.ts"
// Lógica pura (sem I/O) de `finalize-candidate` — motor determinístico do
// IPR e dos gates de elegibilidade. Extraído de `index.ts` (RFC-INTELLIGENCE-006)
// só para permitir testar essas funções puras via `finalize-candidate.examples.ts`
// sem importar `index.ts` inteiro (que chama `Deno.serve` no escopo do módulo —
// importar isso subiria um servidor HTTP como efeito colateral do teste).
// `index.ts` continua sendo o único ponto de I/O (Supabase, Anthropic, Meta,
// WhatsApp) — nenhum comportamento externo muda com esta extração.

// Rose: perfis preferidos da Carol (questionário, item 14) — professoras,
// enfermeiras, quem trabalha em escola/hospital/clínica e área da beleza
// (cabeleireira, esteticista). Somam o peso `profissao_preferida` no IPR.
export const PROFISSOES_PREFERIDAS = [
  "Professora",
  "Enfermeira / Técnica de enfermagem",
  "Trabalho em clínica ou hospital",
  "Cabeleireira",
  "Esteticista",
]

// Palavras-chave (sem acento, minúsculas) procuradas na profissão E no local
// de trabalho. Lista conservadora: só o que a Carol citou.
const PALAVRAS_PROFISSAO_PREFERIDA = [
  "professor",
  "docente",
  "pedagog",
  "educador",
  "escola",
  "colegio",
  "creche",
  "enferm",
  "hospital",
  "clinica",
  "upa",
  "ubs",
  "posto de saude",
  "cabelei",
  "salao",
  "estetic",
]

function normalizarTexto(v: string | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** `true` quando profissão ou local de trabalho batem com os perfis preferidos da Carol. */
export function isProfissaoPreferida(profissao: string | undefined, empresaAtual: string | undefined): boolean {
  const texto = `${normalizarTexto(profissao)} ${normalizarTexto(empresaAtual)}`
  return PALAVRAS_PROFISSAO_PREFERIDA.some((p) => texto.includes(p))
}

// RFC-INTELLIGENCE-006 — verdade publicada: 18 anos completos. Idade é gate
// de elegibilidade, nunca pontuação (não existe em `IprPesos`/`settings.ipr_pesos`).
export const IDADE_MINIMA = 18

export type Payload = {
  session_id: string
  nome: string
  telefone: string
  cidade?: string
  idade?: number
  trabalha: boolean
  empresa_atual?: string
  profissao?: string
  estabilidade_profissional?: string
  experiencia_vendas?: boolean
  instagram?: string | null
  whatsapp?: boolean
  tempo_disponivel?: string
  objetivo?: string
  origem?: string
  campanha?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  fbp?: string
  fbc?: string
  fbclid?: string
  // IMPLEMENTATION-EMBAIXADORAS-E2.8 — código público de indicação
  // (embaixadoras.codigo_referral), nunca um UUID interno. Resolvido
  // server-side em index.ts, nunca usado aqui (logic.ts é o motor de
  // IPR/status, alheio a Embaixadoras de propósito).
  ref?: string
}

export type IprPesos = {
  trabalha: number
  experiencia_vendas: number
  whatsapp: number
  instagram: number
  cidade_atendida: number
  /** Rose: bônus pros perfis preferidos. Ausente no banco = 0. */
  profissao_preferida?: number
}

export type IprThresholds = { aprovar: number; analise_min: number }

export type CidadesAtendidas = { restringir: boolean; lista: string[] }

export type SofiaIaAtiva = { ativa: boolean }

export type WhatsappAprovacaoAutomaticaAtiva = { ativa: boolean }
export type WhatsappFichaAutomaticaAtiva = { ativa: boolean }

/**
 * RFC-INTELLIGENCE-007 — normalização CONSERVADORA de nome de cidade.
 * Único objetivo: reconhecer variações inequívocas de escrita da MESMA
 * cidade (maiúscula/minúscula, acento, espaços repetidos, vírgula/hífen
 * antes da UF, sufixo "SP"/"São Paulo"). NUNCA aproxima nomes de cidades
 * diferentes entre si — não há distância de edição, não há similaridade,
 * só transformações determinísticas e reversíveis de formatação. Depois
 * dessas transformações, o match continua sendo por IGUALDADE EXATA de
 * string (ver `isCidadeAtendida` abaixo) — é isso que garante que "São
 * Bernardo do Campo" nunca vira "São Caetano do Sul": são strings
 * diferentes antes e depois da normalização, então nunca batem entre si.
 *
 * Caso real que motivou isto: a lead `Paulicéia do nascimento` tem
 * `cidade = "Santo André São Paulo"` no banco — não batia com "Santo André"
 * da lista antes desta correção. Não corrigido retroativamente (RFC-007,
 * decisão do dono) — só vale para candidaturas novas a partir de agora.
 */
export function normalizarCidade(bruto: string): string {
  const semAcento = bruto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  // Vírgula e hífen usados como separador entre cidade e UF (ex.: "Santo
  // André, SP" / "Santo André - SP") viram espaço, depois espaços repetidos
  // colapsam num só.
  const espacosUnicos = semAcento.replace(/[,-]/g, " ").replace(/\s+/g, " ").trim()
  // Sufixo de UF inequívoco (só no FINAL da string, como palavra isolada
  // precedida por espaço — nunca no meio do nome, nunca sem espaço antes).
  // "sp"/"sao paulo" sozinho (sem nada antes) não é afetado por este passo
  // (não há `\s+` antes do início da string), então "São Paulo" digitado
  // como cidade continua "sao paulo" e não bate com nenhuma das 5 cidades.
  return espacosUnicos.replace(/\s+(sp|sao paulo)$/, "").trim()
}

export function isCidadeAtendida(cidade: string | undefined, config: CidadesAtendidas): boolean {
  if (!config.restringir) return true
  if (!cidade) return false
  const alvo = normalizarCidade(cidade)
  if (!alvo) return false
  return config.lista.some((c) => normalizarCidade(c) === alvo)
}

/**
 * RFC-INTELLIGENCE-006 — gate de idade. Nunca participa da soma de pontos do
 * IPR, só decide elegibilidade (mesmo espírito de `trabalha`). Idade
 * ausente/nula ou não-inteira é tratada como NÃO elegível — fail-closed:
 * sem confirmação de idade, nunca assume que a candidata tem 18+.
 */
export function isIdadeElegivel(idade: number | undefined): boolean {
  if (idade === undefined || idade === null) return false
  if (!Number.isInteger(idade)) return false
  return idade >= IDADE_MINIMA
}

/**
 * RFC-INTELLIGENCE-006 — elegibilidade combinada (Abordagem A da RFC-006):
 * `trabalha`, idade e WhatsApp são gates fora da soma de pontos do IPR.
 * `elegivel=false` reprova incondicionalmente, independente do IPR.
 * Ordem de checagem (trabalha -> idade -> whatsapp) só importa para
 * `gerarResumo` decidir qual motivo relatar primeiro quando mais de um gate
 * falha ao mesmo tempo — não afeta o resultado de `elegivel` em si.
 */
export function calcularElegibilidade(payload: Payload): {
  elegivel: boolean
  idadeElegivel: boolean
} {
  const idadeElegivel = isIdadeElegivel(payload.idade)
  const elegivel = payload.trabalha === true && idadeElegivel && payload.whatsapp === true
  return { elegivel, idadeElegivel }
}

export function calcularIpr(payload: Payload, pesos: IprPesos, cidadeAtendida: boolean, elegivel: boolean) {
  if (!elegivel) {
    const zerado = {
      trabalha: 0,
      experiencia_vendas: 0,
      whatsapp: 0,
      instagram: 0,
      cidade_atendida: 0,
      profissao_preferida: 0,
    }
    return { total: 0, breakdown: zerado }
  }
  const breakdown = {
    trabalha: pesos.trabalha,
    experiencia_vendas: payload.experiencia_vendas ? pesos.experiencia_vendas : 0,
    whatsapp: payload.whatsapp ? pesos.whatsapp : 0,
    instagram: payload.instagram ? pesos.instagram : 0,
    cidade_atendida: cidadeAtendida ? pesos.cidade_atendida : 0,
    profissao_preferida: isProfissaoPreferida(payload.profissao, payload.empresa_atual)
      ? (pesos.profissao_preferida ?? 0)
      : 0,
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return { total, breakdown }
}

export function decidirStatus(
  elegivel: boolean,
  ipr: number,
  thresholds: IprThresholds,
  temInstagram = true,
) {
  if (!elegivel) return "reprovada" as const
  // Rose: Instagram é obrigatório (questionário, item 23). Sem ele a candidata
  // nunca é pré-aprovada automaticamente — fica "em análise" pra Carol decidir.
  if (ipr >= thresholds.aprovar) return temInstagram ? ("aprovada" as const) : ("em_analise" as const)
  if (ipr >= thresholds.analise_min) return "em_analise" as const
  return "reprovada" as const
}

export function classificarPerfil(elegivel: boolean, ipr: number, thresholds: IprThresholds) {
  if (!elegivel) return { perfil: null as null, motivo: "" }
  if (ipr >= thresholds.aprovar) {
    return {
      perfil: "alto" as const,
      motivo:
        "Reúne trabalho atual, experiência comercial e os canais de contato ideais (WhatsApp/Instagram) para revender com autonomia.",
    }
  }
  if (ipr >= thresholds.analise_min) {
    return {
      perfil: "medio" as const,
      motivo:
        "Já trabalha e mostra bom potencial comercial, mas falta algum diferencial (experiência em vendas, Instagram ou atendimento na cidade).",
    }
  }
  return {
    perfil: "baixo" as const,
    motivo:
      "Está trabalhando, porém ainda não reúne os diferenciais comerciais (experiência em vendas, Instagram, cidade atendida) que indicam alto potencial imediato.",
  }
}

// QUALIFICACAO-002, Parte 1 — normaliza o texto bruto do chip escolhido pra
// uma das 3 categorias controladas. Match exato (após trim), incluindo o
// fallback de texto livre do ChipsAnswerInput: se a candidata digitar algo
// que não bate com nenhuma das 3 opções, ou o campo não vier, o resultado é
// `null` — não inventamos classificação, nem aqui nem em leads antigos.
// PROIBIDO participar de calcularIpr/decidirStatus/classificarPerfil (ver
// QUALIFICACAO-002-estabilidade-trabalho.md).
export type EstabilidadeProfissional = "ALTA" | "MEDIA" | "BAIXA"

export function mapEstabilidadeProfissional(raw: string | undefined): EstabilidadeProfissional | null {
  switch (raw?.trim()) {
    case "Fixa — mesma empresa/local, mesma escala":
      return "ALTA"
    case "Variável, mas recorrente":
      return "MEDIA"
    case "Esporádica, sem muita regularidade":
      return "BAIXA"
    default:
      return null
  }
}

export function gerarResumo(
  payload: Payload,
  idadeElegivel: boolean,
  perfil: "baixo" | "medio" | "alto" | null,
) {
  const primeiroNome = payload.nome.split(" ")[0]
  if (!payload.trabalha) {
    return `${primeiroNome} respondeu que não está trabalhando atualmente. Cadastro salvo para futuras oportunidades da ${BRAND.nome}.`
  }
  if (!idadeElegivel) {
    return `${primeiroNome} informou ${payload.idade ?? "idade não informada"} — abaixo da idade mínima de ${IDADE_MINIMA} anos. Cadastro salvo para futuras oportunidades.`
  }
  if (!payload.whatsapp) {
    return `${primeiroNome} trabalha, mas informou não ter WhatsApp no telefone cadastrado — canal de contato obrigatório não confirmado. Cadastro salvo para futuras oportunidades.`
  }
  const partes: string[] = [`${primeiroNome} trabalha como ${payload.profissao || "profissional"}.`]
  if (payload.experiencia_vendas) {
    partes.push("Possui experiência com vendas.")
  }
  partes.push("Busca renda extra revendendo semijoias.")
  if (payload.objetivo) {
    partes.push(`Motivação relatada: "${payload.objetivo}".`)
  }
  if (perfil) {
    partes.push(`Possui perfil comercial ${perfil}.`)
  }
  return partes.join(" ")
}
