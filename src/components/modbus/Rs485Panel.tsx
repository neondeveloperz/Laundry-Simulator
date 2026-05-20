// Path: src/components/modbus/Rs485Panel.tsx
import { useState, useEffect, useCallback, useRef } from "react"
import {
  Cable, RefreshCw, Plug, Unplug,
  Clock, AlertCircle, AlertTriangle,
  Zap, Square, ChevronDown,
} from "lucide-react"
import {
  listSerialPorts, getModbusStatus, startModbusServer,
  stopModbusServer, setFaultMode, getFaultConfig,
  bulkStartMachines, bulkStopMachines, getConfig,
} from "@/lib/commands"
import type { ModbusStatus, FaultConfig, Toast } from "@/types"
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
}

export function Rs485Panel({ onToast, onRefresh }: Rs485PanelProps) {
  const [ports, setPorts]     = useState<string[]>([])
  const [port, setPort]       = useState("")
  const [baud, setBaud]       = useState(9600)
  const [status, setStatus]   = useState<ModbusStatus | null>(null)
  const [fault, setFault]     = useState<FaultConfig>({ timeout: false, crc_error: false, exception_code: 0 })
  const [loading, setLoading] = useState(false)
  const initializedRef = useRef(false)

  // ── Polling ──────────────────────────────────────────────────
  const refreshPorts = useCallback(async () => {
    const list = await listSerialPorts()
    setPorts(list)
    // Only auto-select the first port if no port is set yet
    // Use functional setState to avoid depending on `port` state
    setPort(prev => (prev === "" && list.length > 0) ? list[0] : prev)
  }, [])

  const pollStatus = useCallback(async () => {
    try { setStatus(await getModbusStatus()) } catch { /* ignore */ }
  }, [])

  const fetchFaults = useCallback(async () => {
    try { setFault(await getFaultConfig()) } catch { /* ignore */ }
  }, [])

  // Initial mount: load saved config, refresh ports, start polling
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const init = async () => {
      // Load saved config first so it takes priority
      try {
        const cfg = await getConfig()
        if (cfg.last_port) setPort(cfg.last_port)
        if (cfg.last_baud) setBaud(cfg.last_baud)
      } catch { /* ignore */ }

      // Then refresh ports (won't overwrite if port is already set)
      await refreshPorts()
      await pollStatus()
      await fetchFaults()
    }
    init()

    const t = setInterval(pollStatus, 1500)
    return () => clearInterval(t)
  }, [refreshPorts, pollStatus, fetchFaults])

  // ── Actions ──────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!port) { onToast("error", "Select a COM port first"); return }
    setLoading(true)
    try {
      await startModbusServer(port, baud)
      onToast("success", `Modbus started: ${port} @ ${baud} baud`)
    } catch (err) { onToast("error", String(err)) }
    finally { setLoading(false) }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try { await stopModbusServer(); onToast("info", "Modbus server stopped") }
    catch (err) { onToast("error", String(err)) }
    finally { setLoading(false) }
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

  const connected = status?.connected ?? false

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ── Connection Status Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("h-3 w-3 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40")} />
          <Cable size={14} className="text-muted-foreground" />
          <span className="text-sm font-bold">Modbus RTU Slave</span>
          <Badge variant={connected ? "default" : "secondary"} className="text-[10px]">
            {connected ? `ACTIVE: ${status?.port}` : "IDLE"}
          </Badge>
        </div>
        {connected && (
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            <span>RX: <span className="text-primary font-bold">{status?.rx_count}</span></span>
            <span>TX: <span className="text-primary font-bold">{status?.tx_count}</span></span>
          </div>
        )}
      </div>

      {/* ── Port Config ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* COM Port */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">COM Port</label>
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <select
                className="w-full h-8 rounded-md border border-input bg-background pl-2 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                value={port}
                onChange={e => setPort(e.target.value)}
                disabled={connected}
              >
                {ports.length === 0 && <option value="">No ports found</option>}
                {ports.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={refreshPorts}
              title="Refresh ports"
            >
              <RefreshCw size={13} />
            </Button>
          </div>
        </div>

        {/* Baud Rate */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Baud Rate</label>
          <div className="relative">
            <select
              className="w-full h-8 rounded-md border border-input bg-background pl-2 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
              value={baud}
              onChange={e => setBaud(Number(e.target.value))}
              disabled={connected}
            >
              {BAUD_RATES.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Connect/Disconnect — full width */}
        <div className="col-span-2">
          {connected ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs gap-1.5"
              onClick={handleDisconnect}
              disabled={loading}
            >
              <Unplug size={14} /> Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full h-9 text-xs gap-1.5"
              onClick={handleConnect}
              disabled={loading || ports.length === 0}
            >
              <Plug size={14} /> Connect
            </Button>
          )}
        </div>
      </div>

      {/* ── Fault Injection ── */}
      <div className="rounded-lg border border-dashed border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
        <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
          <AlertTriangle size={11} /> Fault Injection
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

        <div className="grid grid-cols-3 gap-2">
          {/* Timeout */}
          <button
            className={cn(
              "flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-[10px] font-semibold transition-all cursor-pointer",
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
              "flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-[10px] font-semibold transition-all cursor-pointer",
              fault.crc_error
                ? "bg-red-500/20 border-red-500 text-red-400"
                : "border-border text-muted-foreground hover:border-red-500/40"
            )}
            onClick={() => updateFaults({ ...fault, crc_error: !fault.crc_error })}
          >
            <AlertCircle size={11} /> CRC {fault.crc_error ? "ON" : "OFF"}
          </button>

          {/* Exception Code */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-muted-foreground uppercase">Exception</label>
            <div className="relative">
              <select
                className="w-full h-6 rounded border border-input bg-background pl-1 pr-6 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
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
