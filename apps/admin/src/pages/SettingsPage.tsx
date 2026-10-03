import { BRAND } from "@tania-joias/shared"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  useCidadesAtendidas,
  useSaveCidadesAtendidas,
  useSofiaIaAtiva,
  useSaveSofiaIaAtiva,
  useSofiaPerguntasIaAtiva,
  useSaveSofiaPerguntasIaAtiva,
  useSofiaConducaoNatural,
  useSaveSofiaConducaoNatural,
  type SavableNaturalConversationMode,
  useWhatsappAprovacaoAutomaticaAtiva,
  useSaveWhatsappAprovacaoAutomaticaAtiva,
  useWhatsappNotificacaoTaniaAtiva,
  useSaveWhatsappNotificacaoTaniaAtiva,
  useWhatsappFichaAutomaticaAtiva,
  useSaveWhatsappFichaAutomaticaAtiva,
  useWhatsappLembreteFichaAutomaticoAtiva,
  useSaveWhatsappLembreteFichaAutomaticoAtiva,
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

  const { data: perguntasIaAtiva, isLoading: perguntasIaLoading } = useSofiaPerguntasIaAtiva()
  const savePerguntasIaAtiva = useSaveSofiaPerguntasIaAtiva()

  async function handleTogglePerguntasIa(checked: boolean) {
    try {
      await savePerguntasIaAtiva.mutateAsync(checked)
      toast.success(checked ? "Sofia passou a responder perguntas por IA." : "Sofia parou de responder perguntas por IA.")
    } catch {
      toast.error("Não foi possível atualizar essa configuração.")
    }
  }

  const { data: conducaoNaturalModo, isLoading: conducaoNaturalLoading } = useSofiaConducaoNatural()
  const saveConducaoNatural = useSaveSofiaConducaoNatural()

  async function handleChangeConducaoNatural(value: string) {
    if (value !== "OFF" && value !== "SHADOW" && value !== "ACTIVE") return
    try {
      await saveConducaoNatural.mutateAsync(value as SavableNaturalConversationMode)
      toast.success(
        value === "OFF"
          ? "Condução natural desligada."
          : value === "SHADOW"
            ? "Condução natural em modo Shadow (só observação)."
            : "Condução natural ativa (reconhecimentos curtos, sem IA).",
      )
    } catch {
      toast.error("Não foi possível atualizar essa configuração.")
    }
  }

  const { data: whatsappAutomaticoAtiva, isLoading: whatsappAutomaticoLoading } =
    useWhatsappAprovacaoAutomaticaAtiva()
  const saveWhatsappAutomatico = useSaveWhatsappAprovacaoAutomaticaAtiva()

  async function handleToggleWhatsappAutomatico(checked: boolean) {
    try {
      await saveWhatsappAutomatico.mutateAsync(checked)
      toast.success(
        checked
          ? "Mensagem automática de aprovação ativada."
          : "Mensagem automática de aprovação desativada.",
      )
    } catch {
      toast.error("Não foi possível atualizar essa configuração.")
    }
  }

  const { data: notificacaoTaniaAtiva, isLoading: notificacaoTaniaLoading } =
    useWhatsappNotificacaoTaniaAtiva()
  const saveNotificacaoTania = useSaveWhatsappNotificacaoTaniaAtiva()

  async function handleToggleNotificacaoTania(checked: boolean) {
    try {
      await saveNotificacaoTania.mutateAsync(checked)
      toast.success(
        checked
          ? `Aviso automático pra ${BRAND.dona} ativado.`
          : `Aviso automático pra ${BRAND.dona} desativado.`,
      )
    } catch {
      toast.error("Não foi possível atualizar essa configuração.")
    }
  }

  const { data: fichaAutomaticaAtiva, isLoading: fichaAutomaticaLoading } =
    useWhatsappFichaAutomaticaAtiva()
  const saveFichaAutomatica = useSaveWhatsappFichaAutomaticaAtiva()

  async function handleToggleFichaAutomatica(checked: boolean) {
    try {
      await saveFichaAutomatica.mutateAsync(checked)
      toast.success(
        checked
          ? "Envio automático do link da Ficha ativado."
          : "Envio automático do link da Ficha desativado.",
      )
    } catch {
      toast.error("Não foi possível atualizar essa configuração.")
    }
  }

  const { data: lembreteFichaAtivo, isLoading: lembreteFichaLoading } =
    useWhatsappLembreteFichaAutomaticoAtiva()
  const saveLembreteFicha = useSaveWhatsappLembreteFichaAutomaticoAtiva()

  async function handleToggleLembreteFicha(checked: boolean) {
    try {
      await saveLembreteFicha.mutateAsync(checked)
      toast.success(
        checked
          ? "Lembrete automático da Ficha ativado."
          : "Lembrete automático da Ficha desativado.",
      )
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
        description="Regras operacionais do painel administrativo."
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

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>Sofia — Responder perguntas por IA</CardTitle>
          <CardDescription>
            Quando ativado, se a candidata digitar uma pergunta de negócio no meio da conversa (ex.: "quanto eu
            ganho de comissão?"), a Sofia busca a resposta na base de conhecimento oficial, responde usando IA
            (Claude) e retoma a mesma pergunta do roteiro em seguida — nunca pula nem grava a pergunta como se
            fosse resposta. Quando desativado, o texto digitado é registrado como resposta normal, exatamente
            como sempre foi. Nunca afeta a aprovação/reprovação automática.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perguntasIaLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="sofia-perguntas-ia-ativa">Perguntas por IA ativadas</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Afeta a conversa que a candidata vê em tempo real — teste antes de deixar ligado.
                </p>
              </div>
              <Switch
                id="sofia-perguntas-ia-ativa"
                checked={Boolean(perguntasIaAtiva)}
                onCheckedChange={(checked) => void handleTogglePerguntasIa(checked)}
                disabled={savePerguntasIaAtiva.isPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>Sofia — Condução Natural</CardTitle>
          <CardDescription>
            No modo Shadow, a Sofia analisa as mensagens e prepara reações naturais, mas a candidata
            continua vendo o fluxo atual sem nenhuma alteração. No modo Ativo, ela passa a mostrar um
            reconhecimento curto e fixo (sem IA) antes de nome, cidade, idade, WhatsApp e Instagram —
            as perguntas abertas (profissão, objetivo etc.) continuam exatamente como hoje. Nada disso
            afeta a aprovação/reprovação automática.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conducaoNaturalLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="sofia-conducao-natural">Modo</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  "Ativa" mostra reconhecimentos curtos e fixos (sem IA) em 5 perguntas de
                  identificação — recomendo validar em Shadow por alguns dias antes de ativar.
                </p>
              </div>
              <Select
                value={conducaoNaturalModo ?? "OFF"}
                onValueChange={(value) => void handleChangeConducaoNatural(value)}
                disabled={saveConducaoNatural.isPending}
              >
                <SelectTrigger id="sofia-conducao-natural" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFF">Desligada — OFF</SelectItem>
                  <SelectItem value="SHADOW">Somente observar — SHADOW</SelectItem>
                  <SelectItem value="ACTIVE">Ativa — reconhecimentos curtos, sem IA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>WhatsApp — Mensagem automática na aprovação</CardTitle>
          <CardDescription>
            Quando ativado, assim que uma candidata é aprovada (pela IPR na hora ou manualmente pela
            equipe depois), ela recebe automaticamente uma mensagem de aprovação pelo WhatsApp Cloud API
            (API oficial da Meta), pelo mesmo número da equipe. O botão "Enviar WhatsApp" manual continua
            existindo — a automática não substitui, só adianta o primeiro contato. Requer o cadastro na
            Meta concluído (token + Phone Number ID + modelo de mensagem aprovado) antes de ligar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {whatsappAutomaticoLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="whatsapp-automatico-ativa">Mensagem automática ativada</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Só liga depois de testar com um número real — sem credenciais configuradas, o envio
                  falha silenciosamente (best-effort, nunca trava a aprovação).
                </p>
              </div>
              <Switch
                id="whatsapp-automatico-ativa"
                checked={Boolean(whatsappAutomaticoAtiva)}
                onCheckedChange={(checked) => void handleToggleWhatsappAutomatico(checked)}
                disabled={saveWhatsappAutomatico.isPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>WhatsApp — Link da Ficha automático</CardTitle>
          <CardDescription>
            Quando ativado, assim que o link da Ficha de Aprovação é gerado, a candidata recebe
            automaticamente o modelo "ficha_aprovacao_link" (aprovado pela Meta) com um botão
            "Preencher Ficha" — no lugar do clique manual em "Mandar pelo WhatsApp". O botão manual
            continua existindo como reserva, caso o envio automático falhe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fichaAutomaticaLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="whatsapp-ficha-automatica-ativa">Envio automático ativado</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Requer o secret WHATSAPP_FICHA_TEMPLATE_NAME configurado no Supabase — só liga
                  depois de testar com um número real.
                </p>
              </div>
              <Switch
                id="whatsapp-ficha-automatica-ativa"
                checked={Boolean(fichaAutomaticaAtiva)}
                onCheckedChange={(checked) => void handleToggleFichaAutomatica(checked)}
                disabled={saveFichaAutomatica.isPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>WhatsApp — Lembrete automático da Ficha</CardTitle>
          <CardDescription>
            Quando ativado, todo dia às 10h a Sofia verifica quem está há mais de 2 dias com o link
            da Ficha gerado e não preenchido, e reenvia o mesmo modelo (ficha_aprovacao_link)
            sozinha — sem ninguém clicar. Cada candidata só recebe esse lembrete 1 vez. O botão
            "Lembrar" manual no card do Kanban continua funcionando normalmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lembreteFichaLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="whatsapp-lembrete-ficha-ativa">Lembrete automático ativado</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Roda 1x por dia via tarefa agendada — só liga depois de testar.
                </p>
              </div>
              <Switch
                id="whatsapp-lembrete-ficha-ativa"
                checked={Boolean(lembreteFichaAtivo)}
                onCheckedChange={(checked) => void handleToggleLembreteFicha(checked)}
                disabled={saveLembreteFicha.isPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 max-w-2xl">
        <CardHeader>
          <CardTitle>WhatsApp — Avisar a {BRAND.dona} quando a Ficha chega</CardTitle>
          <CardDescription>
            Quando ativado, assim que uma candidata preenche a Ficha de Aprovação, a {BRAND.dona} recebe
            automaticamente o resumo (nome, perfil, localização) pelo WhatsApp oficial (BrilhoFlow
            Atendimento) — sem precisar de ninguém clicar em "Enviar pra {BRAND.dona}" no Admin. Ela responde
            "sim"/"não" na mesma conversa e o sistema decide sozinho. Se o envio falhar (ex.: fora da
            janela de atendimento de 24h), a lead fica em "Confirmada" e o botão manual continua ali
            como reserva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notificacaoTaniaLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="whatsapp-notificacao-tania-ativa">Aviso automático ativado</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  A {BRAND.dona} precisa responder na conversa do número oficial, não na conversa pessoal de
                  sempre — só ali o sistema consegue ler a resposta.
                </p>
              </div>
              <Switch
                id="whatsapp-notificacao-tania-ativa"
                checked={Boolean(notificacaoTaniaAtiva)}
                onCheckedChange={(checked) => void handleToggleNotificacaoTania(checked)}
                disabled={saveNotificacaoTania.isPending}
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
