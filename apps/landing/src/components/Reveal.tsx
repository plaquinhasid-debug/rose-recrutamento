import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}

/**
 * Reveal suave ao rolar até o elemento. Feito com IntersectionObserver +
 * transição CSS (sem biblioteca de animação), pra página ficar leve no
 * celular. Respeita "reduzir movimento" do sistema (ver `.reveal` no CSS).
 */
export function Reveal({ children, className, delay = 0, y = 24 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const style = { "--reveal-y": `${y}px`, transitionDelay: `${delay}s` } as CSSProperties

  return (
    <div ref={ref} className={cn("reveal", visible && "is-visible", className)} style={style}>
      {children}
    </div>
  )
}
