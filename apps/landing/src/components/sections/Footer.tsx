import { BRAND } from "@tania-joias/shared"
import { Instagram, MapPin, Phone } from "lucide-react"

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-secondary/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <img src="/assets/rose-logo.webp"
            width={240}
            height={112} alt={BRAND.nome} className="h-14 w-auto" />
        <p className="text-xs text-muted-foreground">
          © {year} {BRAND.nome}. Todos os direitos reservados. Atendemos atualmente{" "}
          {BRAND.cidadesTexto}.
        </p>
        <a
          href={BRAND.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Instagram da ${BRAND.nome}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-gold"
        >
          <Instagram className="size-5" />
        </a>
      </div>

      <div className="mx-auto mt-6 flex max-w-6xl flex-col items-center gap-2 border-t border-border px-6 pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-center sm:gap-6">
        <a href="/politica-de-privacidade" className="py-2 hover:text-foreground">
          Política de Privacidade
        </a>
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          {BRAND.endereco}
        </span>
        <a href={`tel:${BRAND.telefoneTel}`} className="flex items-center gap-1.5 py-2 hover:text-foreground">
          <Phone className="size-3.5 shrink-0" />
          {BRAND.telefoneExibicao}
        </a>
      </div>
    </footer>
  )
}
