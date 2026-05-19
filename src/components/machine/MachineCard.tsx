// Path: src/components/machine/MachineCard.tsx
import { useState, useEffect } from "react"
import {
  BarChart3, X, Play, Square, SkipForward,
  AlertTriangle, Lock, Unlock, DoorOpen, DoorClosed,
  Waves, Wind, Droplets, RotateCw, Flame, CheckCircle2,
  Pause, CircleMinus,
} from "lucide-react"
import { trackedInvoke } from "@/lib/tauri"
import type { Machine, SimulatorConfig, Toast, MachineState } from "@/types"
import { STATE_PROGRESS } from "@/types"
import { formatTime, stateClass, stateToCode } from "@/utils/format"
import { Sparkline } from "./Sparkline"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── State icon map ─────────────────────────────────────────────
function StateIcon({ state, className }: { state: MachineState; className?: string }) {
  const props = { size: 22, className: cn("relative z-10", className) }
  switch (state) {
    case "Idle":      return <Pause {...props} />
    case "Filling":   return <Droplets {...props} />
    case "Washing":   return <Waves {...props} />
    case "Rinsing":   return <Droplets {...props} />
    case "Spinning":  return <RotateCw {...props} />
    case "Drying":    return <Flame {...props} />
    case "Completed": return <CheckCircle2 {...props} />
    case "Error":     return <AlertTriangle {...props} />
  }
}

interface MachineCardProps {
  machine: Machine
  onRefresh: () => void
  onToast: (type: Toast["type"], msg: string) => void
  config: SimulatorConfig | null
}

