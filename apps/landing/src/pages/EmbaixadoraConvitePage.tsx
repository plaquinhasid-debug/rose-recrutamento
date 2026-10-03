import { BRAND } from "@tania-joias/shared"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAmbassadorInviteToken } from "@/hooks/useAmbassadorInviteToken"
import {
  createSubmissionGuard,
  PASSWORD_MIN_LENGTH,
  redeemInvite,
  validateInvite,
  validatePasswordFields,
} from "@/lib/ambassadorInvite"

// EMBAIXADORAS TANIA JOIAS V1 — E2.5-E1. Página pública `/embaixadoras/
// convite` — o token real já foi capturado e removido da URL pelo script de
// bootstrap em index.html antes deste componente sequer montar (ver
// comentário lá e em useAmbassadorInviteToken.ts). Esta página nunca lê o
// token da URL, nunca grava em storage — só no estado React desta árvore.
//
// Ainda NÃO existe painel da Embaixadora (fora de escopo desta etapa) —
// por isso o estado de sucesso não faz login automático nem redireciona
// pra uma rota que ainda não existe.

type PageState =
  | { kind: "carregando" }
  | { kind: "invalido" }
  | { kind: "erro_validacao" }
  | { kind: "formulario"; nome: string; email: string; erro: string | null }
  | { kind: "criando"; nome: string; email: string }
  | { kind: "sucesso" }
  | { kind: "incerto" }

function Shell({ children }: React.PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 py-5 text-center">
        <span className="font-display text-lg font-semibold tracking-wide">{BRAND.nome}</span>
      </header>
      <main className="mx-auto max-w-xl px-6 py-10">{children}</main>
    </div>
  )
}

export function EmbaixadoraConvitePage() {
  const token = useAmbassadorInviteToken()
  const [state, setState] = useState<PageState>({ kind: "carregando" })
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const mounted = useRef(false)
  const guard = useRef(createSubmissionGuard()).current

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function runValidate(currentToken: string) {
    validateInvite(currentToken).then((result) => {
      if (!mounted.current) return
      if (result.kind === "valido") setState({ kind: "formulario", nome: result.nome, email: result.email, erro: null })
      else if (result.kind === "invalido") setState({ kind: "invalido" })
      else setState({ kind: "erro_validacao" })
    })
  }

  useEffect(() => {
    // Sem token (URL sanitizada aberta direto, F5, ou back/forward depois
    // da sanitização) — nunca tenta recuperar de storage, é deliberado por
    // segurança (ver pedido E2.5-E1 seções 16/17): mostra convite
    // indisponível direto, sem sequer chamar validate.
    if (!token) {
      setState({ kind: "invalido" })
      return
    }
    setState({ kind: "carregando" })

    // E2.5-E2.1 (achado BAIXO 3 da auditoria E2.5-E2) — mesma flag
    // `cancelled` que FichaPage.tsx já usa pro mesmo padrão (fetch dentro
    // de useEffect). Em desenvolvimento, o React StrictMode roda este
    // efeito 2x (mount -> cleanup -> mount), então `validateInvite(token)`
    // ainda dispara 2 chamadas de rede reais nesse modo — a correção NÃO
    // reduz isso a 1 chamada (deduplicar a chamada em si exigiria outro
    // mecanismo, fora de escopo desta microcorreção). O que a flag garante
    // é que só o resultado da execução vigente (a mais recente) chega a
    // atualizar o estado — o resultado da execução cancelada (a primeira,
    // já obsoleta) é descartado, nunca sobrescreve um estado mais novo.
    // Em produção (sem StrictMode) só existe uma única execução, sem
    // duplicidade nenhuma.
    let cancelled = false
    validateInvite(token).then((result) => {
      if (cancelled || !mounted.current) return
      if (result.kind === "valido") setState({ kind: "formulario", nome: result.nome, email: result.email, erro: null })
      else if (result.kind === "invalido") setState({ kind: "invalido" })
      else setState({ kind: "erro_validacao" })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.kind !== "formulario" || guard.isPending() || !token) return

    const validationError = validatePasswordFields(password, confirmPassword)
    if (validationError) {
      setState({ ...state, erro: validationError })
      return
    }

    const { nome, email } = state
    setState({ kind: "criando", nome, email })

    await guard.run(async () => {
      const result = await redeemInvite(token, password)
      if (!mounted.current) return

      // E2.5-E2.1 (achado BAIXO 2 da auditoria E2.5-E2) — "sucesso" e
      // "incerto" são estados TERMINAIS: nenhum dos dois volta a mostrar o
      // formulário nesta mesma sessão de página (sucesso segue direto pro
      // card de confirmação; incerto orienta contato com a Tania, nunca
      // reenvio automático). Como o componente não desmonta ao trocar de
      // estado, a senha em texto plano ficaria em memória React sem
      // necessidade nenhuma daqui em diante — por isso é limpa nos dois
      // casos. Nos outros resultados (senha_invalida/invalido/erro) o
      // formulário reaparece de propósito para a pessoa corrigir e
      // reenviar, então a senha é deliberadamente preservada — limpar ali
      // pioraria a UX sem nenhum ganho de segurança real (ela ainda
      // digitaria de novo no mesmo campo, na mesma sessão).
      if (result.kind === "sucesso") {
        setPassword("")
        setConfirmPassword("")
        setState({ kind: "sucesso" })
        return
      }
      if (result.kind === "incerto") {
        setPassword("")
        setConfirmPassword("")
        setState({ kind: "incerto" })
        return
      }
      const mensagem =
        result.kind === "senha_invalida"
          ? `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`
          : result.kind === "invalido"
            ? "Este convite não está disponível. Ele pode ter expirado ou já ter sido utilizado."
            : "Não foi possível concluir agora. Tente novamente."
      setState({ kind: "formulario", nome, email, erro: mensagem })
    })
  }

  if (state.kind === "carregando") {
    return (
      <Shell>
        <p className="text-center text-muted-foreground">Verificando convite...</p>
      </Shell>
    )
  }

  if (state.kind === "invalido") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Este convite não está disponível</CardTitle>
            <CardDescription>Ele pode ter expirado ou já ter sido utilizado.</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "erro_validacao") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Não deu pra verificar seu convite</CardTitle>
            <CardDescription>Confira sua internet e tente de novo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="gold" onClick={() => token && runValidate(token)}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "sucesso") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Cadastro concluído 🌸</CardTitle>
            <CardDescription>
              Seu acesso ao Programa Embaixadoras foi criado com sucesso. Em breve você poderá acessar seu
              painel de Embaixadora.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "incerto") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Não conseguimos confirmar</CardTitle>
            <CardDescription>
              Não foi possível confirmar se o cadastro foi concluído. Antes de tentar novamente, entre em
              contato com a {BRAND.nome}.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "criando") {
    return (
      <Shell>
        <p className="text-center text-muted-foreground" role="status">
          Criando acesso...
        </p>
      </Shell>
    )
  }

  // state.kind === "formulario"
  return (
    <Shell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">Convite para o Programa Embaixadoras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá, {state.nome}. Seu convite está pronto.
        </p>
      </div>
      <dl className="mb-6 space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Nome</dt>
          <dd className="font-medium">{state.nome}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-mail</dt>
          <dd className="font-medium">{state.email}</dd>
        </div>
      </dl>
      <p className="mb-4 text-sm text-muted-foreground">Crie uma senha para acessar sua conta de Embaixadora.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha *</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirmar senha *</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        {state.erro ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.erro}
          </p>
        ) : null}
        <Button type="submit" variant="gold" className="w-full">
          Criar acesso
        </Button>
      </form>
    </Shell>
  )
}
