import * as React from "react"
import { toast } from "sonner"
import { Loader2, Plus, X } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCidadesAtendidas,
  useSaveCidadesAtendidas,
  useSofiaIaAtiva,
  useSaveSofiaIaAtiva,
} from "@/hooks/useSettings"

export default function SettingsPage() {
  const { data, isLoading, isError, refetch } = useCidadesAtendidas()
  const saveMutation = useSaveCidadesAtendidas()

  const { data: sofiaIaAtiva, isLoading: sofiaIaLoading } = useSofiaIaAtiva()
  const saveSofiaIaAtiva = useSaveSofiaIaAtiva()

  async function handleToggleSofiaIa(checked: boolean) {
    try {
      await saveSofiaIaAtiva.mutateAsync(checked)
      toast.success(checked ? "Análise por IA da Sofia ativada." : "Análise por IA da Sofia desativada.")
    } catch {
      toast.error("Não foi possível atualizar essa configuração.")
    }
  }

  const [restringir, setRestringir] = React.useState(false)
  const [lista, setLista] = React.useState<string[]>([])
  const [novaCidade, setNovaCidade] = React.useState("")

  React.useEffect(() => {
    if (data) {
      setRestringir(data.restringir)
      setLista(data.lista)
    }
  }, [data])

  const dirty =
    Boolean(data) && (data!.restringir !== restringir || JSON.stringify(data!.lista) !== JSON.stringify(lista))

  function addCidade() {
    const trimmed = novaCidade.trim()
    if (!trimmed) return
    if (lista.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setNovaCidade("")
      return
    }
    setLista((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b)))
    setNovaCidade("")
  }

  function removeCidade(cidade: string) {
    setLista((prev) => prev.filter((c) => c !== cidade))
  }

  async function handleSave() {
    try {
      await saveMutation.mutateAsync({ restringir, lista })
      toast.success("Configurações salvas.")
    } catch {
      toast.error("Não foi possível salvar as configurações.")
    }
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Regras da captação de revendedoras."
      />

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>Sofia — Análise por IA</CardTitle>
          <CardDescription>
            Quando ativado, a Sofia usa a Anthropic (Claude) para gerar uma análise consultiva completa
            de cada candidata (ICP, potencial empreendedor, probabilidade de sucesso, pontos fortes/atenção
            etc.), visível no card "Análise da Sofia" ao abrir uma candidata. Quando desativado, o cadastro
            funciona exatamente como hoje — regras determinísticas, sem chamadas de IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sofiaIaLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="sofia-ia-ativa">Análise por IA ativada</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Não afeta a aprovação/reprovação automática — isso continua pelas regras abaixo.
                </p>
              </div>
              <Switch
                id="sofia-ia-ativa"
                checked={Boolean(sofiaIaAtiva)}
                onCheckedChange={(checked) => void handleToggleSofiaIa(checked)}
                disabled={saveSofiaIaAtiva.isPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Cidades atendidas</CardTitle>
            <CardDescription>
              Restrinja a captação de novas revendedoras às cidades cadastradas abaixo. Quando
              desativado, a Landing Page aceita candidatas de qualquer cidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label htmlFor="restringir-cidade">Restringir por cidade</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quando ativo, apenas candidatas das cidades da lista são aceitas.
                    </p>
                  </div>
                  <Switch id="restringir-cidade" checked={restringir} onCheckedChange={setRestringir} />
                </div>

                <div>
                  <Label>Cidades cadastradas</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={novaCidade}
                      onChange={(e) => setNovaCidade(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addCidade()
                        }
                      }}
                      placeholder="Adicionar cidade..."
                    />
                    <Button type="button" variant="outline" onClick={addCidade}>
                      <Plus className="size-4" />
                      Adicionar
                    </Button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {lista.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma cidade cadastrada.</p>
                    ) : (
                      lista.map((cidade) => (
                        <Badge key={cidade} variant="secondary" className="gap-1 pr-1.5">
                          {cidade}
                          <button
                            onClick={() => removeCidade(cidade)}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-border"
                            aria-label={`Remover ${cidade}`}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button variant="gold" disabled={!dirty || saveMutation.isPending} onClick={() => void handleSave()}>
                    {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    Salvar alterações
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
