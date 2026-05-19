// Path: src/App.tsx
// Phase 3 (v0.3) — Full Fleet UI + Navigation

import type { CSSProperties } from "react"
import { useState, useEffect, useCallback } from "react"
import { listen } from "@tauri-apps/api/event"
import {
  LayoutGrid, ScrollText, Table, Binary,
  SlidersHorizontal, Settings2,
  CheckCircle2, XCircle, AlertTriangle, Info,
  Server, Zap,
  type LucideIcon,
} from "lucide-react"
import { getAllMachines, getConfig, getModbusStatus, setSimulationMode } from "@/lib/commands"
import type { Machine, SimulatorConfig, LogEntry, ModbusStatus } from "@/types"
import { useToast } from "@/hooks/useToast"
import { check as checkUpdate } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

import { AppSidebar, type AppView } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { MachineCard } from "@/components/machine/MachineCard"
import { AddMachineCard } from "@/components/machine/AddMachineCard"
import { Rs485Panel } from "@/components/modbus/Rs485Panel"
import { EventStreamView } from "@/components/monitoring/EventStreamView"
import { RegisterView } from "@/components/monitoring/RegisterView"
import { HexTrafficView } from "@/components/monitoring/HexTrafficView"
import { ProgramEditorView } from "@/components/monitoring/ProgramEditorView"
import { AppSettingsView } from "@/components/monitoring/AppSettingsView"
import { VirtualPlcView } from "@/components/monitoring/VirtualPlcView"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── Placeholder panels ──────────────────────────────────────────
const PLACEHOLDER_META: Record<string, { icon: LucideIcon; label: string }> = {
  logs: { icon: ScrollText, label: "Event Stream" },
  registers: { icon: Table, label: "Register Monitor" },
  hex: { icon: Binary, label: "Hex Traffic Monitor" },
  programs: { icon: SlidersHorizontal, label: "Program Editor" },
  settings: { icon: Settings2, label: "App Settings" },
}

