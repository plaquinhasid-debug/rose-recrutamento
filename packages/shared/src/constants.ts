import { BRAND } from "./brand"
import type { Enums } from "./database.types"

export type LeadStatus = Enums<"lead_status">
export type PerfilComercial = Enums<"perfil_comercial_enum">
export type Recomendacao = Enums<"recomendacao_enum">
export type EventoFunil = Enums<"evento_funil">
export type EtapaPosAprovacao = Enums<"etapa_pos_aprovacao_enum">

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo Lead",
  em_analise: "Em Análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
}

export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  novo: "#6B6B6B",
  em_analise: "#C6A664",
  aprovada: "#1F8A4C",
  reprovada: "#B3261E",
}

// Etapas do funil DEPOIS de uma lead ser aprovada (Kanban do Admin). Só têm
// sentido quando `status = 'aprovada'` — nunca participam de
// calcularIpr/decidirStatus/classificarPerfil nem do evento Meta Lead (ver
// supabase/functions/finalize-candidate/index.ts). Controle manual da
// equipe, adicional ao `status` que já existia.
// IMPLEMENTATION-CRM-002A — "contatada" NÃO significa "WhatsApp entregue"
// nem sequer "enviado": é gravado no momento em que a Ficha é GERADA
// (`generateFichaLink`), automaticamente ou pelo botão manual — antes de
// qualquer tentativa de envio. O rótulo antigo ("Ficha enviada") prometia
// mais do que o dado garante (ver IMPLEMENTATION-INTELLIGENCE-015A/CRM-002).
// O status real de entrega (aceita/enviada/entregue/lida/falhou) vem de
// `whatsapp_messages`, exibido à parte no card — não deste rótulo.
export const ETAPA_POS_APROVACAO_LABEL: Record<EtapaPosAprovacao, string> = {
  contatada: "Contato manual / Ficha pendente",
  confirmada: "Confirmada",
  aguardando_tania: `Aguardando aprovação da ${BRAND.dona}`,
  ativa: "Ativa",
  desistiu: "Desistiu",
}

export const ETAPA_POS_APROVACAO_COLOR: Record<EtapaPosAprovacao, string> = {
  contatada: "#97C459",
  confirmada: "#639922",
  aguardando_tania: "#C6A664",
  ativa: "#3B6D11",
  desistiu: "#D85A30",
}

export const PERFIL_COMERCIAL_LABEL: Record<PerfilComercial, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
}

// Campos consultivos da análise expandida da Sofia (ver `ai_analysis` /
// `supabase/functions/_shared/ai-analysis.ts`). Colunas `text` com CHECK
// constraint no banco, não enums do Postgres — por isso os tipos e labels
// vivem aqui como união literal, no mesmo espírito de PERFIL_COMERCIAL_LABEL.
export type PerfilSugeridoIa = "baixo" | "medio" | "alto" | "excelente"
export type PotencialEmpreendedor = "baixo" | "medio" | "alto" | "muito_alto"
export type ProximaAcao = "ligar_imediatamente" | "enviar_whatsapp" | "analise_manual" | "aguardar"
export type Sentimento = "muito_motivada" | "motivada" | "neutra" | "insegura" | "desmotivada"
export type MotivacaoPrincipal =
  | "renda_extra"
  | "independencia_financeira"
  | "sonho_pessoal"
  | "flexibilidade"
  | "empreender"
  | "outro"

export const PERFIL_SUGERIDO_IA_LABEL: Record<PerfilSugeridoIa, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  excelente: "Excelente",
}

export const POTENCIAL_EMPREENDEDOR_LABEL: Record<PotencialEmpreendedor, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  muito_alto: "Muito alto",
}

export const PROXIMA_ACAO_LABEL: Record<ProximaAcao, string> = {
  ligar_imediatamente: "Ligar imediatamente",
  enviar_whatsapp: "Enviar WhatsApp",
  analise_manual: "Análise manual",
  aguardar: "Aguardar",
}

export const SENTIMENTO_LABEL: Record<Sentimento, string> = {
  muito_motivada: "Muito motivada",
  motivada: "Motivada",
  neutra: "Neutra",
  insegura: "Insegura",
  desmotivada: "Desmotivada",
}

export const MOTIVACAO_PRINCIPAL_LABEL: Record<MotivacaoPrincipal, string> = {
  renda_extra: "Renda extra",
  independencia_financeira: "Independência financeira",
  sonho_pessoal: "Sonho pessoal",
  flexibilidade: "Flexibilidade",
  empreender: "Empreender",
  outro: "Outro",
}

// Kanban do Admin — pipeline único que vai de "Novo Lead" até "Ativa",
// combinando as 4 colunas originais (ligadas a `lead_status`) com as 4 novas
// etapas pós-aprovação (ligadas a `etapa_pos_aprovacao`). `key` é usado como
// id da coluna pro drag-and-drop; `pipelineColumnKeyForLead`/
// `patchForPipelineColumn` fazem a ponte entre esse id e os dois campos
// reais do banco.
export type PipelineColumnKey =
  | "novo"
  | "em_analise"
  | "aprovada"
  | "contatada"
  | "confirmada"
  | "aguardando_tania"
  | "ativa"
  | "desistiu"
  | "reprovada"