// ── Drum visual ───────────────────────────────────────────────
function MachineVisual({
  machine,
  tempHistory,
  waterHistory,
}: {
  machine: Machine
  tempHistory: number[]
  waterHistory: number[]
}) {
  const isActive   = !["Idle", "Completed", "Error"].includes(machine.state)
  const isSpinning = machine.state === "Spinning" || machine.state === "Drying"

  // Door icon helper
  function DoorIcon() {
    if (machine.door_status === 1) return <DoorOpen size={14} />
    if (machine.door_status === 3) return <Lock size={14} />
    return <DoorClosed size={14} />
  }

  return (
    <div className="flex items-center gap-3">
      {/* Drum */}
      <div className="relative flex-shrink-0">
        <div
          className={cn(
            "relative w-20 h-20 rounded-full border-4 flex items-center justify-center overflow-hidden",
            "border-muted-foreground/30 bg-muted/50 transition-all duration-500",
            isActive && "border-primary/60 shadow-[0_0_20px_rgba(99,102,241,0.3)]",
            machine.state === "Error"     && "border-destructive/60",
            machine.state === "Completed" && "border-emerald-500/60",
          )}
          style={isSpinning ? { animation: "spin 1.2s linear infinite" } : undefined}
        >
          {/* Water fill for washer */}
          {machine.machine_type === "Washer" && machine.water_level > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 bg-blue-500/30 transition-all duration-1000"
              style={{ height: `${machine.water_level}%` }}
            />
          )}
          <StateIcon
            state={machine.state}
            className={cn(
              machine.state === "Idle"      && "text-muted-foreground/60",
              machine.state === "Filling"   && "text-blue-400",
              machine.state === "Washing"   && "text-cyan-400",
              machine.state === "Rinsing"   && "text-sky-400",
              machine.state === "Spinning"  && "text-violet-400",
              machine.state === "Drying"    && "text-orange-400",
              machine.state === "Completed" && "text-emerald-400",
              machine.state === "Error"     && "text-destructive",
            )}
          />
        </div>
        {/* Active pulse ring */}
        {isActive && (
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
        )}
      </div>

      {/* Side stats */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {machine.machine_type === "Washer" ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">RPM</span>
              <span className={cn("font-mono font-semibold", isActive && "text-primary")}>
                {machine.rpm.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Water</span>
              <div className="flex items-center gap-1">
                <Sparkline data={waterHistory} color="#3b82f6" height={18} width={50} min={0} max={100} />
                <span className={cn("font-mono font-semibold text-[10px]", machine.water_level > 0 && "text-blue-400")}>
                  {machine.water_level}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Temp</span>
              <div className="flex items-center gap-1">
                <Sparkline data={tempHistory} color="#ef4444" height={18} width={50} min={20} max={90} />
                <span className={cn("font-mono font-semibold text-[10px]", machine.temperature > 60 && "text-red-400")}>
                  {machine.temperature.toFixed(0)}°C
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Temp</span>
              <div className="flex items-center gap-1">
                <Sparkline data={tempHistory} color="#f59e0b" height={18} width={50} min={20} max={120} />
                <span className={cn("font-mono font-semibold text-[10px]", machine.temperature > 100 && "text-orange-400")}>
                  {machine.temperature.toFixed(0)}°C
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Door</span>
              <DoorIcon />
            </div>
            {machine.error_code > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Error</span>
                <span className="font-mono text-destructive font-bold">
                  E{String(machine.error_code).padStart(2, "0")}
                </span>
              </div>
            )}
          </>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Time</span>
          <span className={cn("font-mono font-semibold", isActive && "text-primary")}>
            {formatTime(machine.time_remaining)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main MachineCard ──────────────────────────────────────────
export function MachineCard({ machine, onRefresh, onToast, config }: MachineCardProps) {
  const [tempHistory, setTempHistory]   = useState<number[]>([])
  const [waterHistory, setWaterHistory] = useState<number[]>([])
  const [showRegs, setShowRegs]         = useState(false)
  const [showErrorInject, setShowErrorInject] = useState(false)

  useEffect(() => {
    setTempHistory(prev  => [...prev.slice(-29),  machine.temperature])
    setWaterHistory(prev => [...prev.slice(-29), machine.water_level])
  }, [machine.temperature, machine.water_level])

  const isActive   = !["Idle", "Completed", "Error"].includes(machine.state)
  const isError    = machine.state === "Error"
  const isComplete = machine.state === "Completed"
  const canModify  = machine.state === "Idle" || machine.state === "Completed"
  const progress   = STATE_PROGRESS[machine.state]

  const programs = (machine.machine_type === "Washer"
    ? config?.washer_programs
    : config?.dryer_programs) ?? []
  const currentProgram = programs.find(p => p.id === machine.program)
  const currentPrice   = currentProgram?.price ?? 40
  const hasCoins       = machine.coins >= currentPrice

  const cmd = async (command: string, args?: Record<string, unknown>) => {
    try {
      await trackedInvoke(command, args)
      onRefresh()
    } catch (err) {
      onToast("error", String(err))
    }
  }

  const handleStart = async () => {
    try {
      await trackedInvoke("start_machine", { machineId: machine.id })
      onToast("success", `Started: ${machine.machine_type} #${machine.id}`)
      onRefresh()
    } catch (err) { onToast("error", String(err)) }
  }

  const isWasher   = machine.machine_type === "Washer"
  const cardAccent = isError    ? "border-destructive/50 shadow-destructive/10"
    : isComplete   ? "border-emerald-500/50 shadow-emerald-500/10"
    : isActive     ? "border-primary/50 shadow-primary/10"
    : "border-border"

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg transition-all duration-300",
        cardAccent,
        isActive && "shadow-lg",
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isWasher
            ? <Waves size={22} className="text-primary/70" />
            : <Wind  size={22} className="text-amber-400/70" />
          }
          <div>
            <h3 className="font-bold text-sm leading-tight">
              {machine.machine_type}{" "}
              <span className="text-muted-foreground font-normal">#{machine.id}</span>
            </h3>
            <p className="text-[10px] text-muted-foreground">UNIT ID: {machine.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-yellow-500 hover:bg-yellow-500/10"
            onClick={() => setShowErrorInject(!showErrorInject)}
            title="Inject Error"
          >
            <AlertTriangle size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setShowRegs(!showRegs)}
            title="Toggle Registers"
          >
            <BarChart3 size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (window.confirm(`Remove ${machine.machine_type} #${machine.id}?`))
                cmd("remove_machine", { unitId: machine.id })
            }}
            title="Remove Machine"
          >
            <X size={13} />
          </Button>
        </div>
      </div>

      {/* ── Drum visual + stats ── */}
      <MachineVisual machine={machine} tempHistory={tempHistory} waterHistory={waterHistory} />

      {/* ── State + Door ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className={cn("h-2 w-2 rounded-full", {
            "bg-muted-foreground":          machine.state === "Idle",
            "bg-blue-400 animate-pulse":    machine.state === "Filling",
            "bg-cyan-400 animate-pulse":    machine.state === "Washing",
            "bg-sky-400 animate-pulse":     machine.state === "Rinsing",
            "bg-violet-400 animate-pulse":  machine.state === "Spinning",
            "bg-orange-400 animate-pulse":  machine.state === "Drying",
            "bg-emerald-400":               machine.state === "Completed",
            "bg-destructive animate-ping":  machine.state === "Error",
          })} />
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", stateClass(machine.state))}>
            {machine.state}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            disabled={machine.door_status === 3 || machine.door_status >= 5}
            onClick={() => cmd("toggle_door", { machineId: machine.id })}
            title={machine.door_status === 1 ? "Close Door" : "Open Door"}
          >
            {machine.door_status === 1
              ? <DoorOpen size={11} />
              : <DoorClosed size={11} />
            }
            {machine.door_status === 1 ? "Open" : machine.door_status === 3 ? "Locked" : "Closed"}
          </Button>
          {(machine.door_status === 2 || machine.door_status === 3) && (
            <Button
              variant={machine.door_status === 3 ? "default" : "outline"}
              size="sm"
              className="h-6 w-6 px-0"
              onClick={() => cmd("toggle_door_lock", { machineId: machine.id })}
              title={machine.door_status === 3 ? "Unlock" : "Lock"}
            >
              {machine.door_status === 3 ? <Unlock size={11} /> : <Lock size={11} />}
            </Button>
          )}
        </div>
      </div>

      {/* ── Credit + Program ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">CREDIT</span>
          <span className={cn("font-mono font-bold text-sm", machine.coins > 0 && "text-yellow-400")}>
            {machine.coins}฿
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          disabled={isActive}
          onClick={() => cmd("insert_coin", { machineId: machine.id, amount: 10 })}
        >
          +10฿
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground"
          disabled={isActive || machine.coins === 0}
          onClick={() => cmd("clear_coins", { machineId: machine.id })}
          title="Clear coins"
        >
          <CircleMinus size={14} />
        </Button>
      </div>

      {/* ── Program selector ── */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground font-medium mr-1">PROG</span>
        {programs.map(p => (
          <button
            key={p.id}
            className={cn(
              "h-6 px-2 rounded text-[10px] font-bold border transition-all",
              machine.program === p.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50",
            )}
            disabled={!canModify}
            onClick={() => cmd("set_program", { machineId: machine.id, program: p.id })}
            title={`${p.label} ${p.minutes}m ${p.price}฿`}
          >
            P{p.id}
          </button>
        ))}
        {currentProgram && (
          <span className="text-[9px] text-muted-foreground ml-auto">{currentProgram.label} · {currentPrice}฿</span>
        )}
      </div>

      {/* ── Main action ── */}
      <div className="flex gap-2">
        {isError ? (
          <Button
            variant="destructive"
            className="flex-1 h-8 text-xs gap-1"
            onClick={() => cmd("clear_error", { machineId: machine.id })}
          >
            <AlertTriangle size={13} /> CLEAR ERROR
          </Button>
        ) : isActive ? (
          <>
            <Button
              variant="outline"
              className="flex-1 h-8 text-xs gap-1"
              onClick={() => cmd("advance_state", { machineId: machine.id })}
            >
              <SkipForward size={13} /> NEXT STAGE
            </Button>
            <Button
              variant="destructive"
              className="h-8 px-3 text-xs gap-1"
              onClick={() => cmd("stop_machine", { machineId: machine.id })}
            >
              <Square size={11} /> STOP
            </Button>
          </>
        ) : (
          <Button
            className={cn(
              "flex-1 h-8 text-xs font-bold gap-1",
              hasCoins ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
            disabled={!canModify || !hasCoins}
            onClick={handleStart}
          >
            {hasCoins
              ? <><Play size={12} /> START ({currentPrice}฿)</>
              : `NEED ${currentPrice}฿`}
          </Button>
        )}
      </div>

      {/* ── Progress bar ── */}
      {machine.state !== "Idle" && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{progress}%</span>
            <span>{formatTime(machine.time_remaining)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isError     ? "bg-destructive"
                : isComplete ? "bg-emerald-500"
                : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Modbus register overlay ── */}
      {showRegs && (() => {
        const map = machine.machine_type === "Washer"
          ? config?.washer_mapping ?? {
              state: 20, door_status: 21, error_flag: 22, time_min: 23, time_sec: 24,
              water_level: 28, temperature: 30, rpm: 32, program: 34, coins: 37, total_coins: 38, machine_id: 40, error_code: 60
            }
          : config?.dryer_mapping ?? {
              state: 20, door_status: 21, error_flag: 22, time_min: 23, time_sec: 24,
              water_level: 28, temperature: 30, rpm: 32, program: 34, coins: 37, total_coins: 38, machine_id: 40, error_code: 60
            };

        return (
          <div className="absolute inset-0 rounded-xl bg-card/95 backdrop-blur-sm border border-primary/30 p-3 z-10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-primary">MODBUS REGISTERS</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setShowRegs(false)}>
                <X size={11} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
              {[
                [`${40000 + map.state} STATE`, stateToCode(machine.state)],
                [`${40000 + map.door_status} DOOR`,  machine.door_status],
                [`${40000 + map.error_flag} ERR`,   machine.error_code > 0 ? 1 : 0],
                [`${40000 + map.time_min} T-MIN`, Math.floor(machine.time_remaining / 60)],
                [`${40000 + map.time_sec} T-SEC`, machine.time_remaining % 60],
                [`${40000 + map.water_level} WATER`, machine.water_level],
                [`${40000 + map.temperature} TEMP`,  Math.round(machine.temperature * 10)],
                [`${40000 + map.rpm} RPM`,   machine.rpm],
                [`${40000 + map.program} PROG`,  machine.program],
                [`${40000 + map.coins} COINS`, machine.coins],
                [`${40000 + map.total_coins} TOTAL`, machine.total_coins],
                [`${40000 + map.machine_id} UID`,   machine.id],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between bg-muted/50 rounded px-1.5 py-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-bold">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Error Injection overlay ── */}
      {showErrorInject && (
        <div className="absolute inset-0 rounded-xl bg-card/95 backdrop-blur-sm border border-destructive/30 p-3 z-10 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-destructive flex items-center gap-1">
              <AlertTriangle size={11} /> ERROR INJECTION
            </span>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setShowErrorInject(false)}>
              <X size={11} />
            </Button>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-2">
            <p className="text-[10px] text-muted-foreground leading-snug">
              Select an error below to force this machine into an Error state. Useful for testing Modbus monitoring tools.
            </p>
            <div className="grid grid-cols-1 gap-1.5 mt-1">
              {[
                { code: 1, label: "E01: Drum Overheat Failure" },
                { code: 2, label: "E02: Water Inlet Timeout" },
                { code: 3, label: "E03: Drain Blockage / Timeout" },
                { code: 4, label: "E04: Door Sensor Fault" },
              ].map(err => (
                <Button
                  key={err.code}
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start text-[11px] font-mono hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                  onClick={async () => {
                    await cmd("trigger_error", { machineId: machine.id, errorCode: err.code })
                    setShowErrorInject(false)
                    onToast("warning", `Injected ${err.label} on Machine #${machine.id}`)
                  }}
                >
                  <AlertTriangle size={11} className="mr-1.5 opacity-70" />
                  {err.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
