import { IPR_PESOS, IPR_THRESHOLDS } from "@tania-joias/shared"

import { cn } from "@/lib/utils"
import type { IprBreakdown as IprBreakdownType } from "@/types"

const CRITERIA_LABELS: Record<keyof typeof IPR_PESOS, string> = {
  trabalha: "Trabalha atualmente",
  experiencia_vendas: "Experiência em vendas",
  whatsapp: "Possui WhatsApp",
  instagram: "Possui Instagram",
  cidade_atendida: "Cidade atendida",
  profissao_preferida: "Profissão preferida (escola, saúde, beleza)",
}

interface IprBreakdownProps {
  score: number
  breakdown: IprBreakdownType | null
}

export function IprBreakdown({ score, breakdown }: IprBreakdownProps) {
  const statusColor =
    score >= IPR_THRESHOLDS.aprovar
      ? "text-success"
      : score >= IPR_THRESHOLDS.analiseMin
        ? "text-gold-foreground"
        : "text-destructive"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Índice de Potencial (IPR)</p>
        <span className={cn("text-lg font-semibold tabular-nums", statusColor)}>{score}/100</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            score >= IPR_THRESHOLDS.aprovar
              ? "bg-success"
              : score >= IPR_THRESHOLDS.analiseMin
                ? "bg-gold"
                : "bg-destructive",
          )}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Aprovação automática a partir de {IPR_THRESHOLDS.aprovar} · Análise manual a partir de{" "}
        {IPR_THRESHOLDS.analiseMin}
      </p>

      {breakdown ? (
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          {(Object.keys(IPR_PESOS) as Array<keyof typeof IPR_PESOS>).map((key) => {
            const peso = IPR_PESOS[key]
            const pontos = breakdown[key] ?? 0
            const pct = peso > 0 ? Math.min(100, Math.max(0, (pontos / peso) * 100)) : 0
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{CRITERIA_LABELS[key]}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {pontos}/{peso}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhum detalhamento de IPR disponível para este lead.
        </p>
      )}
    </div>
  )
}
