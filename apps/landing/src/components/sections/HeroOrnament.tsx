import { BRAND } from "@tania-joias/shared"
import { motion } from "framer-motion"

/**
 * Composição visual decorativa do Hero — substitui a foto de banco de imagens
 * (sem licença de uso) por uma peça gráfica própria: gradiente dourado/preto
 * + um pingente de joia estilizado em line-art, com uma corrente de contas.
 * Tudo em SVG, sem assets externos.
 */
export function HeroOrnament() {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#1c1c1c] to-black shadow-2xl">
      <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-gold/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-64 rounded-full bg-gold/10 blur-3xl" />

      <motion.svg
        viewBox="0 0 320 400"
        className="absolute inset-0 size-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <defs>
          <linearGradient id="gold-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8D3A2" />
            <stop offset="100%" stopColor="#C6A664" />
          </linearGradient>
        </defs>

        {/* Corrente decorativa */}
        <motion.path
          d="M60 70 C 120 20, 200 20, 260 70"
          fill="none"
          stroke="url(#gold-stroke)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
        />
        {Array.from({ length: 11 }).map((_, i) => {
          const t = i / 10
          const x = 60 + t * 200
          const y = 70 - Math.sin(t * Math.PI) * 46
          return <circle key={i} cx={x} cy={y} r={2.4} fill="#C6A664" opacity={0.9} />
        })}

        {/* Pingente — gema facetada */}
        <motion.g
          initial={{ y: -6 }}
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <path
            d="M160 70 L120 130 L160 260 L200 130 Z"
            fill="none"
            stroke="url(#gold-stroke)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M120 130 L200 130 M160 70 L140 130 M160 70 L180 130 M140 130 L160 260 M180 130 L160 260"
            fill="none"
            stroke="url(#gold-stroke)"
            strokeWidth="1"
            opacity={0.75}
          />
          <path d="M160 70 L120 130 L160 260 L200 130 Z" fill="#C6A664" opacity={0.06} />
        </motion.g>

        {/* Detalhes soltos, tipo pedras avulsas */}
        <circle cx="88" cy="300" r="5" fill="none" stroke="url(#gold-stroke)" strokeWidth="1.2" />
        <circle cx="240" cy="250" r="3.5" fill="#C6A664" opacity={0.7} />
        <circle cx="252" cy="330" r="6" fill="none" stroke="url(#gold-stroke)" strokeWidth="1.2" />
      </motion.svg>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-6">
        <p className="font-display text-lg italic text-gold/90">{BRAND.nomeCurto}</p>
        <p className="text-xs tracking-wide text-white/70">{BRAND.slogan}</p>
      </div>
    </div>
  )
}
