// Path: src/components/monitoring/AppSettingsView.tsx
import { useState, useEffect, useCallback } from "react"
import {
  Settings2, FolderOpen, RotateCcw, Trash2,
  Gauge, CheckCircle2,
  Database, Sliders, Save,
} from "lucide-react"
import { getConfig, getAppInfo, setSimulationMode, resetAllData, clearLogFile, updateConfig } from "@/lib/commands"
import type { SimulatorConfig, AppInfo, Toast, RegisterMapping } from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SPEED_OPTIONS = [
  { value: 1,  label: "1×",  desc: "Real-time" },
  { value: 2,  label: "2×",  desc: "Double" },
  { value: 5,  label: "5×",  desc: "Fast" },
  { value: 10, label: "10×", desc: "Ultra" },
]

const READ_FIELDS = [
  { key: "state",       label: "STATE",       defaultVal: 20,  desc: "Machine State" },
  { key: "door_status", label: "DOOR",        defaultVal: 21,  desc: "Door Status (0-6)" },
  { key: "error_flag",  label: "ERR_FLAG",    defaultVal: 22,  desc: "Error Flag" },
  { key: "time_min",    label: "TIME_MIN",    defaultVal: 23,  desc: "Time Remaining Min" },
  { key: "time_sec",    label: "TIME_SEC",    defaultVal: 24,  desc: "Time Remaining Sec" },
  { key: "water_level", label: "WATER",       defaultVal: 28,  desc: "Water Level (%)" },
  { key: "temperature", label: "TEMP_x10",    defaultVal: 30,  desc: "Temp x10 (C)" },
  { key: "rpm",         label: "RPM",         defaultVal: 32,  desc: "Drum Speed (rpm)" },
  { key: "program",     label: "PROGRAM",     defaultVal: 34,  desc: "Active Program ID" },
  { key: "coins",       label: "COINS",       defaultVal: 37,  desc: "Current Credit" },
  { key: "total_coins", label: "TOTAL_COINS", defaultVal: 38,  desc: "Lifetime Credit" },
  { key: "machine_id",  label: "UNIT_ID",     defaultVal: 40,  desc: "Slave Unit ID" },
  { key: "error_code",  label: "ERR_CODE",    defaultVal: 60,  desc: "Error Code" },
]

const WRITE_FIELDS = [
  { key: "write_error_reset", label: "ERR_RESET",  defaultVal: 0, desc: "Write 1 to Reset" },
  { key: "write_start",       label: "START",      defaultVal: 1, desc: "Write 1 to Start" },
  { key: "write_advance",     label: "ADVANCE",    defaultVal: 2, desc: "Write 1 to Advance" },
  { key: "write_stop",        label: "STOP",       defaultVal: 3, desc: "Write 1 to Stop" },
  { key: "write_coins",       label: "SET_CREDIT", defaultVal: 4, desc: "Write balance" },
  { key: "write_program",     label: "SET_PROG",   defaultVal: 5, desc: "Write active prog" },
]

const getFieldDefault = (tab: "washer" | "dryer", key: string): number => {
  if (tab === "washer") {
    const wDefaults: Record<string, number> = {
      state: 20, door_status: 21, error_flag: 22, time_min: 23, time_sec: 24,
      water_level: 28, temperature: 30, rpm: 32, program: 34, coins: 37, total_coins: 38, machine_id: 40, error_code: 60,
      write_error_reset: 0, write_start: 1, write_advance: 2, write_stop: 3, write_coins: 4, write_program: 5
    }
    return wDefaults[key] ?? 0
  } else {
    const dDefaults: Record<string, number> = {
      state: 20, door_status: 21, error_flag: 22, time_min: 23, time_sec: 24,
      water_level: 28, temperature: 30, rpm: 32, program: 34, coins: 37, total_coins: 38, machine_id: 40, error_code: 60,
      write_error_reset: 0, write_start: 1, write_advance: 2, write_stop: 99, write_coins: 3, write_program: 4
    }
    return dDefaults[key] ?? 0
  }
}

interface AppSettingsViewProps {
  onToast: (type: Toast["type"], msg: string) => void
}

