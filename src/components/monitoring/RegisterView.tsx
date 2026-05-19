// Path: src/components/monitoring/RegisterView.tsx
import { useState, useEffect, useCallback } from "react"
import { Table, RefreshCw, ChevronDown, LayoutGrid, Eye } from "lucide-react"
import { getAllMachines, getConfig } from "@/lib/commands"
import type { Machine, MachineState, SimulatorConfig } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const DEFAULT_MAPPING = {
  state: 20, door_status: 21, error_flag: 22, time_min: 23, time_sec: 24,
  water_level: 28, temperature: 30, rpm: 32, program: 34, coins: 37, total_coins: 38, machine_id: 40, error_code: 60
}

function getRegisterMetaList(m: Machine, config: SimulatorConfig | null) {
  const map = m.machine_type === "Washer"
    ? config?.washer_mapping ?? DEFAULT_MAPPING
    : config?.dryer_mapping ?? DEFAULT_MAPPING;

  const stateCode = (s: MachineState) =>
    s === "Idle" || s === "Completed" ? 1 : 3

  return [
    { addr: 40000 + map.state,       name: "STATE",       desc: "Machine state code", value: stateCode(m.state) },
    { addr: 40000 + map.door_status, name: "DOOR",        desc: "Door status (0-6)", value: m.door_status },
    { addr: 40000 + map.error_flag,  name: "ERR_FLAG",    desc: "Error present flag", value: m.error_code > 0 ? 1 : 0 },
    { addr: 40000 + map.time_min,    name: "TIME_MIN",    desc: "Time remaining minutes", unit: "min", value: Math.floor(m.time_remaining / 60) },
    { addr: 40000 + map.time_sec,    name: "TIME_SEC",    desc: "Time remaining seconds", unit: "s", value: m.time_remaining % 60 },
    { addr: 40000 + map.water_level, name: "WATER",       desc: "Water level",            unit: "%", value: m.water_level },
    { addr: 40000 + map.temperature, name: "TEMP_x10",    desc: "Temperature × 10",       unit: "°C×10", value: Math.round(m.temperature * 10) },
    { addr: 40000 + map.rpm,         name: "RPM",         desc: "Drum speed",             unit: "rpm", value: m.rpm },
    { addr: 40000 + map.program,     name: "PROGRAM",     desc: "Active program ID (1-5)", value: m.program },
    { addr: 40000 + map.coins,       name: "COINS",       desc: "Current credit balance",  unit: "฿", value: m.coins },
    { addr: 40000 + map.total_coins, name: "TOTAL_COINS", desc: "Lifetime coin total",     unit: "฿", value: m.total_coins },
    { addr: 40000 + map.machine_id,  name: "UNIT_ID",     desc: "Modbus slave unit ID", value: m.id },
    { addr: 40000 + map.error_code,  name: "ERR_CODE",    desc: "Error code (0=none)", value: m.error_code },
  ]
}

const STATE_NAMES: Record<number, string> = {
  1: "Idle/Done",
  3: "Running",
}

const DOOR_NAMES: Record<number, string> = {
  0: "Idle",
  1: "Open",
  2: "Closed",
  3: "Locked",
  4: "Error",
  5: "Locking",
  6: "Unlocking",
}

function humanize(name: string, val: number): string {
  if (name === "STATE") return STATE_NAMES[val] ?? `${val}`
  if (name === "DOOR") return DOOR_NAMES[val] ?? `${val}`
  if (name === "ERR_FLAG") return val ? "YES" : "NO"
  if (name === "TEMP_x10") return `${(val / 10).toFixed(1)}`
  return String(val)
}

