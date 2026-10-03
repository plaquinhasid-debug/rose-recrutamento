import { BRAND } from "@tania-joias/shared"
import { NavLink } from "react-router-dom"
import { KanbanSquare, Settings, Users } from "lucide-react"

import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { to: "/", label: "Candidatas (CRM)", icon: KanbanSquare, end: true },
  { to: "/leads", label: "Lista e busca", icon: Users },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-border px-4">
        {collapsed ? (
          <span className="font-display text-xl font-semibold text-gold">{BRAND.nome.slice(0, 1)}</span>
        ) : (
          <span className="font-display text-2xl font-medium tracking-tight text-foreground">
            {BRAND.nome}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                collapsed && "justify-center px-0",
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {!collapsed && (
          <p className="px-3 text-[11px] leading-tight text-muted-foreground">
            Painel Administrativo
            <br />
            Recrutamento de revendedoras
          </p>
        )}
      </div>
    </aside>
  )
}
