import { BRAND } from "@tania-joias/shared"
import * as React from "react"
import { Outlet, useLocation } from "react-router-dom"

import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/leads": "Leads",
  "/crm": "CRM",
  "/embaixadoras": "Embaixadoras",
  "/relatorios": "Relatórios",
  "/radar": "Radar da Sofia",
  "/configuracoes": "Configurações",
}

function titleForPath(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname]
  const match = Object.keys(TITLES).find(
    (key) => key !== "/" && pathname.startsWith(key),
  )
  return match ? TITLES[match] : `${BRAND.nome}`
}

export function AppLayout() {
  const [collapsed, setCollapsed] = React.useState(false)
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onToggleSidebar={() => setCollapsed((v) => !v)}
          title={titleForPath(location.pathname)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
