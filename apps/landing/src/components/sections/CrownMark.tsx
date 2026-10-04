/** A coroa geométrica do logo da Rosé, redesenhada em traço (herda a cor do texto). */
export function CrownMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 70" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2 38 L28 64 L92 64 L118 38" />
        <path d="M2 38 L60 58 L118 38" />
        <path d="M60 58 L60 64" />
        <path d="M27 14 L27 52 M93 14 L93 52" />
        <path d="M27 14 L60 52 L93 14" />
        <path d="M60 2 L27 40 M60 2 L93 40" />
        <path d="M60 2 L44 36 M60 2 L76 36" />
      </g>
    </svg>
  )
}
