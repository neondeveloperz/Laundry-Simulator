// Path: src/components/modbus/Rs485Panel.tsx
import { useState, useEffect, useCallback, useRef } from "react"
import {
  Cable, RefreshCw, Plug, Unplug,
  Clock, AlertCircle, AlertTriangle,
  Zap, Square, ChevronDown, Plus, Trash2,
  Cpu, Check,
} from "lucide-react"
import {
  listSerialPorts, getModbusStatus, startModbusServer,
  stopModbusServer, startAllModbusServers, stopAllModbusServers,
  savePortConfig, removePortConfig, setFaultMode, getFaultConfig,
  bulkStartMachines, bulkStopMachines, getConfig,
} from "@/lib/commands"
import type { ModbusStatus, PortStatus, PortMachineFilter, FaultConfig, Machine, Toast } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
const EXCEPTION_CODES: Record<number, string> = {
  0: "None",
  1: "Illegal Function",
  2: "Illegal Data Address",
  3: "Illegal Data Value",
  4: "Slave Device Failure",
  5: "Acknowledge",
  6: "Slave Busy",
}

interface Rs485PanelProps {
  onToast: (type: Toast["type"], msg: string) => void
  onRefresh: () => void
  machines?: Machine[]
}

interface LocalPortCardState {
  port: string
  baud: number
  machine_filter: PortMachineFilter
  auto_connect: boolean
}