function PlaceholderPanel({ view }: { view: AppView }) {
  const meta = PLACEHOLDER_META[view] ?? { icon: LayoutGrid, label: view }
  const Icon = meta.icon
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
      <Icon size={52} strokeWidth={1.2} />
      <p className="text-lg font-semibold">{meta.label}</p>
      <p className="text-sm opacity-60">Coming in Phase 4–7</p>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<AppView>("fleet")
  const [machines, setMachines] = useState<Machine[]>([])
  const [config, setConfig] = useState<SimulatorConfig | null>(null)
  const [modbusStatus, setModbus] = useState<ModbusStatus | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [simEnabled, setSimEnabled] = useState(true)
  const [simSpeed, setSimSpeed] = useState(1)
  const { toasts, show: addToast } = useToast()

  // ── Data fetching ──────────────────────────────────────────
  const fetchMachines = useCallback(async () => {
    try { setMachines(await getAllMachines()) }
    catch (err) { addToast("error", `Failed to load machines: ${err}`) }
  }, [addToast])

  const fetchConfig = useCallback(async () => {
    try { setConfig(await getConfig()) } catch { /* ignore */ }
  }, [])

  const pollModbus = useCallback(async () => {
    try { setModbus(await getModbusStatus()) } catch { /* ignore */ }
  }, [])

  const handleSimToggle = useCallback(async (enabled: boolean) => {
    setSimEnabled(enabled)
    try { await setSimulationMode(enabled, simSpeed) }
    catch (err) { addToast("error", String(err)) }
  }, [simSpeed, addToast])

  const handleSimSpeed = useCallback(async (speed: number) => {
    setSimSpeed(speed)
    try { await setSimulationMode(simEnabled, speed) }
    catch (err) { addToast("error", String(err)) }
  }, [simEnabled, addToast])

  useEffect(() => {
    fetchMachines()
    fetchConfig()
    pollModbus()

    const t1 = setInterval(fetchMachines, 2000)
    const t2 = setInterval(pollModbus, 1500)

    // Fast refresh on simulation tick events
    const unlistenUpdated = listen("machines-updated", () => fetchMachines())

    const unlistenLog = listen<LogEntry>("log-event", e =>
      setLogs(prev => [...prev.slice(-199), e.payload])
    )
    return () => {
      clearInterval(t1)
      clearInterval(t2)
      unlistenUpdated.then(fn => fn())
      unlistenLog.then(fn => fn())
    }
  }, [fetchMachines, fetchConfig, pollModbus])

  // ── Auto Update System ─────────────────────────────────────
  useEffect(() => {
    async function performAutoUpdate() {
      try {
        const update = await checkUpdate()
        if (update) {
          addToast("info", `New update available: v${update.version}. Downloading...`)
          
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case "Started":
                console.log("Auto-update download started.")
                break
              case "Progress":
                console.log(`Auto-update downloaded ${event.data.chunkLength} bytes.`)
                break
              case "Finished":
                addToast("success", "Update installed successfully! Restarting app...")
                break
            }
          })

          await relaunch()
        }
      } catch (err) {
        console.error("Auto update failed:", err)
      }
    }

    const timer = setTimeout(performAutoUpdate, 5000)
    return () => clearTimeout(timer)
  }, [addToast])

  // ── Derived stats ──────────────────────────────────────────
  const activeCount = machines.filter(m => !["Idle", "Completed", "Error"].includes(m.state)).length
  const errorCount = machines.filter(m => m.state === "Error").length
  const connected = modbusStatus?.connected ?? false
  const nextId = machines.length > 0 ? Math.max(...machines.map(m => m.id)) + 1 : 1

  const totalWashers = machines.filter(m => m.machine_type === "Washer").length
  const totalDryers = machines.filter(m => m.machine_type === "Dryer").length

  // ── Render active view ─────────────────────────────────────
  function renderView() {
    switch (view) {
      case "fleet":
        return (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Summary + Sim Control bar */}
            <div className="flex items-center gap-3 border-b px-4 py-2 bg-muted/20 flex-shrink-0 flex-wrap gap-y-1">
              {/* Fleet stats */}
              <span className="text-xs text-muted-foreground font-medium">FLEET</span>
              <Badge variant="secondary">{machines.length} units</Badge>
              <span className={cn("text-xs font-medium", activeCount > 0 ? "text-primary" : "text-muted-foreground")}>
                ACTIVE
              </span>
              <Badge variant={activeCount > 0 ? "default" : "secondary"}>{activeCount}</Badge>
              {errorCount > 0 && (
                <>
                  <span className="text-xs text-destructive font-medium">FAULTS</span>
                  <Badge variant="destructive">{errorCount}</Badge>
                </>
              )}

              {/* Divider */}
              <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

              {/* Simulation controls */}
              <div className="flex items-center gap-2 ml-auto">
                {/* Speed */}
                <span className="text-xs text-muted-foreground font-medium hidden sm:inline">SPEED</span>
                <div className="flex gap-0.5">
                  {[1, 2, 5, 10].map(s => (
                    <button
                      key={s}
                      onClick={() => handleSimSpeed(s)}
                      className={cn(
                        "h-6 w-8 rounded text-[10px] font-bold border transition-all",
                        simSpeed === s && simEnabled
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                {/* Sim toggle */}
                <button
                  onClick={() => handleSimToggle(!simEnabled)}
                  className={cn(
                    "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-semibold transition-all",
                    simEnabled
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", simEnabled ? "bg-primary animate-pulse" : "bg-muted-foreground/40")} />
                  {simEnabled ? "AUTO SIM" : "PAUSED"}
                </button>
              </div>
            </div>

            {/* Machine grid */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" data-ui-scroll-container>
              {/* Quick Stats Dashboard */}
              {machines.length > 0 && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  {/* Card 1: Total Fleet */}
                  <div className="rounded-xl border bg-card p-3 shadow-sm flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Server size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">TOTAL FLEET</p>
                      <p className="text-sm font-bold truncate">{machines.length} Machines</p>
                      <p className="text-[9px] text-muted-foreground truncate">{totalWashers} Washers · {totalDryers} Dryers</p>
                    </div>
                  </div>

                  {/* Card 2: Active Simulation */}
                  <div className="rounded-xl border bg-card p-3 shadow-sm flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                      activeCount > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground/60"
                    )}>
                      <Zap size={18} className={activeCount > 0 ? "animate-pulse" : ""} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">ACTIVE RUNNING</p>
                      <p className="text-sm font-bold truncate">{activeCount} Active</p>
                      <p className="text-[9px] text-muted-foreground truncate">
                        {errorCount > 0 ? `${errorCount} Alarm(s) active` : "Simulation running"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {machines.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <span className="text-4xl">🧺</span>
                  <p className="text-sm">No machines yet — add one below</p>
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {machines.map(machine => (
                  <MachineCard
                    key={machine.id}
                    machine={machine}
                    onRefresh={fetchMachines}
                    onToast={addToast}
                    config={config}
                  />
                ))}
                <AddMachineCard nextId={nextId} onAdd={fetchMachines} onToast={addToast} />
              </div>
            </div>
          </div>
        )

      case "modbus":
        return (
          <div className="flex-1 overflow-y-auto" data-ui-scroll-container>
            <Rs485Panel onToast={addToast} onRefresh={fetchMachines} />
          </div>
        )

      case "logs":
        return <EventStreamView />

      case "registers":
        return <RegisterView />

      case "hex":
        return <HexTrafficView />

      case "programs":
        return <ProgramEditorView onToast={addToast} />

      case "settings":
        return <AppSettingsView onToast={addToast} />

      case "plc":
        return <VirtualPlcView onToast={addToast} />

      default:
        return <PlaceholderPanel view={view} />
    }
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        style={{
          "--sidebar-width": "calc(var(--spacing) * 58)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties}
      >
        <AppSidebar
          variant="inset"
          activeView={view}
          onNavigate={setView}
          fleetCount={machines.length}
          activeCount={activeCount}
          errorCount={errorCount}
          modbusConnected={connected}
        />

        <SidebarInset>
          <SiteHeader view={view} />

          <div className="flex flex-1 flex-col overflow-hidden">
            {renderView()}

            {/* Mini log strip */}
            {logs.length > 0 && (
              <div className="border-t bg-muted/10 px-4 py-1 flex items-center gap-2 text-[10px] font-mono flex-shrink-0">
                <span className={cn("font-bold", {
                  "text-destructive": logs.at(-1)?.level === "ERROR",
                  "text-primary": logs.at(-1)?.level === "MODBUS",
                  "text-amber-400": logs.at(-1)?.level === "SCENARIO",
                  "text-muted-foreground": logs.at(-1)?.level === "INFO",
                })}>
                  [{logs.at(-1)?.level}]
                </span>
                <span className="text-muted-foreground truncate">{logs.at(-1)?.message}</span>
                <span className="ml-auto text-muted-foreground/40 shrink-0">{logs.at(-1)?.timestamp}</span>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Toast overlay */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const ToastIcon: LucideIcon =
            t.type === "success" ? CheckCircle2 :
              t.type === "error" ? XCircle :
                t.type === "warning" ? AlertTriangle : Info
          return (
            <div
              key={t.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-xl backdrop-blur-sm",
                "animate-in slide-in-from-right-5 duration-200",
                t.type === "success" && "border-emerald-500/30 bg-emerald-950/90 text-emerald-300",
                t.type === "error" && "border-destructive/30 bg-red-950/90 text-red-300",
                t.type === "warning" && "border-yellow-500/30 bg-yellow-950/90 text-yellow-300",
                t.type === "info" && "border-blue-500/30 bg-blue-950/90 text-blue-300",
              )}
            >
              <ToastIcon size={15} />
              <span className="max-w-xs">{t.msg}</span>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
