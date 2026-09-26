import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmbaixadorasTable } from "@/components/embaixadoras/EmbaixadorasTable"
import { IndicacoesTable } from "@/components/embaixadoras/IndicacoesTable"
import { ConvidarEmbaixadoraDialog } from "@/components/embaixadoras/ConvidarEmbaixadoraDialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEmbaixadoras } from "@/hooks/useEmbaixadoras"
import { useIndicacoesAdmin } from "@/hooks/useIndicacoesAdmin"

export default function EmbaixadorasPage() {
  const { data: embaixadoras, isLoading, isError, refetch } = useEmbaixadoras()
  const indicacoes = useIndicacoesAdmin()

  return (
    <div>
      <PageHeader
        title="Embaixadoras"
        description="Gerencie as participantes do Programa Embaixadoras Tania Jóias."
        action={<ConvidarEmbaixadoraDialog />}
      />

      <Tabs defaultValue="embaixadoras">
        <TabsList className="mb-4">
          <TabsTrigger value="embaixadoras">Embaixadoras</TabsTrigger>
          <TabsTrigger value="indicacoes">
            Indicações{indicacoes.data ? ` (${indicacoes.data.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="embaixadoras">
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : (
            <EmbaixadorasTable embaixadoras={embaixadoras ?? []} isLoading={isLoading} />
          )}
        </TabsContent>

        <TabsContent value="indicacoes">
          {indicacoes.isError ? (
            <ErrorState onRetry={() => indicacoes.refetch()} />
          ) : (
            <IndicacoesTable indicacoes={indicacoes.data ?? []} isLoading={indicacoes.isLoading} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
