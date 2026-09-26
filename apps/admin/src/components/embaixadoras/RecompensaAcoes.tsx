import { useId, useState } from "react"
import { Ban, Loader2, Wallet } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { useUpdateRecompensaStatus, type RecompensaAcaoInput } from "@/hooks/useUpdateRecompensaStatus"
import { todayInBrazil } from "@/lib/confirmMostruario"
import { formatCentavos } from "@/lib/indicacaoAdminLabels"
import {
  MOTIVO_MAX, MOTIVO_MIN, motivoValido, podeAlterarRecompensa, RECOMPENSA_UNEXPECTED_ERROR, RecompensaAcaoError,
} from "@/lib/recompensaAcao"
import type { IndicacaoAdmin } from "@/hooks/useIndicacoesAdmin"

// IMPLEMENTATION-EMBAIXADORAS-E3.3 — botões "Marcar como paga" (Pix feito)
// e "Cancelar" para recompensas a pagar. O sistema não faz o Pix: só
// registra. Pago e cancelado são finais. A regra real está no servidor.

type Modo = "pagar" | "cancelar"

function AcaoDialog({ indicacao, modo }: { indicacao: IndicacaoAdmin; modo: Modo }) {
  const [open, setOpen] = useState(false)
  const [dataPagamento, setDataPagamento] = useState(() => todayInBrazil())
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useUpdateRecompensaStatus()
  const id = useId()

  const embaixadora = indicacao.embaixadora?.nome ?? "a Embaixadora"
  const valor = formatCentavos(indicacao.recompensa?.valor_centavos ?? 0)
  const podeEnviar = modo === "pagar" ? Boolean(dataPagamento) : motivoValido(motivo)

  function handleOpenChange(nextOpen: boolean) {
    if (mutation.isPending) return
    setError(null)
    setDataPagamento(todayInBrazil())
    setMotivo("")
    setOpen(nextOpen)
  }

  async function handleConfirm() {
    if (mutation.isPending || !podeEnviar) return
    setError(null)
    const input: RecompensaAcaoInput = modo === "pagar"
      ? { acao: "pagar", indicacaoId: indicacao.id, dataPagamento }
      : { acao: "cancelar", indicacaoId: indicacao.id, motivo: motivo.trim() }
    try {
      await mutation.mutateAsync(input)
      toast.success(modo === "pagar" ? `Recompensa de ${embaixadora} marcada como paga.` : "Recompensa cancelada.")
      setOpen(false)
    } catch (err) {
      setError(err instanceof RecompensaAcaoError ? err.message : RECOMPENSA_UNEXPECTED_ERROR)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {modo === "pagar"
          ? <Button variant="outline" size="sm"><Wallet className="size-4" />Marcar como paga</Button>
          : <Button variant="ghost" size="sm" className="text-destructive"><Ban className="size-4" />Cancelar</Button>}
      </DialogTrigger>
      {open ? (
        <DialogContent showClose={!mutation.isPending} className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{modo === "pagar" ? "Marcar recompensa como paga" : "Cancelar recompensa"}</DialogTitle>
            <DialogDescription>
              {modo === "pagar"
                ? `Confirme somente depois de fazer o Pix de ${valor} para ${embaixadora}. O sistema não faz o Pix, só registra.`
                : `A recompensa de ${valor} para ${embaixadora} deixará de ser devida. Use só em caso de engano. Não pode ser desfeito por aqui.`}
            </DialogDescription>
          </DialogHeader>
          {modo === "pagar" ? (
            <div className="space-y-2">
              <Label htmlFor={`${id}-data`}>Data do Pix</Label>
              <Input
                id={`${id}-data`}
                type="date"
                value={dataPagamento}
                max={todayInBrazil()}
                disabled={mutation.isPending}
                onChange={(event) => setDataPagamento(event.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`${id}-motivo`}>Motivo do cancelamento</Label>
              <Textarea
                id={`${id}-motivo`}
                value={motivo}
                maxLength={MOTIVO_MAX}
                disabled={mutation.isPending}
                placeholder="Ex.: confirmado por engano, era uma indicação de teste."
                onChange={(event) => setMotivo(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{`Mínimo ${MOTIVO_MIN} letras.`}</p>
            </div>
          )}
          {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => handleOpenChange(false)}>Voltar</Button>
            <Button type="button" variant="gold" disabled={mutation.isPending || !podeEnviar} onClick={handleConfirm}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {modo === "pagar" ? "Confirmar pagamento" : "Cancelar recompensa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

export function RecompensaAcoes({ indicacao }: { indicacao: IndicacaoAdmin }) {
  if (!podeAlterarRecompensa(indicacao)) return null
  return (
    <div className="flex flex-wrap gap-1">
      <AcaoDialog indicacao={indicacao} modo="pagar" />
      <AcaoDialog indicacao={indicacao} modo="cancelar" />
    </div>
  )
}
