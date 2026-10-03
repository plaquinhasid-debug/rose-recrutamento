import * as React from "react"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, Instagram, Loader2, MessageCircle, XCircle } from "lucide-react"
import { ETAPA_POS_APROVACAO_LABEL } from "@tania-joias/shared"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { RoseFichaSection } from "@/components/leads/RoseFichaSection"
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge"
import { IprBreakdown } from "@/components/leads/IprBreakdown"
import { useLead, useLeadAnalysis, useUpdateLead } from "@/hooks/useLeadDetail"
import { formatDateTime, formatInstagram, formatPhone, whatsappLinkWithMessage } from "@/lib/format"
import { mensagemFalarComCandidata } from "@/lib/taniaFalarComCandidata"
import type { IprBreakdown as IprBreakdownType } from "@/types"

interface LeadDetailDrawerProps {
  leadId: string | null
  onOpenChange: (open: boolean) => void
}

function Linha({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function instagramUrl(handle: string): string {
  const limpo = handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "")
  return `https://www.instagram.com/${limpo}/`
}

export function LeadDetailDrawer({ leadId, onOpenChange }: LeadDetailDrawerProps) {
  const open = Boolean(leadId)
  const { data: lead, isLoading: leadLoading, isError: leadError } = useLead(leadId ?? undefined)
  const { data: analysis, isLoading: analysisLoading } = useLeadAnalysis(leadId ?? undefined)
  const updateLead = useUpdateLead()

  const [observacoes, setObservacoes] = React.useState("")
  React.useEffect(() => {
    setObservacoes(lead?.observacoes ?? "")
  }, [lead?.id, lead?.observacoes])
  const observacoesDirty = (lead?.observacoes ?? "") !== observacoes

  async function handlePreQualificacao(status: "aprovada" | "reprovada") {
    if (!lead) return
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: { status, whatsapp: true },
        previousStatus: lead.status,
        leadWhatsapp: true,
      })
      toast.success(status === "aprovada" ? "Pré-aprovada! O link da ficha foi gerado." : "Marcada como não seguiu.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.")
    }
  }

  async function handleSaveObservacoes() {
    if (!lead) return
    try {
      await updateLead.mutateAsync({ id: lead.id, patch: { observacoes } })
      toast.success("Observações salvas.")
    } catch {
      toast.error("Não foi possível salvar as observações.")
    }
  }

  const linkWhatsapp = lead ? whatsappLinkWithMessage(lead.telefone, mensagemFalarComCandidata(lead.nome)) : null
  const emPreQualificacao = lead?.status === "novo" || lead?.status === "em_analise"

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <SheetContent className="w-full sm:max-w-xl">
        {leadLoading ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Carregando</SheetTitle>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : leadError || !lead ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <SheetTitle className="sr-only">Candidata não encontrada</SheetTitle>
            <AlertCircle className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Candidata não encontrada</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{lead.nome}</SheetTitle>
                <LeadStatusBadge status={lead.status} />
              </div>
              <SheetDescription>
                {formatPhone(lead.telefone)} · {lead.cidade ?? "Cidade não informada"} · Chegou em{" "}
                {formatDateTime(lead.created_at)}
              </SheetDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                {linkWhatsapp && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-4" />
                      Chamar no WhatsApp
                    </a>
                  </Button>
                )}
                {lead.instagram && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={instagramUrl(lead.instagram)} target="_blank" rel="noopener noreferrer">
                      <Instagram className="size-4" />
                      Ver Instagram
                    </a>
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
              <section>
                <h3 className="mb-1 text-sm font-semibold text-foreground">Sobre ela</h3>
                <Linha label="Idade" value={lead.idade} />
                <Linha label="Trabalha" value={lead.trabalha ? "Sim" : "Não"} />
                <Linha label="Profissão" value={lead.profissao} />
                <Linha label="Onde trabalha" value={lead.empresa_atual} />
                <Linha
                  label="Já vendeu antes"
                  value={lead.experiencia_vendas === null ? null : lead.experiencia_vendas ? "Sim" : "Não"}
                />
                <Linha label="Instagram" value={lead.instagram ? formatInstagram(lead.instagram) : "Não informou"} />
                <Linha
                  label="Etapa"
                  value={lead.etapa_pos_aprovacao ? ETAPA_POS_APROVACAO_LABEL[lead.etapa_pos_aprovacao] : null}
                />
                <Linha label="Origem" value={lead.utm_campaign || lead.origem} />
                {lead.objetivo && (
                  <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm italic text-foreground">“{lead.objetivo}”</p>
                )}
              </section>

              {lead.status === "aprovada" && (
                <>
                  <Separator />
                  <RoseFichaSection lead={lead} />
                </>
              )}

              <Separator />

              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Pontuação (IPR)</h3>
                {analysisLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <IprBreakdown
                    score={lead.ipr}
                    breakdown={(analysis?.ipr_breakdown as IprBreakdownType | null) ?? null}
                  />
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Observações</h3>
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Anotações internas sobre esta candidata..."
                  rows={3}
                />
                {observacoesDirty && (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleSaveObservacoes()}
                    disabled={updateLead.isPending}
                  >
                    {updateLead.isPending && <Loader2 className="size-3.5 animate-spin" />}
                    Salvar observações
                  </Button>
                )}
              </section>
            </div>

            {emPreQualificacao && (
              <SheetFooter className="flex-row flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-success/40 text-success hover:bg-success/10"
                  disabled={updateLead.isPending}
                  onClick={() => void handlePreQualificacao("aprovada")}
                >
                  <CheckCircle2 className="size-4" />
                  Pré-aprovar (gerar ficha)
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={updateLead.isPending}
                  onClick={() => void handlePreQualificacao("reprovada")}
                >
                  <XCircle className="size-4" />
                  Não seguir
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
