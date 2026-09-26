import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { formatDate } from "@/lib/format"
import { candidataSituacao, recompensaSituacao } from "@/lib/indicacaoAdminLabels"
import type { IndicacaoAdmin } from "@/hooks/useIndicacoesAdmin"

// IMPLEMENTATION-EMBAIXADORAS-E3.1 — somente leitura. A ação "Confirmar
// primeiro mostruário" (só Tania) entra na E3.2.

const columnHelper = createColumnHelper<IndicacaoAdmin>()

const columns = [
  columnHelper.display({
    id: "candidata",
    header: "Candidata",
    cell: (info) => {
      const candidata = info.row.original.candidata
      if (!candidata) return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{candidata.nome}</span>
          {candidata.cidade && <span className="text-xs text-muted-foreground">{candidata.cidade}</span>}
        </div>
      )
    },
  }),
  columnHelper.display({
    id: "embaixadora",
    header: "Indicada por",
    cell: (info) => {
      const { embaixadora, codigo_referral_usado } = info.row.original
      return (
        <div className="flex flex-col">
          <span>{embaixadora?.nome ?? "—"}</span>
          <span className="font-mono text-xs tracking-wide text-muted-foreground">{codigo_referral_usado}</span>
        </div>
      )
    },
  }),
  columnHelper.display({
    id: "recrutamento",
    header: "Recrutamento",
    cell: (info) => {
      const situacao = candidataSituacao(info.row.original)
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={situacao.variant}>{situacao.label}</Badge>
          {situacao.detalhe && <span className="text-xs text-muted-foreground">{situacao.detalhe}</span>}
        </div>
      )
    },
  }),
  columnHelper.display({
    id: "recompensa",
    header: "Recompensa",
    cell: (info) => {
      const situacao = recompensaSituacao(info.row.original)
      return <Badge variant={situacao.variant}>{situacao.label}</Badge>
    },
  }),
  columnHelper.accessor("indicada_em", {
    header: "Indicada em",
    cell: (info) => formatDate(info.getValue()),
  }),
]

interface IndicacoesTableProps {
  indicacoes: IndicacaoAdmin[]
  isLoading: boolean
}

export function IndicacoesTable({ indicacoes, isLoading }: IndicacoesTableProps) {
  const table = useReactTable({
    data: indicacoes,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (indicacoes.length === 0) {
    return (
      <EmptyState
        title="Nenhuma indicação ainda"
        description="Quando uma candidata se inscrever pelo link de uma Embaixadora, ela aparecerá aqui."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
