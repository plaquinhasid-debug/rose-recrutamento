import { lazy, Suspense, useEffect, useState } from "react"

import { ChamadaFinal } from "@/components/sections/ChamadaFinal"
import { ComoFunciona } from "@/components/sections/ComoFunciona"
import { Depoimentos } from "@/components/sections/Depoimentos"
import { FAQ } from "@/components/sections/FAQ"
import { Footer } from "@/components/sections/Footer"
import { Header } from "@/components/sections/Header"
import { Hero } from "@/components/sections/Hero"
import { QuantoPossoGanhar } from "@/components/sections/QuantoPossoGanhar"
import { QuemSomos } from "@/components/sections/QuemSomos"
import { useLandingTracking } from "@/hooks/useLandingTracking"
import { useSessionId } from "@/hooks/useSessionId"
import { useUtmParams } from "@/hooks/useUtmParams"

// `/ficha/:token` é uma página pública separada (formulário pós-aprovação,
// sem IA/chat) — sem router de verdade no projeto, então o desvio é feito
// aqui mesmo, olhando a URL antes de montar a Landing normal.
// Carregados sob demanda: quem chega pelo anúncio baixa só a landing; o chat
// é buscado em segundo plano logo depois (ver `prefetchSofia`).
const loadSofia = () => import("@/components/sofia/SofiaAssistant")
const SofiaAssistant = lazy(() => loadSofia().then((m) => ({ default: m.SofiaAssistant })))
const FichaPage = lazy(() => import("@/pages/FichaPage").then((m) => ({ default: m.FichaPage })))
const PrivacyPolicy = lazy(() =>
  import("@/pages/PrivacyPolicy").then((m) => ({ default: m.PrivacyPolicy })),
)

function prefetchSofia() {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
  idle(() => void loadSofia())
}

const FICHA_PATH_MATCH = /^\/ficha\/([^/]+)\/?$/

function LandingPage() {
  const [sofiaOpen, setSofiaOpen] = useState(false)
  // Monta o chat só na 1ª abertura e mantém montado (não perde o progresso).
  const [sofiaMounted, setSofiaMounted] = useState(false)
  const sessionId = useSessionId()
  const utm = useUtmParams()

  useLandingTracking(sessionId, utm)

  useEffect(() => {
    if (document.readyState === "complete") prefetchSofia()
    else window.addEventListener("load", prefetchSofia, { once: true })
  }, [])

  const openSofia = () => {
    setSofiaMounted(true)
    setSofiaOpen(true)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main>
        <Hero onOpenSofia={openSofia} />
        <QuemSomos onOpenSofia={openSofia} />
        <ComoFunciona onOpenSofia={openSofia} />
        <QuantoPossoGanhar />
        <Depoimentos />
        <FAQ />
        <ChamadaFinal onOpenSofia={openSofia} />
      </main>

      <Footer />

      {sofiaMounted && (
        <Suspense fallback={null}>
          <SofiaAssistant open={sofiaOpen} onOpenChange={setSofiaOpen} />
        </Suspense>
      )}
    </div>
  )
}

function App() {
  if (window.location.pathname === "/politica-de-privacidade") {
    return (
      <Suspense fallback={null}>
        <PrivacyPolicy />
      </Suspense>
    )
  }

  const fichaMatch = window.location.pathname.match(FICHA_PATH_MATCH)
  if (fichaMatch) {
    return (
      <Suspense fallback={null}>
        <FichaPage token={fichaMatch[1]} />
      </Suspense>
    )
  }


  return <LandingPage />
}

export default App
