import { BRAND } from "@tania-joias/shared"
import { Reveal } from "@/components/Reveal"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const TIERS = BRAND.faixasGanho.map((f) => ({
  label: f.label,
  hours: f.horas,
  range: f.faixa,
  description: f.descricao,
  highlight: f.destaque,
}))

export function QuantoPossoGanhar() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Quanto posso ganhar
          </h2>
          <p className="mt-4 text-muted-foreground">
            Sua renda depende do seu tempo e dedicação. Veja faixas de referência de
            revendedoras em diferentes ritmos.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {TIERS.map((tier, index) => (
            <Reveal key={tier.label} delay={index * 0.1}>
              <Card
                className={
                  tier.highlight
                    ? "h-full border-gold/60 shadow-md ring-1 ring-gold/30"
                    : "h-full"
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{tier.label}</CardTitle>
                    {tier.highlight && <Badge variant="gold">Mais comum</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{tier.hours}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="font-display text-2xl font-semibold text-foreground">
                    {tier.range}
                  </p>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Valores de referência, baseados na experiência da operação da {BRAND.nome}. O
            ganho real depende do volume vendido e da comissão aplicável, e não constitui
            garantia de renda.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
