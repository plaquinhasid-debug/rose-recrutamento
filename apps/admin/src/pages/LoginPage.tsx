import { BRAND } from "@tania-joias/shared"
import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Loader2, Lock, Mail } from "lucide-react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resolveLoginNavigationTarget, resolveRoleAfterLogin } from "@/lib/roleResolution"
// Rose: sem programa de Embaixadoras — só a equipe entra no painel.
const fetchMinhaEmbaixadora = async (): Promise<{ status: string } | null> => null

// IMPLEMENTATION-EMBAIXADORAS-E2.2-D.0-B — `message` é opcional e só existe
// quando um dos dois guards (equipe OU Embaixadora) redireciona pra cá
// depois de um signOut forçado. Nunca confundir com erro de credenciais.
interface LoginLocationState {
  from?: Location
  message?: string
}

// Mesmo cast/motivo de hooks/useIsEquipe.ts: `is_equipe()` já existe de
// verdade no banco, mas `packages/shared/src/database.types.ts` não lista
// `Functions` (desatualizado desde antes dessas RPCs existirem). Cast local
// só nesta chamada.
const untypedSupabase = supabase as unknown as SupabaseClient

async function checkIsEquipe(): Promise<boolean> {
  const { data, error } = await untypedSupabase.rpc("is_equipe")
  if (error) throw error
  if (typeof data !== "boolean") throw new Error("is_equipe() retornou um valor inesperado (esperava boolean)")
  return data
}

export default function LoginPage() {
  const { session, loading, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  // Inicializado com `location.state.message` quando existir (ex.: "Acesso
  // não autorizado." vindo de um dos guards) — reaproveita o mesmo bloco
  // visual de erro já existente, nunca um componente/estado paralelo. Como
  // routeSessionByRole já faz `setError(null)`/`setError(...)` de forma
  // explícita em cada caminho, essa mensagem nunca sobrevive a um novo
  // submit nem se mistura com um erro de credenciais subsequente.
  const [error, setError] = React.useState<string | null>(
    () => (location.state as LoginLocationState | null)?.message ?? null,
  )
  const [submitting, setSubmitting] = React.useState(false)
  // `true` enquanto resolvemos o papel (equipe/Embaixadora/nenhum) de uma
  // sessão já existente — cobre tanto "acabou de logar" quanto "abriu
  // /login já autenticada" (ver useEffect abaixo). Nome deliberadamente
  // distinto de `submitting` (que é só o POST de signInWithPassword).
  const [resolvingRole, setResolvingRole] = React.useState(false)
  // Evita disparar a resolução de papel mais de uma vez pro mesmo objeto de
  // sessão (StrictMode/re-render) — resetado explicitamente nos caminhos de
  // falha/"none" abaixo, pra uma nova tentativa de login (nova sessão)
  // poder rodar de novo.
  const resolvedRef = React.useRef(false)

  // IMPLEMENTATION-EMBAIXADORAS-E2.7-B — ÚNICO ponto de decisão de destino
  // pós-login, usado tanto por um login novo (handleSubmit -> signIn ->
  // session muda -> este efeito dispara) quanto por uma sessão já existente
  // ao abrir /login diretamente (mesmo efeito, mesmo caminho — nunca um
  // <Navigate> síncrono separado que assumiria "equipe" por fallback, como
  // a versão anterior desta página fazia).
  React.useEffect(() => {
    if (loading || !session || resolvedRef.current) return
    resolvedRef.current = true
    setResolvingRole(true)
    void routeSessionByRole()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session])

  async function routeSessionByRole() {
    let role: Awaited<ReturnType<typeof resolveRoleAfterLogin>>
    try {
      role = await resolveRoleAfterLogin({ checkIsEquipe, fetchMinhaEmbaixadora })
    } catch {
      resolvedRef.current = false
      setResolvingRole(false)
      await signOut()
      setError("Não foi possível confirmar seu acesso. Tente novamente.")
      return
    }

    const from = (location.state as LoginLocationState | null)?.from
    const target = resolveLoginNavigationTarget(role, from)
    if (target) {
      navigate(target, { replace: true })
      return
    }

    // role === "none": autenticado de verdade, mas nem equipe nem
    // Embaixadora ativa — nunca monta nenhuma rota protegida, nunca
    // "cai" pra um dos dois papéis por ausência do outro.
    resolvedRef.current = false
    setResolvingRole(false)
    await signOut()
    setError("Acesso não autorizado.")
  }

  if (resolvingRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-gold" />
      </div>
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError(
        signInError === "Invalid login credentials"
          ? "E-mail ou senha inválidos."
          : signInError,
      )
      return
    }
    // Sucesso: `session` muda via onAuthStateChange -> o useEffect acima
    // assume a partir daqui (checa papel, decide destino). Nenhum
    // navigate() direto aqui — nunca presume "equipe" antes de checar.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-medium tracking-tight text-foreground">
            {BRAND.nome}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Painel administrativo — acesso da equipe
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" variant="gold" size="lg" disabled={submitting} className="mt-2">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Contas são criadas manualmente pela equipe. Sem cadastro público.
        </p>
      </div>
    </div>
  )
}
