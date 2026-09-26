import { Copy, LogOut, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/context/AuthContext"
import { useMyEmbaixadora } from "@/hooks/useMyEmbaixadora"
import { useMyIndicacoes, type SituacaoIndicacao } from "@/hooks/useMyIndicacoes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate } from "@/lib/format"
import { formatCentavos, recompensaTexto } from "@/lib/myIndicacoes"
import { buildReferralUrl, buildWhatsappShareMessage, buildWhatsappShareUrl, copyReferralLink } from "@/lib/referralLink"

// IMPLEMENTATION-EMBAIXADORAS-E2.7-B/E2.8/E2.9/E3.4 — Portal da Embaixadora.
// Mostra os 3 campos que `get-my-embaixadora` devolve (nome/status/
// codigo_referral) + sair, o link pessoal de indicação (E2.8), a lista de
// indicações (E2.9) e, desde a E3.4, os totais "A receber"/"Já recebido" e
// a situação do prêmio de cada indicação — tudo vindo de
// `get-my-indicacoes`, nunca calculado aqui. Continua fora de escopo:
// ConsigGold, ranking, gamificação, motivo de cancelamento.

const STATUS_LABEL: Record<string, string> = {
  ativa: "Ativa",
}

// Rótulos aprovados na E2.9 (seção 3) — os 3 únicos estados públicos que a
// Embaixadora vê, nunca o valor cru do banco nem etapas operacionais
// internas do Kanban do Admin.
const SITUACAO_LABEL: Record<SituacaoIndicacao, string> = {
  em_analise: "Em análise",
  aprovada: "Aprovada",
  nao_aprovada: "Não aprovada",
}

export default function EmbaixadoraPortalPage() {
  const { signOut } = useAuth()
  const query = useMyEmbaixadora()
  const indicacoesQuery = useMyIndicacoes()

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-gold" />
      </div>
    )
  }

  // EmbaixadoraProtectedRoute já garante que só chegamos aqui com
  // `query.data` preenchido e `status==='ativa'` — este `null` é só
  // defesa adicional (ex.: um refetch em voo depois de expirar), nunca o
  // caminho esperado em uso normal.
  if (!query.data) return null

  const { nome, status, codigo_referral } = query.data
  const referralUrl = buildReferralUrl(codigo_referral)
  const whatsappShareUrl = buildWhatsappShareUrl(buildWhatsappShareMessage(referralUrl))

  async function handleCopy() {
    const copied = await copyReferralLink(referralUrl, (text) => navigator.clipboard.writeText(text))
    if (copied) toast.success("Link copiado")
    else toast.error("Não foi possível copiar. Selecione o link e copie manualmente.")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Olá, {nome}</CardTitle>
            <CardDescription>Programa Embaixadoras Tania Jóias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-medium text-foreground">{STATUS_LABEL[status] ?? status}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Seu código de indicação</p>
              <p className="font-mono text-lg font-medium tracking-wide text-foreground">{codigo_referral}</p>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Sair
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Indique uma amiga</CardTitle>
            <CardDescription>
              Compartilhe seu link pessoal. Quem se cadastrar por ele fica associada a você.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="referral-link">Seu link de indicação</Label>
              <Input id="referral-link" readOnly autoComplete="off" value={referralUrl} onFocus={(event) => event.currentTarget.select()} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="gold" className="w-full" asChild>
                <a href={whatsappShareUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  Compartilhar pelo WhatsApp
                </a>
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleCopy}>
                <Copy className="size-4" />
                Copiar link
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Minhas indicações</CardTitle>
            <CardDescription>
              {indicacoesQuery.data
                ? `${indicacoesQuery.data.total} ${indicacoesQuery.data.total === 1 ? "indicação" : "indicações"}`
                : "Carregando..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {indicacoesQuery.data ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-gold/10 p-3">
                  <p className="text-xs text-muted-foreground">A receber</p>
                  <p className="text-lg font-semibold text-foreground">{formatCentavos(indicacoesQuery.data.a_receber_centavos)}</p>
                </div>
                <div className="rounded-md bg-success/10 p-3">
                  <p className="text-xs text-muted-foreground">Já recebido</p>
                  <p className="text-lg font-semibold text-foreground">{formatCentavos(indicacoesQuery.data.recebido_centavos)}</p>
                </div>
              </div>
            ) : null}
            {indicacoesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando suas indicações...</p>
            ) : !indicacoesQuery.data || indicacoesQuery.data.indicacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não tem indicações.</p>
            ) : (
              <ul className="space-y-3">
                {indicacoesQuery.data.indicacoes.map((indicacao, index) => (
                  <li key={index} className="rounded-md border border-border p-3">
                    <p className="font-medium text-foreground">{indicacao.nome}</p>
                    <p className="text-sm text-muted-foreground">{SITUACAO_LABEL[indicacao.situacao]}</p>
                    <p className="text-xs text-muted-foreground">Indicada em {formatDate(indicacao.indicada_em)}</p>
                    {recompensaTexto(indicacao) ? (
                      <p className="mt-1 text-sm font-medium text-foreground">{recompensaTexto(indicacao)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
