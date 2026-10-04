import { BRAND } from "@tania-joias/shared"
import { useEffect, useState } from "react"
import type { FichaAprovacaoPayload, GetFichaResponse } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { FichaForm, type DocumentosSelecionados } from "@/components/ficha/FichaForm"
import { getFicha, submitFicha, uploadDocumentosFicha } from "@/lib/api"

interface FichaPageProps {
  token: string
}

type PageState =
  | { kind: "carregando" }
  | { kind: "erro" }
  | { kind: "invalido" }
  | { kind: "ja_preenchida" }
  | { kind: "pendente"; nome: string }
  | { kind: "enviada" }

function Shell({ children }: React.PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 py-5 text-center">
        <span className="font-display text-lg font-semibold tracking-wide">{BRAND.nomeCurto}</span>
      </header>
      <main className="mx-auto max-w-xl px-6 py-10">{children}</main>
    </div>
  )
}

export function FichaPage({ token }: FichaPageProps) {
  const [state, setState] = useState<PageState>({ kind: "carregando" })

  useEffect(() => {
    let cancelled = false
    getFicha(token)
      .then((response: GetFichaResponse) => {
        if (cancelled) return
        if (response.status === "invalido") setState({ kind: "invalido" })
        else if (response.status === "preenchida") setState({ kind: "ja_preenchida" })
        else setState({ kind: "pendente", nome: response.nome })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "erro" })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(values: FichaAprovacaoPayload, documentosSelecionados: DocumentosSelecionados) {
    const documentos = await uploadDocumentosFicha(token, documentosSelecionados)
    await submitFicha(token, { ...values, documentos })
    setState({ kind: "enviada" })
  }

  if (state.kind === "carregando") {
    return (
      <Shell>
        <p className="text-center text-muted-foreground">Carregando...</p>
      </Shell>
    )
  }

  if (state.kind === "erro") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Não deu pra carregar</CardTitle>
            <CardDescription>Confira sua internet e tente de novo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="gold" onClick={() => window.location.reload()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "invalido") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Link inválido</CardTitle>
            <CardDescription>
              Esse link não existe ou não é mais válido. Fale com a gente pelo WhatsApp pra receber
              um novo.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "ja_preenchida") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Ficha já enviada 🌸</CardTitle>
            <CardDescription>
              Você já mandou essas informações pra gente, obrigada! Qualquer coisa, é só chamar no
              WhatsApp.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  if (state.kind === "enviada") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Recebemos, obrigada! 💛</CardTitle>
            <CardDescription>
              Já seguimos com os próximos passos. Qualquer dúvida, é só chamar no WhatsApp.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Oi, {state.nome}! 🌸
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pra finalizar seu cadastro, preencha as informações abaixo e envie.
        </p>
        <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-foreground">
          Assim que recebermos, a {BRAND.dona} analisa e te chama no WhatsApp pra combinar a retirada da sua maleta. 💼
        </p>
      </div>
      <FichaForm onSubmitValues={handleSubmit} />
    </Shell>
  )
}
