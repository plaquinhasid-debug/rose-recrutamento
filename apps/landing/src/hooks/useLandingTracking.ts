import { useEffect } from "react"

import { hasLoggedOnce, markLoggedOnce } from "@/lib/tracking"
import type { UtmParams } from "@/lib/tracking"

/**
 * Registra os eventos de topo de funil assim que a landing page monta:
 * - `landing_view`: sempre, uma vez por sessão.
 * - `ad_click`: apenas se a URL trouxe `utm_source` (clique vindo de anúncio),
 *   também uma vez por sessão.
 */
export function useLandingTracking(sessionId: string, utm: UtmParams): void {
  useEffect(() => {
    // `/ficha/:token` é uma página pós-aprovação separada, não o topo do
    // funil — não deve contar como `landing_view`/`ad_click`.
    if (window.location.pathname.startsWith("/ficha/")) return

    // O cliente do Supabase só é baixado depois que a página aparece.
    const logEvent: typeof import("@/lib/api").logEvent = (params) =>
      import("@/lib/api").then((m) => m.logEvent(params))

    if (!hasLoggedOnce("landing_view")) {
      markLoggedOnce("landing_view")
      void logEvent({
        tipoEvento: "landing_view",
        sessionId,
        campanha: utm.utm_campaign ?? null,
        origem: utm.utm_source ?? null,
      })
    }

    if (utm.utm_source && !hasLoggedOnce("ad_click")) {
      markLoggedOnce("ad_click")
      void logEvent({
        tipoEvento: "ad_click",
        sessionId,
        campanha: utm.utm_campaign ?? null,
        origem: utm.utm_source ?? null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
