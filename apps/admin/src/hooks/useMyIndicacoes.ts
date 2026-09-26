// IMPLEMENTATION-EMBAIXADORAS-E2.9 — hook React do card "Minhas indicações"
// do Portal. A lógica pura (fetch/parse) mora em `@/lib/myIndicacoes.ts`
// (sem dependência de AuthContext/.tsx, testável isolada) — este arquivo só
// conecta essa lógica ao React Query + à sessão atual, mesmo padrão de
// `hooks/useMyEmbaixadora.ts`.
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/context/AuthContext"
import { fetchMinhasIndicacoes } from "@/lib/myIndicacoes"

export type { IndicacaoItem, MinhasIndicacoes, RecompensaSituacao, SituacaoIndicacao } from "@/lib/myIndicacoes"

/**
 * `queryKey` inclui `session.user.id` — mesmo padrão de useMyEmbaixadora.ts.
 * `staleTime` curto: uma nova indicação pode chegar a qualquer momento
 * (candidata se cadastrando pelo link), então não faz sentido cachear por
 * muito tempo nem usar `Infinity`.
 */
export function useMyIndicacoes() {
  const { session } = useAuth()

  return useQuery({
    queryKey: ["auth", "my-indicacoes", session?.user?.id],
    queryFn: () => fetchMinhasIndicacoes(),
    enabled: !!session,
    staleTime: 30_000,
    retry: 1,
  })
}
