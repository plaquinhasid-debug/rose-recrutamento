import { BRAND } from "@tania-joias/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Json, NaturalConversationModeValue } from "@tania-joias/shared"

import { supabase } from "@/lib/supabase"
import type { CidadesAtendidasValue } from "@/types"

const SETTING_KEY = "cidades_atendidas"

const DEFAULT_VALUE: CidadesAtendidasValue = { restringir: false, lista: [] }

async function fetchCidadesAtendidas(): Promise<CidadesAtendidasValue> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SETTING_KEY)
    .maybeSingle()

  if (error) throw error
  if (!data?.valor) return DEFAULT_VALUE

  const valor = data.valor as Partial<CidadesAtendidasValue>
  return {
    restringir: Boolean(valor.restringir),
    lista: Array.isArray(valor.lista) ? valor.lista : [],
  }
}

export function useCidadesAtendidas() {
  return useQuery({
    queryKey: ["settings", SETTING_KEY],
    queryFn: fetchCidadesAtendidas,
    staleTime: 30_000,
  })
}

export function useSaveCidadesAtendidas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (value: CidadesAtendidasValue) => {
      const { error } = await supabase
        .from("settings")
        .upsert(
          {
            chave: SETTING_KEY,
            valor: value as unknown as Json,
            descricao: "Cidades atendidas pela revenda",
          },
          { onConflict: "chave" },
        )
      if (error) throw error
      return value
    },
    onSuccess: (value) => {
      queryClient.setQueryData(["settings", SETTING_KEY], value)
    },
  })
}

const SOFIA_IA_ATIVA_KEY = "sofia_ia_ativa"

async function fetchSofiaIaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SOFIA_IA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useSofiaIaAtiva() {
  return useQuery({
    queryKey: ["settings", SOFIA_IA_ATIVA_KEY],
    queryFn: fetchSofiaIaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveSofiaIaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: SOFIA_IA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            "Liga/desliga as camadas de IA (Claude) da Sofia: análise final expandida e reações contextuais na conversa. Quando desativado, comportamento idêntico ao roteiro fixo + resumo simples.",
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", SOFIA_IA_ATIVA_KEY], ativa)
    },
  })
}

const SOFIA_PERGUNTAS_IA_ATIVA_KEY = "sofia_perguntas_ia_ativa"

async function fetchSofiaPerguntasIaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SOFIA_PERGUNTAS_IA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useSofiaPerguntasIaAtiva() {
  return useQuery({
    queryKey: ["settings", SOFIA_PERGUNTAS_IA_ATIVA_KEY],
    queryFn: fetchSofiaPerguntasIaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveSofiaPerguntasIaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: SOFIA_PERGUNTAS_IA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            "Liga/desliga a Sofia respondendo perguntas de negócio reais da candidata (via IA + base de conhecimento) durante a conversa (FEATURE-004). Quando desativado, comportamento idêntico ao roteiro fixo de hoje.",
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", SOFIA_PERGUNTAS_IA_ATIVA_KEY], ativa)
    },
  })
}

const SOFIA_CONDUCAO_NATURAL_KEY = "sofia_conducao_natural"

/**
 * OFF, SHADOW e ACTIVE podem ser salvos pelo Admin. ACTIVE liga só a parte
 * DETERMINÍSTICA da condução natural (reconhecimentos curtos e fixos antes
 * de nome/cidade/idade/whatsapp/Instagram, sem IA generativa nenhuma) — ver
 * `getDeterministicAcknowledgment` em
 * `apps/landing/src/orchestrator/naturalConversation/DeterministicReactionProvider.ts`.
 * As perguntas abertas (profissão, empresa, experiência, tempo disponível,
 * objetivo) continuam sem reação — isso depende de uma chamada real à
 * Anthropic que ainda não existe.
 */
export type SavableNaturalConversationMode = "OFF" | "SHADOW" | "ACTIVE"

async function fetchSofiaConducaoNatural(): Promise<NaturalConversationModeValue> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SOFIA_CONDUCAO_NATURAL_KEY)
    .maybeSingle()

  if (error) throw error
  const modo = (data?.valor as { modo?: unknown } | undefined)?.modo
  if (modo === "OFF" || modo === "SHADOW" || modo === "ACTIVE") return modo
  return "OFF"
}

export function useSofiaConducaoNatural() {
  return useQuery({
    queryKey: ["settings", SOFIA_CONDUCAO_NATURAL_KEY],
    queryFn: fetchSofiaConducaoNatural,
    staleTime: 30_000,
  })
}

export function useSaveSofiaConducaoNatural() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (modo: SavableNaturalConversationMode) => {
      if (modo !== "OFF" && modo !== "SHADOW" && modo !== "ACTIVE") {
        throw new Error(`Valor não permitido para sofia_conducao_natural: ${String(modo)}`)
      }
      const { error } = await supabase.from("settings").upsert(
        {
          chave: SOFIA_CONDUCAO_NATURAL_KEY,
          valor: { modo } as unknown as Json,
          descricao:
            'Controla o modo da "condução natural" da Sofia (FEATURE-005): OFF = comportamento atual, sem nenhuma mudança visível; SHADOW = classifica e observa em segundo plano, sem exibir nada pra candidata; ACTIVE = mostra reconhecimentos curtos e fixos (sem IA) antes de nome/cidade/idade/whatsapp/Instagram — perguntas abertas (profissão, objetivo etc.) continuam sem reação. Default OFF.',
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return modo
    },
    onSuccess: (modo) => {
      queryClient.setQueryData(["settings", SOFIA_CONDUCAO_NATURAL_KEY], modo)
    },
  })
}

