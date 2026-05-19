// Path: src/components/app-sidebar.tsx
import * as React from "react"
import {
  LayoutGrid,
  Cable,
  ScrollText,
  Table,
  Binary,
  SlidersHorizontal,
  Settings2,
  Waves,
  Wind,
  Cpu,
  type LucideIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { getAppInfo } from "@/lib/commands"

export type AppView =
  | "fleet"
  | "modbus"
  | "logs"
  | "registers"
  | "hex"
  | "settings"
  | "programs"
  | "plc"

interface NavItem {
  id: AppView
  label: string
  icon: LucideIcon
  badge?: string | number
}

const NAV_MAIN: NavItem[] = [
  { id: "fleet",     label: "Machine Fleet",    icon: LayoutGrid },
  { id: "modbus",    label: "RS485 Modbus",      icon: Cable },
]

const NAV_TOOLS: NavItem[] = [
  { id: "logs",      label: "Event Stream",      icon: ScrollText },
  { id: "registers", label: "Register Monitor",  icon: Table },
  { id: "hex",       label: "Hex Traffic",       icon: Binary },
  { id: "plc",       label: "Virtual PLC Client", icon: Cpu },
]

const NAV_SYSTEM: NavItem[] = [
  { id: "programs",  label: "Program Editor",    icon: SlidersHorizontal },
  { id: "settings",  label: "App Settings",      icon: Settings2 },
]

export const VIEW_ICON: Record<AppView, LucideIcon> = {
  fleet:     LayoutGrid,
  modbus:    Cable,
  logs:      ScrollText,
  registers: Table,
  hex:       Binary,
  programs:  SlidersHorizontal,
  settings:  Settings2,
  plc:       Cpu,
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeView?: AppView
  onNavigate?: (view: AppView) => void
  fleetCount?: number
  activeCount?: number
  errorCount?: number
  modbusConnected?: boolean
}

function NavGroup({
  label,
  items,
  activeView,
  onNavigate,
}: {
  label: string
  items: NavItem[]
  activeView?: AppView
  onNavigate?: (view: AppView) => void
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(item => {
            const Icon = item.icon
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={activeView === item.id}
                  onClick={() => onNavigate?.(item.id)}
                  className={cn(
                    "cursor-pointer transition-all duration-150",
                    activeView === item.id && "font-semibold",
                  )}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className={cn(
                      "ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5",
                      item.id === "fleet" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({
  activeView = "fleet",
  onNavigate,
  fleetCount = 0,
  activeCount = 0,
  errorCount = 0,
  modbusConnected = false,
  ...props
}: AppSidebarProps) {
  const [version, setVersion] = React.useState<string>("2.0.2")

  React.useEffect(() => {
    getAppInfo()
      .then(info => setVersion(info.version))
      .catch(() => {})
  }, [])

  const navMain = NAV_MAIN.map(item => {
    if (item.id === "fleet" && fleetCount > 0)
      return { ...item, badge: fleetCount }
    if (item.id === "modbus" && modbusConnected)
      return { ...item, badge: "●" }
    return item
  })

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ── Header ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <div className="flex items-center gap-2 cursor-default select-none">
                <div className="flex items-center gap-0.5 text-primary">
                  <Waves size={18} strokeWidth={2.5} />
                  <Wind size={14} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold leading-tight">Laundry</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Simulator v{version}</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Status pills */}
        <div className="px-2 pb-1 flex flex-wrap gap-1">
          <span className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded-full border",
            activeCount > 0
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-muted-foreground",
          )}>
            {activeCount} active
          </span>
          {errorCount > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-destructive/40 text-destructive bg-destructive/10">
              {errorCount} fault{errorCount > 1 ? "s" : ""}
            </span>
          )}
          <span className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded-full border",
            modbusConnected
              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
              : "border-border text-muted-foreground",
          )}>
            {modbusConnected ? "RS485 LIVE" : "RS485 IDLE"}
          </span>
        </div>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent>
        <NavGroup label="Control"    items={navMain}    activeView={activeView} onNavigate={onNavigate} />
        <SidebarSeparator />
        <NavGroup label="Monitoring" items={NAV_TOOLS}  activeView={activeView} onNavigate={onNavigate} />
        <SidebarSeparator />
        <NavGroup label="System"     items={NAV_SYSTEM} activeView={activeView} onNavigate={onNavigate} />
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter>
        <div className="px-3 py-2 text-[9px] text-muted-foreground/50 font-mono">
          Tauri v2 · React 19 · RS485
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
