// Path: src/components/monitoring/RegisterView.tsx
import { useState, useEffect, useCallback } from "react"
import { Table, RefreshCw, ChevronDown, LayoutGrid, Eye } from "lucide-react"
import { getAllMachines, getConfig } from "@/lib/commands"
import type { Machine, SimulatorConfig } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const WASHER_DEFAULT_MAPPING = {
  water_level: 801,
  temperature: 802,
  time_min: 803,
  time_sec: 804,
  error_code: 805,
  rpm: 813,
  total_coins: 814,
  program: 818,
  state: 819,
  machine_id: 1,
  error_flag: 52,
  door_status: 110,
  coins: 835,
}

const DRYER_DEFAULT_MAPPING = {
  temperature: 801,
  state: 804,
  door_status: 804,
  time_min: 806,
  time_sec: 807,
  water_level: 0,
  rpm: 128,
  program: 307,
  coins: 834,
  total_coins: 836,
  machine_id: 1,
  error_code: 33,
  error_flag: 18,
}

function getRegisterMetaList(m: Machine, config: SimulatorConfig | null) {
  if (m.machine_type === "Washer") {
    const map = config?.washer_mapping ?? WASHER_DEFAULT_MAPPING;
    return [
      { addr: map.water_level, name: "WATER_LEVEL", desc: "Real-time water level", unit: "cm", value: m.water_level },
      { addr: map.temperature, name: "TEMPERATURE", desc: "Water temperature (1:1)", unit: "°C", value: Math.round(m.temperature) },
      { addr: map.time_min,    name: "STEP_MIN",    desc: "Active step remaining min", unit: "min", value: Math.floor(m.time_remaining / 60) },
      { addr: map.time_sec,    name: "STEP_SEC",    desc: "Active step remaining sec", unit: "s", value: m.time_remaining % 60 },
      { addr: map.error_code,  name: "ERR_CODE",    desc: "Prompt / Alarm code (0=OK)", value: m.error_code },
      { addr: map.rpm,         name: "DRUM_RPM",    desc: "Motor drum rotation speed", unit: "rpm", value: m.rpm },
      { addr: map.total_coins, name: "TOTAL_COINS", desc: "Lifetime coin total", unit: "฿", value: m.total_coins },
      { addr: map.program,     name: "PROGRAM",     desc: "Selected wash program (1-30)", value: m.program },
      { addr: map.state,       name: "STEP_ID",     desc: "Active phase (1:Fill, 2:Wash, 3:Rinse, 4:Spin)", value: m.time_remaining > 0 ? (m.current_step + 1) : 0 },
      { addr: 833,             name: "TOTAL_HOURS", desc: "Lifetime machine running hours", unit: "h", value: Math.floor(m.time_remaining / 3600) },
      { addr: map.coins,       name: "COINS",       desc: "Coins inserted current cycle", unit: "฿", value: m.coins },
      { addr: map.door_status, name: "DOOR_STATUS", desc: "Door closed status (1=OK, 0=Open)", value: m.door_status !== 1 ? 1 : 0 },
    ];
  } else {
    const map = config?.dryer_mapping ?? DRYER_DEFAULT_MAPPING;
    const dryerStateVal = m.door_status === 1 ? 0 : (m.state === "Idle" || m.state === "Completed") ? 1 : 2;
    return [
      { addr: map.temperature, name: "TEMP_ACTUAL",  desc: "Drum actual temperature (1:1)", unit: "°C", value: Math.round(m.temperature) },
      { addr: map.state,       name: "STATE_DOOR",   desc: "0=Door Open, 1=Idle, 2=Running", value: dryerStateVal },
      { addr: 805,             name: "TEMP_TARGET",  desc: "Set target temperature", unit: "°C", value: Math.round(m.set_temp) },
      { addr: map.time_min,    name: "TIME_MIN",     desc: "Cycle remaining minutes", unit: "min", value: Math.floor(m.time_remaining / 60) },
      { addr: map.time_sec,    name: "TIME_SEC",     desc: "Cycle remaining seconds", unit: "s", value: m.time_remaining % 60 },
      { addr: 811,             name: "TEMP_OUTLET",  desc: "Air exhaust temperature", unit: "°C", value: Math.round(m.temperature) },
      { addr: 813,             name: "TOTAL_HOURS",  desc: "Total running hours", unit: "h", value: Math.floor(m.time_remaining / 3600) },
      { addr: 814,             name: "TOTAL_MINS",   desc: "Total running minutes", unit: "min", value: Math.floor((m.time_remaining % 3600) / 60) },
      { addr: 817,             name: "TEMP_INLET",   desc: "Heater inlet temperature", unit: "°C", value: 75 },
      { addr: map.coins,       name: "COINS",        desc: "Coins in current cycle", unit: "฿", value: m.coins },
      { addr: 835,             name: "COINS_BOX",    desc: "Coins in cashbox", unit: "฿", value: m.total_coins },
      { addr: map.total_coins, name: "TOTAL_COINS",  desc: "Total lifetime coins", unit: "฿", value: m.total_coins },
      { addr: map.program,     name: "PROGRAM",      desc: "Selected heat (1:Low, 2:Mid, 3:High)", value: m.program },
    ];
  }
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