const WHATSAPP_APROVACAO_AUTOMATICA_ATIVA_KEY = "whatsapp_aprovacao_automatica_ativa"

async function fetchWhatsappAprovacaoAutomaticaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", WHATSAPP_APROVACAO_AUTOMATICA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useWhatsappAprovacaoAutomaticaAtiva() {
  return useQuery({
    queryKey: ["settings", WHATSAPP_APROVACAO_AUTOMATICA_ATIVA_KEY],
    queryFn: fetchWhatsappAprovacaoAutomaticaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveWhatsappAprovacaoAutomaticaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: WHATSAPP_APROVACAO_AUTOMATICA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            "Liga/desliga o envio automático da mensagem de aprovação via WhatsApp Cloud API (API oficial da Meta) assim que uma candidata é aprovada (pela IPR ou manualmente pela equipe). Default false — só liga depois do cadastro na Meta estar concluído e testado.",
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", WHATSAPP_APROVACAO_AUTOMATICA_ATIVA_KEY], ativa)
    },
  })
}

const WHATSAPP_NOTIFICACAO_TANIA_ATIVA_KEY = "whatsapp_notificacao_tania_ativa"

async function fetchWhatsappNotificacaoTaniaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", WHATSAPP_NOTIFICACAO_TANIA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useWhatsappNotificacaoTaniaAtiva() {
  return useQuery({
    queryKey: ["settings", WHATSAPP_NOTIFICACAO_TANIA_ATIVA_KEY],
    queryFn: fetchWhatsappNotificacaoTaniaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveWhatsappNotificacaoTaniaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: WHATSAPP_NOTIFICACAO_TANIA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            `Liga/desliga o aviso automático pra ${BRAND.dona} via WhatsApp Cloud API (número oficial) assim que uma candidata preenche a Ficha de Aprovação. Se o envio falhar (ex.: fora da janela de 24h de atendimento), a lead fica em 'Confirmada' e o botão manual 'Enviar pra ${BRAND.dona}' continua disponível. Default false — só liga depois de testar.`,
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", WHATSAPP_NOTIFICACAO_TANIA_ATIVA_KEY], ativa)
    },
  })
}

const WHATSAPP_FICHA_AUTOMATICA_ATIVA_KEY = "whatsapp_ficha_automatica_ativa"

async function fetchWhatsappFichaAutomaticaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", WHATSAPP_FICHA_AUTOMATICA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useWhatsappFichaAutomaticaAtiva() {
  return useQuery({
    queryKey: ["settings", WHATSAPP_FICHA_AUTOMATICA_ATIVA_KEY],
    queryFn: fetchWhatsappFichaAutomaticaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveWhatsappFichaAutomaticaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: WHATSAPP_FICHA_AUTOMATICA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            'Controla se o link da Ficha de Aprovação é enviado automaticamente via WhatsApp Cloud API (modelo ficha_aprovacao_link) assim que é gerado, em vez do clique manual em "Mandar pelo WhatsApp". Default false — só liga depois de testar com um número real.',
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", WHATSAPP_FICHA_AUTOMATICA_ATIVA_KEY], ativa)
    },
  })
}

const WHATSAPP_LEMBRETE_FICHA_AUTOMATICO_ATIVA_KEY = "whatsapp_lembrete_ficha_automatico_ativa"

async function fetchWhatsappLembreteFichaAutomaticoAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", WHATSAPP_LEMBRETE_FICHA_AUTOMATICO_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useWhatsappLembreteFichaAutomaticoAtiva() {
  return useQuery({
    queryKey: ["settings", WHATSAPP_LEMBRETE_FICHA_AUTOMATICO_ATIVA_KEY],
    queryFn: fetchWhatsappLembreteFichaAutomaticoAtiva,
    staleTime: 30_000,
  })
}

const TANIA_WHATSAPP_NUMERO_KEY = "tania_whatsapp_numero"

/**
 * IMPLEMENTATION-CRM-004B — número de WhatsApp da Tania, lido diretamente do
 * browser (RLS `authenticated`, mesmo padrão de toda outra setting já lida
 * assim nesta página — nunca um dado secreto, é só o destino de um link
 * `wa.me`). Fonte de verdade única: `settings.tania_whatsapp_numero`.
 * Devolve `null` se a linha não existir (nunca lança) — o chamador decide
 * como degradar (ex.: desabilitar o botão que precisa do número).
 */
async function fetchTaniaWhatsappNumero(): Promise<string | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", TANIA_WHATSAPP_NUMERO_KEY)
    .maybeSingle()

  if (error) throw error
  const numero = (data?.valor as { numero?: unknown } | undefined)?.numero
  return typeof numero === "string" && numero.trim() ? numero.trim() : null
}

export function useTaniaWhatsappNumero() {
  return useQuery({
    queryKey: ["settings", TANIA_WHATSAPP_NUMERO_KEY],
    queryFn: fetchTaniaWhatsappNumero,
    staleTime: 30_000,
  })
}

export function useSaveWhatsappLembreteFichaAutomaticoAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: WHATSAPP_LEMBRETE_FICHA_AUTOMATICO_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            'Controla se o lembrete da Ficha de Aprovação (reenvio do link, mesmo modelo ficha_aprovacao_link) é enviado automaticamente 1x via pg_cron, para quem está há mais de 2 dias sem preencher. Default false — só liga depois de testar.',
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", WHATSAPP_LEMBRETE_FICHA_AUTOMATICO_ATIVA_KEY], ativa)
    },
  })
}
