// IMPLEMENTATION-EMBAIXADORAS-E3.3 — marcar a recompensa de R$40 como paga
// (Pix feito) ou cancelada. Sempre via a Edge Function
// `update-recompensa-status` (is_equipe no servidor). O cliente envia só o
// id da indicação, a ação e a data do Pix ou o motivo — nunca valor/status.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { RecompensaAcaoError, recompensaAcaoErrorMessage } from "../lib/recompensaAcao"

type FunctionsInvoke = typeof supabase.functions.invoke

export type RecompensaAcaoInput =
  | { acao: "pagar"; indicacaoId: string; dataPagamento: string }
  | { acao: "cancelar"; indicacaoId: string; motivo: string }

async function toAcaoError(error: unknown): Promise<RecompensaAcaoError> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    let code: string | undefined
    try {
      const body: unknown = await error.context.clone().json()
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        code = (body as { error: string }).error
      }
    } catch { /* sem JSON: mensagem genérica */ }
    return new RecompensaAcaoError(recompensaAcaoErrorMessage(code))
  }
  return new RecompensaAcaoError(recompensaAcaoErrorMessage(undefined))
}

export async function updateRecompensaStatus(
  input: RecompensaAcaoInput,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<void> {
  const body = input.acao === "pagar"
    ? { indicacao_id: input.indicacaoId, acao: "pagar", data_pagamento: input.dataPagamento }
    : { indicacao_id: input.indicacaoId, acao: "cancelar", motivo: input.motivo }
  let response: Awaited<ReturnType<FunctionsInvoke>>
  try {
    response = await invoke<unknown>("update-recompensa-status", { method: "POST", body })
  } catch (error) {
    throw await toAcaoError(error)
  }
  if (response.error) throw await toAcaoError(response.error)
}

export function useUpdateRecompensaStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecompensaAcaoInput) => updateRecompensaStatus(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["indicacoes-admin"] }).catch(() => {})
    },
    retry: false,
  })
}
