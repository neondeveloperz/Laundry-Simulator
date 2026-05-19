// Path: src/components/site-header.tsx
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { VIEW_ICON, type AppView } from "@/components/app-sidebar"

const VIEW_LABEL: Record<AppView, string> = {
  fleet:     "Machine Fleet",
  modbus:    "RS485 Modbus",
  logs:      "Event Stream",
  registers: "Register Monitor",
  hex:       "Hex Traffic",
  programs:  "Program Editor",
  settings:  "App Settings",
  plc:       "Virtual PLC Client",
}

interface SiteHeaderProps {
  view?: AppView
}

export function SiteHeader({ view = "fleet" }: SiteHeaderProps) {
  const Icon = VIEW_ICON[view]
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Icon size={16} className="text-muted-foreground" />
        <h1 className="text-base font-semibold">{VIEW_LABEL[view]}</h1>
      </div>
    </header>
  )
}
