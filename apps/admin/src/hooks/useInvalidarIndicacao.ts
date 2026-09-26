// IMPLEMENTATION-EMBAIXADORAS-E3.5 — invalidar indicação (teste, fraude).
// Sempre via a Edge Function `invalidate-indicacao` (is_equipe no
// servidor). O cliente envia só o id da indicação e o motivo.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { InvalidarIndicacaoError, invalidarErrorMessage } from "../lib/invalidarIndicacao"

type FunctionsInvoke = typeof supabase.functions.invoke

export interface InvalidarIndicacaoInput {
  indicacaoId: string
  motivo: string
}

async function toInvalidarError(error: unknown): Promise<InvalidarIndicacaoError> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    let code: string | undefined
    try {
      const body: unknown = await error.context.clone().json()
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        code = (body as { error: string }).error
      }
    } catch { /* sem JSON: mensagem genérica */ }
    return new InvalidarIndicacaoError(invalidarErrorMessage(code))
  }
  return new InvalidarIndicacaoError(invalidarErrorMessage(undefined))
}

export async function invalidarIndicacao(
  input: InvalidarIndicacaoInput,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<void> {
  const body = { indicacao_id: input.indicacaoId, motivo: input.motivo }
  let response: Awaited<ReturnType<FunctionsInvoke>>
  try {
    response = await invoke<unknown>("invalidate-indicacao", { method: "POST", body })
  } catch (error) {
    throw await toInvalidarError(error)
  }
  if (response.error) throw await toInvalidarError(response.error)
}

export function useInvalidarIndicacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InvalidarIndicacaoInput) => invalidarIndicacao(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["indicacoes-admin"] }).catch(() => {})
    },
    retry: false,
  })
}