export interface PipelineColumn {
  key: PipelineColumnKey
  label: string
  color: string
  /**
   * Outras chaves reais que também caem visualmente nesta coluna (ver
   * `displayColumnKeyForLead`). Levantamento em produção (14/08) mostrou que
   * essas etapas nunca tiveram card algum e/ou só existem como um "piscar"
   * automático entre duas outras — juntar reduz o board de 9 pra 6 colunas
   * sem apagar o dado real: `pipelineColumnKeyForLead` continua devolvendo o
   * valor exato, só a exibição é que agrupa.
   */
  groupKeys?: PipelineColumnKey[]
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    key: "novo",
    label: "Novo Lead",
    color: LEAD_STATUS_COLOR.novo,
    groupKeys: ["em_analise"],
  },
  // IMPLEMENTATION-CRM-003A — rótulo só desta coluna do Kanban, não do status
  // real: `status='aprovada'` sem `etapa_pos_aprovacao` significa "passou na
  // 1ª qualificação, falta gerar a Ficha", não "processo concluído". O valor
  // interno do enum e `LEAD_STATUS_LABEL.aprovada` (badge, filtros) continuam
  // "Aprovada" — só a etiqueta do card muda, pra deixar a próxima ação óbvia.
  { key: "aprovada", label: "Pré-aprovada / Gerar ficha", color: LEAD_STATUS_COLOR.aprovada },
  // IMPLEMENTATION-CRM-005B — mesmo padrão da coluna "aprovada" acima: rótulo
  // só do Kanban, decolado de `ETAPA_POS_APROVACAO_LABEL.contatada` (que
  // continua "Contato manual / Ficha pendente" pra quem lê a etapa fora do
  // board, ex. `LeadDetailDrawer.tsx`). "Contato manual" deixou de descrever
  // bem essa coluna depois do botão rastreado (`useSendFichaWhatsapp`) — boa
  // parte dos casos aqui não é mais contato manual.
  { key: "contatada", label: "Ficha pendente", color: ETAPA_POS_APROVACAO_COLOR.contatada },
  {
    key: "confirmada",
    label: `Aguardando aprovação da ${BRAND.dona}`,
    color: ETAPA_POS_APROVACAO_COLOR.aguardando_tania,
    groupKeys: ["aguardando_tania"],
  },
  { key: "ativa", label: ETAPA_POS_APROVACAO_LABEL.ativa, color: ETAPA_POS_APROVACAO_COLOR.ativa },
  {
    key: "desistiu",
    label: "Não aprovada",
    color: ETAPA_POS_APROVACAO_COLOR.desistiu,
    groupKeys: ["reprovada"],
  },
]

/**
 * Rótulo extra pro card, só quando o estado real é mais específico que a
 * coluna visual onde ele foi agrupado (`groupKeys` acima) — assim a
 * informação não se perde, só sai da largura de uma coluna inteira.
 */
export const ETAPA_DETALHE_LABEL: Partial<Record<PipelineColumnKey, string>> = {
  em_analise: "Em análise pela Sofia",
  aguardando_tania: "Mensagem enviada, aguardando resposta",
  reprovada: "Reprovada pelo sistema",
}

interface LeadForPipeline {
  status: LeadStatus
  etapa_pos_aprovacao: EtapaPosAprovacao | null
}

/** Em qual etapa real (banco) uma lead está, combinando `status` + `etapa_pos_aprovacao`. */
export function pipelineColumnKeyForLead(lead: LeadForPipeline): PipelineColumnKey {
  if (lead.status === "aprovada") {
    return lead.etapa_pos_aprovacao ?? "aprovada"
  }
  return lead.status
}

/** Em qual coluna visual do Kanban uma lead cai, já aplicando os agrupamentos de `groupKeys`. */
export function displayColumnKeyForLead(lead: LeadForPipeline): PipelineColumnKey {
  const realKey = pipelineColumnKeyForLead(lead)
  const column = PIPELINE_COLUMNS.find(
    (col) => col.key === realKey || col.groupKeys?.includes(realKey),
  )
  return column?.key ?? realKey
}

/**
 * O que gravar no banco quando uma lead é arrastada para a coluna `key`.
 * `currentStatus` só importa pra coluna fundida "Não aprovada": se a lead já
 * tinha sido aprovada em algum momento, arrastar pra lá é "desistiu"; se
 * ainda não tinha passado da aprovação, é "reprovada" — nunca os dois juntos.
 */
export function patchForPipelineColumn(
  key: PipelineColumnKey,
  currentStatus?: LeadStatus,
): { status: LeadStatus; etapa_pos_aprovacao: EtapaPosAprovacao | null } {
  switch (key) {
    case "contatada":
    case "confirmada":
    case "aguardando_tania":
    case "ativa":
      return { status: "aprovada", etapa_pos_aprovacao: key }
    case "desistiu":
      return currentStatus === "aprovada"
        ? { status: "aprovada", etapa_pos_aprovacao: "desistiu" }
        : { status: "reprovada", etapa_pos_aprovacao: null }
    case "reprovada":
      return { status: "reprovada", etapa_pos_aprovacao: null }
    case "aprovada":
      return { status: "aprovada", etapa_pos_aprovacao: null }
    default:
      return { status: key, etapa_pos_aprovacao: null }
  }
}

export const RADAR_FUNIL_STEPS: { evento: EventoFunil; label: string }[] = [
  { evento: "ad_click", label: "Clicaram no anúncio" },
  { evento: "landing_view", label: "Abriram a Landing Page" },
  { evento: "chat_iniciado", label: "Iniciaram a conversa" },
  { evento: "respondeu_trabalha_sim", label: "Responderam que trabalham" },
  { evento: "aprovada", label: "Foram aprovadas" },
]

/**
 * Pesos fixos do IPR (Índice de Potencial da Revendedora).
 * Fonte da verdade real é a Edge Function `finalize-candidate` (roda server-side
 * com service role). Esta cópia serve só para exibir o breakdown no admin.
 */
export const IPR_PESOS = {
  trabalha: 40,
  experiencia_vendas: 15,
  whatsapp: 10,
  instagram: 10,
  cidade_atendida: 10,
  profissao_preferida: 15,
} as const

export const IPR_THRESHOLDS = {
  aprovar: 75,
  analiseMin: 55,
} as const