export function RegisterView() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [config, setConfig] = useState<SimulatorConfig | null>(null)
  const [selectedId, setSelected] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid")
  const [tick, setTick] = useState(0)

  const fetchMachines = useCallback(async () => {
    try {
      setMachines(await getAllMachines())
    } catch {
      /* ignore */
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      setConfig(await getConfig())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    fetchMachines()
    fetchConfig()
    const t = setInterval(() => {
      fetchMachines()
      setTick(n => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [fetchMachines, fetchConfig])

  // Auto-select first machine if single view is active and none is selected
  useEffect(() => {
    if (machines.length > 0 && selectedId === null) {
      setSelected(machines[0].id)
    }
  }, [machines, selectedId])

  const activeMachine = machines.find(m => m.id === selectedId) ?? null
  const activeRegisters = activeMachine ? getRegisterMetaList(activeMachine, config) : []

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 flex-shrink-0 bg-muted/20">
        <Table size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">REGISTER MONITOR</span>

        {/* View Mode Toggle */}
        <div className="flex items-center border rounded-md ml-3 p-0.5 bg-background">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-6 px-2 text-[10px] gap-1 font-semibold",
              viewMode === "grid" ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground"
            )}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid size={12} /> All Grid
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-6 px-2 text-[10px] gap-1 font-semibold",
              viewMode === "single" ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground"
            )}
            onClick={() => setViewMode("single")}
          >
            <Eye size={12} /> Single focus
          </Button>
        </div>

        {/* Machine selector (only shown in single focus mode) */}
        {viewMode === "single" && (
          <div className="relative ml-2 animate-in fade-in zoom-in-95 duration-150">
            <select
              className="h-7 rounded-md border border-input bg-background pl-2 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
              value={selectedId ?? ""}
              onChange={e => setSelected(Number(e.target.value))}
            >
              {machines.length === 0 && <option value="">No machines</option>}
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.machine_type} #{m.id} — {m.state}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        )}

        <Badge variant="secondary" className="text-[10px] h-5 ml-2">
          {machines.length} active multi-slaves
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "text-[10px] font-mono",
              tick % 2 === 0 ? "text-primary" : "text-muted-foreground"
            )}
          >
            ● LIVE
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={fetchMachines}>
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      {/* Main content viewport */}
      <div className="flex-1 overflow-y-auto p-4" id="register-content">
        {machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-xs gap-2">
            <Table size={40} strokeWidth={1} className="opacity-40" />
            <span className="font-semibold">No active machines in simulation</span>
            <span className="opacity-60 text-[10px]">Add some machines in the Control Fleet first.</span>
          </div>
        ) : viewMode === "grid" ? (
          /* ================= GRID VIEW OF ALL MACHINES ================= */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {machines.map(m => {
              const regs = getRegisterMetaList(m, config)
              return (
                <div
                  key={m.id}
                  className="rounded-xl border bg-card/60 shadow-sm overflow-hidden flex flex-col border-border hover:border-primary/30 transition-all duration-200"
                >
                  {/* Machine Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs">
                        {m.machine_type} #{m.id}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 scale-95 origin-left">
                        ID: {m.id}
                      </Badge>
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border">
                      Slave ID: {m.id}
                    </span>
                  </div>

                  {/* Registers compact table */}
                  <div className="p-2.5 flex-1 space-y-1">
                    {/* Header line */}
                    <div className="grid grid-cols-[60px_90px_1fr_50px] gap-1 text-[9px] font-bold text-muted-foreground/80 px-1 border-b pb-1">
                      <span>ADDRESS</span>
                      <span>REGISTER</span>
                      <span>DESC</span>
                      <span className="text-right">VAL</span>
                    </div>

                    {/* Data lines */}
                    <div className="space-y-0.5 max-h-[280px] overflow-y-auto pr-0.5 font-mono text-[10px]">
                      {regs.map(r => {
                        const isNonZero = r.value !== 0
                        return (
                          <div
                            key={r.addr}
                            className={cn(
                              "grid grid-cols-[60px_90px_1fr_50px] gap-1 py-0.5 px-1 rounded transition-colors",
                              isNonZero ? "bg-primary/5 text-foreground" : "text-muted-foreground/60 hover:bg-muted/10"
                            )}
                          >
                            <span className="opacity-60">{r.addr}</span>
                            <span className="font-semibold text-[9px] text-primary">{r.name}</span>
                            <span className="text-[9px] truncate opacity-80" title={r.desc}>
                              {humanize(r.name, r.value)}
                            </span>
                            <span className={cn("text-right font-bold", isNonZero && "text-foreground")}>
                              {r.value}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ================= SINGLE DETAILED VIEW ================= */
          <div className="max-w-4xl mx-auto space-y-3">
            {activeMachine && (
              <div className="space-y-1 animate-in fade-in zoom-in-98 duration-200">
                {/* Machine header */}
                <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-3 mb-3">
                  <span className="font-bold text-sm">
                    {activeMachine.machine_type} #{activeMachine.id}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {activeMachine.state}
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    Modbus ID: {activeMachine.id}
                  </span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[80px_100px_1fr_80px] gap-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase border-b">
                  <span>Address</span>
                  <span>Name</span>
                  <span>Description / Real Value</span>
                  <span className="text-right">Register Val</span>
                </div>

                {/* Register rows */}
                <div className="space-y-1">
                  {activeRegisters.map(r => (
                    <div
                      key={r.addr}
                      className={cn(
                        "grid grid-cols-[80px_100px_1fr_80px] gap-2 px-2 py-1.5 rounded-md text-[11px] items-center",
                        "hover:bg-muted/30 transition-colors",
                        r.value !== 0 && "bg-primary/5"
                      )}
                    >
                      <span className="font-mono text-muted-foreground">{r.addr}</span>
                      <span className="font-mono font-bold text-primary text-[10px]">{r.name}</span>
                      <span className="text-muted-foreground text-[10px] flex items-center gap-1.5">
                        <span>{r.desc}</span>
                        {r.unit && <span className="text-muted-foreground/60">({r.unit})</span>}
                        <span className="text-muted-foreground/40 font-mono">|</span>
                        <span className="text-primary/80 font-bold bg-muted px-1.5 py-0.5 rounded scale-90">
                          {humanize(r.name, r.value)} {r.unit ?? ""}
                        </span>
                      </span>
                      <div className="text-right font-mono font-bold">
                        <span className={cn(r.value !== 0 ? "text-foreground" : "text-muted-foreground/50")}>
                          {r.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
