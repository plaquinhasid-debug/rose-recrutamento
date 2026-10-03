import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { ExternalLink, FileText, ThumbsDown, ThumbsUp } from "lucide-react"
import { BRAND, DOCUMENTO_TIPO_LABEL, type FichaDocumento } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useLeadFicha } from "@/hooks/useLeadFicha"
import { useUpdateLead } from "@/hooks/useLeadDetail"
import { formatDateTime, formatInstagram, formatPhone, googleMapsUrl } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import type { Lead } from "@/types"

const CASA_LABEL: Record<string, string> = { propria: "Própria", alugada: "Alugada", familia: "De familiares / cedida" }
const CPF_LABEL: Record<string, string> = { nao: "Não", sim: "Sim", nao_sei: "Não sabe" }

function Linha({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

/** Links temporários (10 min) pros documentos do bucket privado. */
function useDocumentosUrls(documentos: FichaDocumento[]) {
  return useQuery({
    queryKey: ["ficha-documentos", documentos.map((d) => d.path)],
    enabled: documentos.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: { tipo: FichaDocumento["tipo"]; url: string | null }[] = []
      for (const doc of documentos) {
        const { data } = await supabase.storage.from("fichas-documentos").createSignedUrl(doc.path, 600)
        out.push({ tipo: doc.tipo, url: data?.signedUrl ?? null })
      }
      return out
    },
  })
}

export function RoseFichaSection({ lead }: { lead: Lead }) {
  const { data: ficha, isLoading } = useLeadFicha(lead.id)
  const updateLead = useUpdateLead()
  const documentos = ((ficha?.documentos as FichaDocumento[] | null) ?? []).filter(Boolean)
  const { data: docUrls, isLoading: docsLoading } = useDocumentosUrls(documentos)

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!ficha) return null

  if (!ficha.preenchido_em) {
    return (
      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Ficha</h3>
        <p className="text-sm text-muted-foreground">
          Ainda não preenchida. Envie o link pelo card no CRM (botão “Enviar ficha no WhatsApp”).
        </p>
      </section>
    )
  }

  const decidida = lead.etapa_pos_aprovacao === "ativa" || lead.etapa_pos_aprovacao === "desistiu"

  async function decidir(aprovar: boolean) {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: { status: "aprovada", etapa_pos_aprovacao: aprovar ? "ativa" : "desistiu" },
        previousStatus: lead.status,
      })
      toast.success(aprovar ? "Aprovada! Movida para “Ativa”." : "Marcada como não aprovada.")
    } catch {
      toast.error("Não foi possível salvar a decisão.")
    }
  }

  const maps = googleMapsUrl(ficha)

  return (
    <section className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Ficha</h3>
        <p className="text-xs text-muted-foreground">Recebida em {formatDateTime(ficha.preenchido_em)}</p>
      </div>

      <div>
        <Linha
          label="Endereço"
          value={
            maps ? (
              <a href={maps} target="_blank" rel="noopener noreferrer" className="underline">
                {[ficha.endereco_rua, ficha.endereco_numero, ficha.endereco_bairro, ficha.endereco_cidade].filter(Boolean).join(", ")}
              </a>
            ) : null
          }
        />
        <Linha label="Casa" value={CASA_LABEL[ficha.casa_propria ?? ""]} />
        <Linha label="Filhos" value={ficha.filhos_quantidade} />
        <Linha label="Restrição no CPF" value={CPF_LABEL[ficha.restricao_cpf ?? ""]} />
        <Linha label="Trabalho (endereço)" value={ficha.trabalho_endereco} />
        <Linha label="Trabalho (telefone)" value={ficha.trabalho_telefone ? formatPhone(ficha.trabalho_telefone) : null} />
        <Linha label="Horário de trabalho" value={ficha.trabalho_horario} />
        <Linha label="Instagram profissional" value={ficha.instagram_profissional ? formatInstagram(ficha.instagram_profissional) : null} />
        <Linha label="Casada / companheiro" value={ficha.tem_conjuge ? "Sim" : "Não"} />
        <Linha label="Companheiro" value={ficha.conjuge_nome} />
        <Linha label="Telefone dele" value={ficha.conjuge_telefone ? formatPhone(ficha.conjuge_telefone) : null} />
        <Linha label="Onde ele trabalha" value={ficha.conjuge_trabalho_local} />
        <Linha label="Telefone do trabalho dele" value={ficha.conjuge_trabalho_telefone ? formatPhone(ficha.conjuge_trabalho_telefone) : null} />
        <Linha label="Referência 1" value={ficha.ref1_nome ? `${ficha.ref1_nome} · ${formatPhone(ficha.ref1_telefone)}` : null} />
        <Linha label="Referência 2" value={ficha.ref2_nome ? `${ficha.ref2_nome} · ${formatPhone(ficha.ref2_telefone)}` : null} />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos</h4>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>
        ) : docsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex flex-col gap-2">
            {(docUrls ?? []).map((doc) => (
              <a
                key={doc.tipo}
                href={doc.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <FileText className="size-4 text-gold" />
                {DOCUMENTO_TIPO_LABEL[doc.tipo]}
                <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        )}
      </div>

      {!decidida && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">Decisão da {BRAND.dona}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="gold" disabled={updateLead.isPending} onClick={() => void decidir(true)}>
              <ThumbsUp className="size-4" />
              Aprovar (vai pegar a maleta)
            </Button>
            <Button size="sm" variant="outline" disabled={updateLead.isPending} onClick={() => void decidir(false)}>
              <ThumbsDown className="size-4" />
              Não aprovar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
