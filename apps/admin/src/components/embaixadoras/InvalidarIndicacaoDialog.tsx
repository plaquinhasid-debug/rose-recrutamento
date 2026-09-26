import { useId, useState } from "react"
import { Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { useInvalidarIndicacao } from "@/hooks/useInvalidarIndicacao"
import { INVALIDAR_UNEXPECTED_ERROR, InvalidarIndicacaoError, podeInvalidar } from "@/lib/invalidarIndicacao"
import { MOTIVO_MAX, MOTIVO_MIN, motivoValido } from "@/lib/recompensaAcao"
import type { IndicacaoAdmin } from "@/hooks/useIndicacoesAdmin"

// IMPLEMENTATION-EMBAIXADORAS-E3.5 — invalidar indicação (teste, fraude).
// Some do Portal da Embaixadora e não gera recompensa. Nada é apagado.

export function InvalidarIndicacaoDialog({ indicacao }: { indicacao: IndicacaoAdmin }) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useInvalidarIndicacao()
  const id = useId()

  if (!podeInvalidar(indicacao)) return null

  const candidata = indicacao.candidata?.nome ?? "esta candidata"
  const embaixadora = indicacao.embaixadora?.nome ?? "a Embaixadora"

  function handleOpenChange(nextOpen: boolean) {
    if (mutation.isPending) return
    setError(null)
    setMotivo("")
    setOpen(nextOpen)
  }

  async function handleConfirm() {
    if (mutation.isPending || !motivoValido(motivo)) return
    setError(null)
    try {
      await mutation.mutateAsync({ indicacaoId: indicacao.id, motivo: motivo.trim() })
      toast.success("Indicação invalidada.")
      setOpen(false)
    } catch (err) {
      setError(err instanceof InvalidarIndicacaoError ? err.message : INVALIDAR_UNEXPECTED_ERROR)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive"><XCircle className="size-4" />Invalidar</Button>
      </DialogTrigger>
      {open ? (
        <DialogContent showClose={!mutation.isPending} className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Invalidar indicação</DialogTitle>
            <DialogDescription>
              {`A indicação de ${candidata} deixará de contar para ${embaixadora}: some do Portal dela e não gera recompensa. O registro fica guardado. Não pode ser desfeito por aqui.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${id}-motivo`}>Motivo</Label>
            <Textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={MOTIVO_MAX}
              disabled={mutation.isPending}
              placeholder="Ex.: indicação de teste do sistema."
              onChange={(event) => setMotivo(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{`Mínimo ${MOTIVO_MIN} letras.`}</p>
          </div>
          {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => handleOpenChange(false)}>Voltar</Button>
            <Button type="button" variant="gold" disabled={mutation.isPending || !motivoValido(motivo)} onClick={handleConfirm}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Invalidar indicação
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
