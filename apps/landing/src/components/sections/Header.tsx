import { BRAND } from "@tania-joias/shared"
const NAV_LINKS = [
  { href: "#quem-somos", label: "Quem somos" },
  { href: "#como-funciona", label: "Como funciona" },
  ...(BRAND.depoimentos.length > 0 ? [{ href: "#depoimentos", label: "Depoimentos" }] : []),
  { href: "#faq", label: "Dúvidas" },
]

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a
          href="#top"
          className="shrink-0 font-display text-lg font-semibold tracking-wide text-foreground sm:text-xl"
        >
          {BRAND.nomeCurto}
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