export function Rs485Panel({ onToast, onRefresh, machines = [] }: Rs485PanelProps) {
  const [availablePorts, setAvailablePorts] = useState<string[]>([])
  const [status, setStatus] = useState<ModbusStatus | null>(null)
  const [fault, setFault] = useState<FaultConfig>({ timeout: false, crc_error: false, exception_code: 0 })
  const [loadingAction, setLoadingAction] = useState<Record<string, boolean>>({})
  const [globalLoading, setGlobalLoading] = useState(false)
  const [isAddingPort, setIsAddingPort] = useState(false)
  const [newPortName, setNewPortName] = useState("")
  const [newPortBaud, setNewPortBaud] = useState(9600)
  const [newPortFilter, setNewPortFilter] = useState<PortMachineFilter>("all")

  // Local editing copy of ports so users can edit baud/filter when disconnected
  const [localPorts, setLocalPorts] = useState<LocalPortCardState[]>([])
  const initializedRef = useRef(false)

  // ── Polling & Data Fetching ───────────────────────────────────
  const refreshPorts = useCallback(async () => {
    try {
      const list = await listSerialPorts()
      setAvailablePorts(list)
    } catch { /* ignore */ }
  }, [])

  const pollStatus = useCallback(async () => {
    try {
      const s = await getModbusStatus()
      setStatus(s)
      if (s.ports && s.ports.length > 0) {
        setLocalPorts(prev => {
          // Merge remote status into local list, preserving un-saved changes if any
          return s.ports!.map(sp => {
            const existing = prev.find(p => p.port === sp.port)
            return existing
              ? { ...existing, baud: sp.connected ? sp.baud : existing.baud, machine_filter: sp.machine_filter }
              : { port: sp.port, baud: sp.baud, machine_filter: sp.machine_filter, auto_connect: sp.auto_connect }
          })
        })
      }
    } catch { /* ignore */ }
  }, [])

  const fetchFaults = useCallback(async () => {
    try { setFault(await getFaultConfig()) } catch { /* ignore */ }
  }, [])

  // Initial mount
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const init = async () => {
      await refreshPorts()
      try {
        const cfg = await getConfig()
        const s = await getModbusStatus()
        setStatus(s)

        let initialList: LocalPortCardState[] = []
        if (s.ports && s.ports.length > 0) {
          initialList = s.ports.map(p => ({
            port: p.port,
            baud: p.baud,
            machine_filter: p.machine_filter,
            auto_connect: p.auto_connect,
          }))
        } else if (cfg.ports && cfg.ports.length > 0) {
          initialList = cfg.ports.map(p => ({
            port: p.port,
            baud: p.baud,
            machine_filter: p.machine_filter,
            auto_connect: p.auto_connect,
          }))
        } else if (cfg.last_port) {
          initialList = [{
            port: cfg.last_port,
            baud: cfg.last_baud || 9600,
            machine_filter: "all",
            auto_connect: cfg.auto_start || false,
          }]
        }
        setLocalPorts(initialList)
      } catch { /* ignore */ }

      await fetchFaults()
    }
    init()

    const t = setInterval(pollStatus, 1500)
    return () => clearInterval(t)
  }, [refreshPorts, pollStatus, fetchFaults])

  // ── Actions ──────────────────────────────────────────────────
  const handleConnectPort = async (p: LocalPortCardState) => {
    if (!p.port) { onToast("error", "Invalid port name"); return }
    setLoadingAction(prev => ({ ...prev, [p.port]: true }))
    try {
      await startModbusServer(p.port, p.baud, p.machine_filter)
      onToast("success", `Modbus connected: ${p.port} @ ${p.baud.toLocaleString()} baud`)
      await pollStatus()
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setLoadingAction(prev => ({ ...prev, [p.port]: false }))
    }
  }

  const handleDisconnectPort = async (portName: string) => {
    setLoadingAction(prev => ({ ...prev, [portName]: true }))
    try {
      await stopModbusServer(portName)
      onToast("info", `Modbus disconnected: ${portName}`)
      await pollStatus()
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setLoadingAction(prev => ({ ...prev, [portName]: false }))
    }
  }

  const handleConnectAll = async () => {
    setGlobalLoading(true)
    try {
      await startAllModbusServers()
      onToast("success", "Started all configured Modbus ports")
      await pollStatus()
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setGlobalLoading(false)
    }
  }

  const handleDisconnectAll = async () => {
    setGlobalLoading(true)
    try {
      await stopAllModbusServers()
      onToast("info", "Stopped all Modbus ports")
      await pollStatus()
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setGlobalLoading(false)
    }
  }

  const handleUpdatePortField = async (
    portName: string,
    updates: Partial<LocalPortCardState>
  ) => {
    setLocalPorts(prev =>
      prev.map(p => {
        if (p.port === portName) {
          const updated = { ...p, ...updates }
          // Auto persist to backend settings
          savePortConfig(
            updated.port,
            updated.baud,
            updated.machine_filter,
            updated.auto_connect
          ).catch(() => {})
          return updated
        }
        return p
      })
    )
  }

  const handleRemovePort = async (portName: string) => {
    try {
      await removePortConfig(portName)
      setLocalPorts(prev => prev.filter(p => p.port !== portName))
      onToast("info", `Removed port ${portName}`)
      await pollStatus()
    } catch (err) {
      onToast("error", String(err))
    }
  }

  const handleCreateNewPort = async () => {
    const targetPort = newPortName || (availablePorts.find(ap => !localPorts.some(lp => lp.port === ap)) ?? availablePorts[0] ?? "")
    if (!targetPort) {
      onToast("error", "Please specify or select a port")
      return
    }
    if (localPorts.some(p => p.port === targetPort)) {
      onToast("error", `Port ${targetPort} is already in the list`)
      return
    }
    const newEntry: LocalPortCardState = {
      port: targetPort,
      baud: newPortBaud,
      machine_filter: newPortFilter,
      auto_connect: true,
    }
    try {
      await savePortConfig(newEntry.port, newEntry.baud, newEntry.machine_filter, newEntry.auto_connect)
      setLocalPorts(prev => [...prev, newEntry])
      setIsAddingPort(false)
      setNewPortName("")
      onToast("success", `Added port ${targetPort}`)
      await pollStatus()
    } catch (err) {
      onToast("error", String(err))
    }
  }

  const updateFaults = async (next: FaultConfig) => {
    setFault(next)
    try { await setFaultMode(next) }
    catch (err) { onToast("error", String(err)) }
  }

  const handleBulkStart = async () => {
    try { await bulkStartMachines(); onToast("success", "Bulk Start: All idle machines started"); onRefresh() }
    catch (err) { onToast("error", String(err)) }
  }
  const handleBulkStop = async () => {
    try { await bulkStopMachines(); onToast("info", "Bulk Stop: All machines reset"); onRefresh() }
    catch (err) { onToast("error", String(err)) }
  }

  // ── Helpers ──────────────────────────────────────────────────
  const activePortsMap = new Map<string, PortStatus>()
  if (status?.ports) {
    for (const ps of status.ports) {
      activePortsMap.set(ps.port, ps)
    }
  }

  const connectedCount = status?.ports?.filter(p => p.connected).length ?? (status?.connected ? 1 : 0)
  const isAnyConnected = (status?.connected ?? false) || connectedCount > 0

  return (
    <div className="flex flex-col gap-5 p-4 max-w-7xl mx-auto">
      {/* ── Top Header / Status Strip ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border bg-card/60 backdrop-blur shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "h-3 w-3 rounded-full transition-all",
            isAnyConnected ? "bg-emerald-400 animate-pulse shadow-xs shadow-emerald-400/50" : "bg-muted-foreground/30"
          )} />
          <Cable size={16} className="text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">Modbus RTU Slave (Multi-Port)</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {isAnyConnected
                ? `${connectedCount} active port${connectedCount > 1 ? "s" : ""} connected`
                : "All ports idle / disconnected"}
            </span>
          </div>
          <Badge
            variant={isAnyConnected ? "default" : "secondary"}
            className={cn("text-[10px] font-mono ml-1", isAnyConnected && "bg-emerald-600 hover:bg-emerald-600")}
          >
            {isAnyConnected ? `ACTIVE (${connectedCount})` : "IDLE"}
          </Badge>
        </div>

        {/* Global telemetry & Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {status && (
            <div className="flex items-center gap-3 px-3 py-1 rounded-md bg-muted/30 border border-border/50 text-[11px] font-mono">
              <span>TOTAL RX: <span className="text-primary font-bold">{status.rx_count.toLocaleString()}</span></span>
              <span className="text-border">|</span>
              <span>TOTAL TX: <span className="text-primary font-bold">{status.tx_count.toLocaleString()}</span></span>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={refreshPorts}
            title="Scan serial ports"
          >
            <RefreshCw size={12} /> Scan Ports
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 border-primary/40 hover:border-primary text-primary"
            onClick={() => setIsAddingPort(true)}
            disabled={isAddingPort}
          >
            <Plus size={13} /> Add Port
          </Button>

          {isAnyConnected ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={handleDisconnectAll}
              disabled={globalLoading}
            >
              <Unplug size={13} /> Disconnect All
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConnectAll}
              disabled={globalLoading || localPorts.length === 0}
            >
              <Plug size={13} /> Connect All
            </Button>
          )}
        </div>
      </div>

      {/* ── Add New Port Inline Form ── */}
      {isAddingPort && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus size={14} className="text-primary" />
              <span className="text-xs font-bold text-foreground">Configure New Serial Port</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setIsAddingPort(false)}
            >
              Cancel
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* COM Port selection or custom */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">COM Port</label>
              <div className="relative">
                <select
                  className="w-full h-8 rounded-md border border-input bg-background pl-2 pr-7 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                  value={newPortName}
                  onChange={e => setNewPortName(e.target.value)}
                >
                  <option value="">-- Select Available Port --</option>
                  {availablePorts.map(p => (
                    <option key={p} value={p}>
                      {p} {localPorts.some(lp => lp.port === p) ? "(Configured)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <input
                type="text"
                placeholder="Or enter custom device path (e.g. /dev/pts/1)"
                className="w-full h-7 rounded border border-input bg-background px-2 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                value={newPortName}
                onChange={e => setNewPortName(e.target.value)}
              />
            </div>

            {/* Baud Rate */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Baud Rate</label>
              <div className="relative">
                <select
                  className="w-full h-8 rounded-md border border-input bg-background pl-2 pr-7 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                  value={newPortBaud}
                  onChange={e => setNewPortBaud(Number(e.target.value))}
                >
                  {BAUD_RATES.map(b => (
                    <option key={b} value={b}>{b.toLocaleString()} bps</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Dedicated Machine Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Dedicated Machines</label>
              <div className="flex gap-1">
                {(["all", "washers_only", "dryers_only"] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setNewPortFilter(f)}
                    className={cn(
                      "flex-1 h-8 rounded text-[10px] font-semibold border transition-all cursor-pointer",
                      newPortFilter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {f === "all" ? "All" : f === "washers_only" ? "Washers" : "Dryers"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleCreateNewPort}>
              <Check size={13} /> Save Port
            </Button>
          </div>
        </div>
      )}

      {/* ── Port Cards List / Grid ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold px-0.5">
          <span>CONFIGURED RS485 PORTS ({localPorts.length})</span>
          <span className="text-[10px] font-mono text-muted-foreground/70">
            Each port runs an independent Modbus RTU thread
          </span>
        </div>

        {localPorts.length === 0 && !isAddingPort && (
          <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl text-center space-y-3 bg-muted/5">
            <Cable size={32} className="text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">No COM Ports Configured</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Add one or more RS485 serial ports to simulate multiple Modbus buses or separate washer and dryer lines.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setIsAddingPort(true)}
              className="gap-1.5 text-xs"
            >
              <Plus size={13} /> Add First Port
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {localPorts.map((lp, idx) => {
            const remote = activePortsMap.get(lp.port)
            const isConn = remote?.connected ?? false
            const rxCount = remote?.rx_count ?? 0
            const txCount = remote?.tx_count ?? 0
            const isActing = loadingAction[lp.port] ?? false

            // Extract custom machine IDs if any
            const isCustom = typeof lp.machine_filter === "object" && "custom" in lp.machine_filter
            const customIds = isCustom ? (lp.machine_filter as { custom: number[] }).custom : []

            return (
              <div
                key={lp.port || idx}
                className={cn(
                  "rounded-xl border p-4 transition-all space-y-3.5 relative",
                  isConn
                    ? "bg-card/80 border-emerald-500/40 shadow-xs shadow-emerald-500/5"
                    : "bg-card/40 border-border hover:border-border/80"
                )}
              >
                {/* ── Card Header ── */}
                <div className="flex items-center justify-between gap-2 border-b pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "h-2.5 w-2.5 rounded-full shrink-0",
                      isConn ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"
                    )} />
                    <span className="font-mono text-xs font-bold text-foreground truncate" title={lp.port}>
                      {lp.port}
                    </span>
                    <Badge
                      variant={isConn ? "default" : "secondary"}
                      className={cn(
                        "text-[9px] px-1.5 py-0 h-4 font-mono shrink-0",
                        isConn && "bg-emerald-600 hover:bg-emerald-600"
                      )}
                    >
                      {isConn ? `LIVE @ ${lp.baud.toLocaleString()}` : "IDLE"}
                    </Badge>
                  </div>

                  {/* Connect / Disconnect Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isConn ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2.5 text-xs gap-1"
                        onClick={() => handleDisconnectPort(lp.port)}
                        disabled={isActing}
                      >
                        <Unplug size={12} /> Disconnect
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleConnectPort(lp)}
                          disabled={isActing}
                        >
                          <Plug size={12} /> Connect
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemovePort(lp.port)}
                          title="Remove port configuration"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Live Telemetry Strip when Connected ── */}
                {isConn && (
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono">
                    <div className="flex items-center gap-3">
                      <span>RX: <strong className="text-emerald-400 font-bold">{rxCount.toLocaleString()}</strong></span>
                      <span>TX: <strong className="text-emerald-400 font-bold">{txCount.toLocaleString()}</strong></span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Scope: {lp.machine_filter === "all" ? "All fleet" : lp.machine_filter === "washers_only" ? "Washers only" : lp.machine_filter === "dryers_only" ? "Dryers only" : `${customIds.length} machines`}
                    </div>
                  </div>
                )}

                {/* ── Port Configuration Form (Editable when disconnected) ── */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {/* Port Selection / Change */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase">Port Path</label>
                    <div className="relative">
                      <select
                        className="w-full h-7 rounded border border-input bg-background pl-2 pr-6 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                        value={lp.port}
                        disabled={isConn}
                        onChange={e => handleUpdatePortField(lp.port, { port: e.target.value })}
                      >
                        <option value={lp.port}>{lp.port}</option>
                        {availablePorts
                          .filter(p => p !== lp.port)
                          .map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                      </select>
                      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Baud Rate */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase">Baud Rate</label>
                    <div className="relative">
                      <select
                        className="w-full h-7 rounded border border-input bg-background pl-2 pr-6 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                        value={lp.baud}
                        disabled={isConn}
                        onChange={e => handleUpdatePortField(lp.port, { baud: Number(e.target.value) })}
                      >
                        {BAUD_RATES.map(b => (
                          <option key={b} value={b}>{b.toLocaleString()} bps</option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* ── Dedicated Machine Filter Configuration ── */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                      <Cpu size={10} /> Dedicated Machine Filter
                    </label>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      Requests to other unit IDs will be ignored
                    </span>
                  </div>

                  {/* Segmented Filter Buttons */}
                  <div className="flex gap-1">
                    {[
                      { key: "all", label: "All Fleet" },
                      { key: "washers_only", label: "Washers Only" },
                      { key: "dryers_only", label: "Dryers Only" },
                      { key: "custom", label: "Custom IDs" },
                    ].map(f => {
                      const isActive =
                        f.key === "custom"
                          ? isCustom
                          : lp.machine_filter === f.key

                      return (
                        <button
                          key={f.key}
                          type="button"
                          disabled={isConn}
                          onClick={() => {
                            if (f.key === "custom") {
                              const existingIds = isCustom ? customIds : machines.map(m => m.id)
                              handleUpdatePortField(lp.port, { machine_filter: { custom: existingIds } })
                            } else {
                              handleUpdatePortField(lp.port, { machine_filter: f.key as PortMachineFilter })
                            }
                          }}
                          className={cn(
                            "flex-1 h-6 rounded text-[10px] font-semibold border transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-70",
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 bg-muted/20"
                          )}
                        >
                          {f.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Custom IDs selection tags */}
                  {isCustom && (
                    <div className="p-2 rounded-md bg-muted/20 border border-border/60 space-y-1.5 mt-1">
                      <span className="text-[9px] text-muted-foreground font-semibold uppercase">
                        Select Active Unit IDs for this Port:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {machines.length === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">
                            No machines added yet. Create machines in Fleet view.
                          </span>
                        )}
                        {machines.map(m => {
                          const isSelected = customIds.includes(m.unit_id)
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={isConn}
                              onClick={() => {
                                const nextIds = isSelected
                                  ? customIds.filter(id => id !== m.unit_id)
                                  : [...customIds, m.unit_id].sort((a, b) => a - b)
                                handleUpdatePortField(lp.port, { machine_filter: { custom: nextIds } })
                              }}
                              className={cn(
                                "h-5 px-1.5 rounded text-[10px] font-mono border transition-all cursor-pointer flex items-center gap-1",
                                isSelected
                                  ? "bg-primary/20 border-primary text-primary font-bold"
                                  : "border-border text-muted-foreground hover:border-border/80 bg-background/50",
                                isConn && "opacity-80 cursor-default"
                              )}
                            >
                              <span>#{m.unit_id}</span>
                              <span className="text-[9px] opacity-75">{m.machine_type === "Washer" ? "W" : "D"}</span>
                              {m.port && (
                                <span className="text-[8px] opacity-60">[{m.port.split("/").pop()}]</span>
                              )}
                              {isSelected && <Check size={10} className="stroke-[3]" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Auto-Connect on App Launch ── */}
                <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px]">
                  <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                      checked={lp.auto_connect}
                      onChange={e => handleUpdatePortField(lp.port, { auto_connect: e.target.checked })}
                    />
                    <span>Auto-reconnect on startup</span>
                  </label>
                  <span className="text-[9px] text-muted-foreground/60 font-mono">
                    Bus ID: {idx + 1}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Fault Injection ── */}
      <div className="rounded-xl border border-dashed border-yellow-500/30 bg-yellow-500/5 p-3.5 space-y-2.5">
        <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
          <AlertTriangle size={12} /> Fault Injection Engine (Affects all active ports)
        </p>

        {/* Presets Button Row */}
        <div className="flex flex-wrap gap-1 border-b border-yellow-500/20 pb-2">
          <span className="text-[9px] text-muted-foreground mr-1 self-center font-bold">PRESETS:</span>
          {[
            { label: "Perfect", timeout: false, crc_error: false, exception_code: 0 },
            { label: "Noisy Line", timeout: false, crc_error: true, exception_code: 0 },
            { label: "Offline", timeout: true, crc_error: false, exception_code: 0 },
            { label: "Board Fault", timeout: false, crc_error: false, exception_code: 2 },
          ].map(p => {
            const isActive = fault.timeout === p.timeout && fault.crc_error === p.crc_error && fault.exception_code === p.exception_code
            return (
              <button
                key={p.label}
                className={cn(
                  "h-5 px-1.5 rounded text-[9px] font-mono leading-none border transition-all cursor-pointer",
                  isActive
                    ? "bg-yellow-500/20 border-yellow-500 text-yellow-400 font-bold"
                    : "border-border text-muted-foreground hover:border-yellow-500/30"
                )}
                onClick={() => updateFaults({ timeout: p.timeout, crc_error: p.crc_error, exception_code: p.exception_code })}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Timeout */}
          <button
            className={cn(
              "flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-semibold transition-all cursor-pointer",
              fault.timeout
                ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                : "border-border text-muted-foreground hover:border-yellow-500/40"
            )}
            onClick={() => updateFaults({ ...fault, timeout: !fault.timeout })}
          >
            <Clock size={11} /> Timeout {fault.timeout ? "ON" : "OFF"}
          </button>

          {/* CRC Error */}
          <button
            className={cn(
              "flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-semibold transition-all cursor-pointer",
              fault.crc_error
                ? "bg-red-500/20 border-red-500 text-red-400"
                : "border-border text-muted-foreground hover:border-red-500/40"
            )}
            onClick={() => updateFaults({ ...fault, crc_error: !fault.crc_error })}
          >
            <AlertCircle size={11} /> CRC Error {fault.crc_error ? "ON" : "OFF"}
          </button>

          {/* Exception Code */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-muted-foreground uppercase">Exception Response</label>
            <div className="relative">
              <select
                className="w-full h-7 rounded border border-input bg-background pl-1.5 pr-6 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                value={fault.exception_code}
                onChange={e => updateFaults({ ...fault, exception_code: Number(e.target.value) })}
              >
                {Object.entries(EXCEPTION_CODES).map(([k, v]) => (
                  <option key={k} value={k}>E{k}: {v}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bulk Controls ── */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5" onClick={handleBulkStart}>
          <Zap size={13} /> Bulk Start All
        </Button>
        <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5" onClick={handleBulkStop}>
          <Square size={12} /> Bulk Stop All
        </Button>
      </div>
    </div>
  )
}