export function AppSettingsView({ onToast }: AppSettingsViewProps) {
  const [config, setConfig]     = useState<SimulatorConfig | null>(null)
  const [info, setInfo]         = useState<AppInfo | null>(null)
  const [simEnabled, setSimEnabled] = useState(true)
  const [simSpeed, setSimSpeed]     = useState(1)
  const [loading, setLoading]       = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [mappingTab, setMappingTab] = useState<'washer' | 'dryer'>('washer')

  const load = useCallback(async () => {
    try {
      const [cfg, appInfo] = await Promise.all([getConfig(), getAppInfo()])
      setConfig(cfg)
      setInfo(appInfo)
      setSimEnabled(cfg.simulation_enabled)
      setSimSpeed(cfg.simulation_speed)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSimToggle = async () => {
    const next = !simEnabled
    setSimEnabled(next)
    try {
      await setSimulationMode(next, simSpeed)
      onToast("info", `Simulation ${next ? "enabled" : "disabled"}`)
    } catch (err) { onToast("error", String(err)) }
  }

  const handleSpeedChange = async (speed: number) => {
    setSimSpeed(speed)
    try {
      await setSimulationMode(simEnabled, speed)
      onToast("info", `Speed set to ${speed}×`)
    } catch (err) { onToast("error", String(err)) }
  }

  const handleAutoStartToggle = async () => {
    if (!config) return
    const next: SimulatorConfig = { ...config, auto_start: !config.auto_start }
    try {
      await updateConfig(next)
      setConfig(next)
      onToast("info", `Auto-start ${next.auto_start ? "enabled" : "disabled"}`)
    } catch (err) { onToast("error", String(err)) }
  }

  const handleMappingChange = (type: "washer" | "dryer", key: string, val: number) => {
    if (!config) return
    const target = type === "washer" ? "washer_mapping" : "dryer_mapping"
    setConfig({
      ...config,
      [target]: {
        ...config[target],
        [key]: val
      }
    })
  }

  const handleSaveMappings = async () => {
    if (!config) return
    setLoading(true)
    try {
      await updateConfig(config)
      onToast("success", "Modbus register mappings saved successfully!")
    } catch (err) { onToast("error", String(err)) }
    finally { setLoading(false) }
  }

  const handleResetAll = async () => {
    if (!confirmReset) { setConfirmReset(true); return }
    setLoading(true)
    setConfirmReset(false)
    try {
      await resetAllData()
      onToast("success", "All data reset to defaults")
      await load()
    } catch (err) { onToast("error", String(err)) }
    finally { setLoading(false) }
  }

  const handleClearLog = async () => {
    try {
      await clearLogFile()
      onToast("success", "Log file cleared")
    } catch (err) { onToast("error", String(err)) }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 flex-shrink-0 bg-muted/20">
        <Settings2 size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">APP SETTINGS</span>
        <div className="ml-auto">
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={load}>
            <RotateCcw size={12} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Simulation Control ── */}
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Gauge size={14} className="text-primary" />
            <span className="font-bold text-sm">Simulation Engine</span>
          </div>

          <div className="p-4 space-y-4">
            {/* Enable/Disable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto Simulation</p>
                <p className="text-[11px] text-muted-foreground">Automatically advance machine states over time</p>
              </div>
              <button
                onClick={handleSimToggle}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                  simEnabled ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200",
                    simEnabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {/* Speed selector */}
            <div>
              <p className="text-sm font-medium mb-2">Simulation Speed</p>
              <div className="grid grid-cols-4 gap-2">
                {SPEED_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleSpeedChange(opt.value)}
                    disabled={!simEnabled}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-lg border p-2.5 text-xs font-bold transition-all",
                      simSpeed === opt.value && simEnabled
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 disabled:opacity-40"
                    )}
                  >
                    <span className="text-base font-black">{opt.label}</span>
                    <span className="text-[9px] font-normal">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-start toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-start Modbus on Launch</p>
                <p className="text-[11px] text-muted-foreground">Reconnect to last port automatically</p>
              </div>
              <button
                onClick={handleAutoStartToggle}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                  config?.auto_start ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200",
                    config?.auto_start ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
        </section>

        {/* ── Modbus Address Mapping ── */}
        {config && (
          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <Database size={14} className="text-primary" />
              <span className="font-bold text-sm">Modbus Register Mappings</span>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Configure custom register addresses separately for Washers and Dryers. Offset addresses are relative to <code className="bg-muted px-1 py-0.5 rounded text-primary">40000</code> for reads and <code className="bg-muted px-1 py-0.5 rounded text-primary">0</code> for writes.
              </p>

              {/* Tabs for Washer / Dryer */}
              <div className="flex border-b">
                <button
                  className={cn(
                    "px-4 py-2 text-xs font-bold border-b-2 transition-all",
                    mappingTab === "washer" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMappingTab("washer")}
                >
                  Washer Register Mappings
                </button>
                <button
                  className={cn(
                    "px-4 py-2 text-xs font-bold border-b-2 transition-all",
                    mappingTab === "dryer" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMappingTab("dryer")}
                >
                  Dryer Register Mappings
                </button>
              </div>

              {/* Address input grid */}
              <div className="space-y-4 animate-in fade-in-50 duration-200">
                {/* Read Registers Group */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5">
                    <Sliders size={12} /> STATUS REGISTERS (READ-ONLY · FC03 / FC04)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 bg-muted/10 p-3 rounded-lg border">
                    {READ_FIELDS.map(field => {
                      const defVal = getFieldDefault(mappingTab, field.key);
                      return (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-muted-foreground flex justify-between">
                            <span>{field.label}</span>
                            <span className="opacity-60">Default: {defVal}</span>
                          </label>
                          <input
                            type="number"
                            className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                            value={config[mappingTab === 'washer' ? 'washer_mapping' : 'dryer_mapping'][field.key as keyof RegisterMapping] ?? defVal}
                            onChange={e => handleMappingChange(mappingTab, field.key, Number(e.target.value))}
                          />
                          <p className="text-[9px] text-muted-foreground/80 font-mono truncate">{field.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Write Registers Group */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5">
                    <Sliders size={12} /> CONTROL REGISTERS (WRITE-ONLY · FC06 / FC16)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 bg-muted/10 p-3 rounded-lg border">
                    {WRITE_FIELDS.map(field => {
                      const defVal = getFieldDefault(mappingTab, field.key);
                      return (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-muted-foreground flex justify-between">
                            <span>{field.label}</span>
                            <span className="opacity-60">Default: {defVal}</span>
                          </label>
                          <input
                            type="number"
                            className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                            value={config[mappingTab === 'washer' ? 'washer_mapping' : 'dryer_mapping'][field.key as keyof RegisterMapping] ?? defVal}
                            onChange={e => handleMappingChange(mappingTab, field.key, Number(e.target.value))}
                          />
                          <p className="text-[9px] text-muted-foreground/80 font-mono truncate">{field.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs h-9 px-4 font-bold"
                    onClick={handleSaveMappings}
                    disabled={loading}
                  >
                    <Save size={13} /> Save {mappingTab === "washer" ? "Washer" : "Dryer"} Mappings
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── App Info ── */}
        {info && (
          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <FolderOpen size={14} className="text-primary" />
              <span className="font-bold text-sm">App Info</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">v{info.version}</span>
            </div>
            <div className="p-4 space-y-2 font-mono text-[11px]">
              {[
                ["Config Dir",     info.config_dir],
                ["Machines File",  info.machines_path],
                ["Settings File",  info.settings_path],
                ["Log File",       info.logs_path],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
                  <span className="text-foreground/80 break-all">{val}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Data Management ── */}
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Trash2 size={14} className="text-destructive" />
            <span className="font-bold text-sm">Data Management</span>
          </div>
          <div className="p-4 space-y-3">
            {/* Clear log */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Clear Log File</p>
                <p className="text-[11px] text-muted-foreground">Delete all entries in the persistent event log</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={handleClearLog}
              >
                <Trash2 size={12} /> Clear Log
              </Button>
            </div>

            <div className="border-t" />

            {/* Factory reset */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Reset All Data</p>
                <p className="text-[11px] text-muted-foreground">Remove all machines and restore factory defaults</p>
              </div>
              <Button
                size="sm"
                variant={confirmReset ? "destructive" : "outline"}
                className={cn("h-8 gap-1 text-xs", confirmReset && "animate-pulse")}
                onClick={handleResetAll}
                disabled={loading}
              >
                {confirmReset
                  ? <><CheckCircle2 size={12} /> Confirm Reset!</>
                  : <><RotateCcw size={12} /> Reset All</>
                }
              </Button>
            </div>
            {confirmReset && (
              <p className="text-[10px] text-destructive/80 font-mono">
                Click "Confirm Reset!" again to proceed. This cannot be undone.
              </p>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
