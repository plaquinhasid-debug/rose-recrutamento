import type { LeadWithAnalysis } from "@/hooks/useLeads"

function inicioDoMes(): Date {
  const agora = new Date()
  return new Date(agora.getFullYear(), agora.getMonth(), 1)
}

function noMes(data: string | null | undefined, desde: Date): boolean {
  return Boolean(data) && new Date(data as string) >= desde
}

/** Os 4 números que importam no mês corrente. */
export function calcularResumoDoMes(leads: LeadWithAnalysis[], desde = inicioDoMes()) {
  return {
    candidatas: leads.filter((l) => noMes(l.created_at, desde)).length,
    preAprovadas: leads.filter((l) => l.status === "aprovada" && noMes(l.created_at, desde)).length,
    fichas: leads.filter((l) => l.leads_ficha.some((f) => noMes(f.preenchido_em, desde))).length,
    ativas: leads.filter((l) => l.etapa_pos_aprovacao === "ativa" && noMes(l.ativada_em, desde)).length,
  }
}

export function ResumoDoMes({ leads }: { leads: LeadWithAnalysis[] }) {
  const r = calcularResumoDoMes(leads)
  const mes = new Date().toLocaleDateString("pt-BR", { month: "long" })
  const itens = [
    { label: "Candidatas", valor: r.candidatas },
    { label: "Pré-aprovadas", valor: r.preAprovadas },
    { label: "Fichas recebidas", valor: r.fichas },
    { label: "Ativas (pegaram a maleta)", valor: r.ativas },
  ]
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Em {mes}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {itens.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-4">
            <p className="font-display text-3xl font-semibold text-foreground">{item.valor}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
