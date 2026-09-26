// IMPLEMENTATION-EMBAIXADORAS-E3.2 — confirmar entrega do primeiro
// mostruário (cria a recompensa de R$40 a pagar). Sempre via a Edge
// Function `confirm-primeiro-mostruario` (is_equipe no servidor). O cliente
// envia só o id da indicação e a data — nunca valor nem status.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { ConfirmMostruarioError, confirmMostruarioErrorMessage } from "../lib/confirmMostruario"

type FunctionsInvoke = typeof supabase.functions.invoke

export interface ConfirmMostruarioInput {
  indicacaoId: string
  dataEntrega: string
}

async function toConfirmError(error: unknown): Promise<ConfirmMostruarioError> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    let code: string | undefined
    try {
      const body: unknown = await error.context.clone().json()
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        code = (body as { error: string }).error
      }
    } catch { /* sem JSON: mensagem genérica */ }
    return new ConfirmMostruarioError(confirmMostruarioErrorMessage(code))
  }
  return new ConfirmMostruarioError(confirmMostruarioErrorMessage(undefined))
}

export async function confirmPrimeiroMostruario(
  input: ConfirmMostruarioInput,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<void> {
  const body = { indicacao_id: input.indicacaoId, data_entrega: input.dataEntrega }
  let response: Awaited<ReturnType<FunctionsInvoke>>
  try {
    response = await invoke<unknown>("confirm-primeiro-mostruario", { method: "POST", body })
  } catch (error) {
    throw await toConfirmError(error)
  }
  if (response.error) throw await toConfirmError(response.error)
}

export function useConfirmPrimeiroMostruario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConfirmMostruarioInput) => confirmPrimeiroMostruario(input),
    onSettled: () => {
      // Sucesso OU erro (ex.: "ja_confirmada"): recarrega a lista pra
      // refletir o estado real do banco.
      void queryClient.invalidateQueries({ queryKey: ["indicacoes-admin"] }).catch(() => {})
    },
    retry: false,
  })
}
