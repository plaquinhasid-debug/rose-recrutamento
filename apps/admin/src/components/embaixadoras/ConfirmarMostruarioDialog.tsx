import { useId, useState } from "react"
import { Loader2, PackageCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { useConfirmPrimeiroMostruario } from "@/hooks/useConfirmPrimeiroMostruario"
import { CONFIRM_UNEXPECTED_ERROR, ConfirmMostruarioError, todayInBrazil } from "@/lib/confirmMostruario"
import { podeConfirmarMostruario } from "@/lib/indicacaoAdminLabels"
import type { IndicacaoAdmin } from "@/hooks/useIndicacoesAdmin"

// IMPLEMENTATION-EMBAIXADORAS-E3.2 — a equipe confirma que o primeiro
// mostruário foi ENTREGUE. Isso cria a recompensa (R$40 a pagar via Pix).
// A regra real e a trava contra duplicidade estão no servidor; aqui é só
// exibição + confirmação explícita com data.

export function ConfirmarMostruarioDialog({ indicacao }: { indicacao: IndicacaoAdmin }) {
  const [open, setOpen] = useState(false)
  const [dataEntrega, setDataEntrega] = useState(() => todayInBrazil())
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirmPrimeiroMostruario()
  const id = useId()

  if (!podeConfirmarMostruario(indicacao)) return null

  const candidata = indicacao.candidata?.nome ?? "a candidata"
  const embaixadora = indicacao.embaixadora?.nome ?? "a Embaixadora"

  function handleOpenChange(nextOpen: boolean) {
    if (confirm.isPending) return
    setError(null)
    setDataEntrega(todayInBrazil())
    setOpen(nextOpen)
  }

  async function handleConfirm() {
    if (confirm.isPending) return
    setError(null)
    try {
      await confirm.mutateAsync({ indicacaoId: indicacao.id, dataEntrega })
      toast.success(`Entrega confirmada. Recompensa de ${embaixadora} registrada como a pagar.`)
      setOpen(false)
    } catch (err) {
      setError(err instanceof ConfirmMostruarioError ? err.message : CONFIRM_UNEXPECTED_ERROR)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><PackageCheck className="size-4" />Confirmar entrega</Button>
      </DialogTrigger>
      {open ? (
        <DialogContent showClose={!confirm.isPending} className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Confirmar entrega do primeiro mostruário</DialogTitle>
            <DialogDescription>
              {`Confirme somente se o mostruário já foi entregue para ${candidata}. Isso registra R$ 40,00 a pagar (Pix) para ${embaixadora}, indicação dela. Esta ação não pode ser desfeita por aqui.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${id}-data`}>Data da entrega</Label>
            <Input
              id={`${id}-data`}
              type="date"
              value={dataEntrega}
              max={todayInBrazil()}
              disabled={confirm.isPending}
              onChange={(event) => setDataEntrega(event.target.value)}
            />
          </div>
          {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={confirm.isPending} onClick={() => handleOpenChange(false)}>Cancelar</Button>
            <Button type="button" variant="gold" disabled={confirm.isPending || !dataEntrega} onClick={handleConfirm}>
              {confirm.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
