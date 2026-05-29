// Path: src/components/monitoring/VirtualPlcView.tsx
import { useState, useEffect, useCallback } from "react"
import { Cpu, Play, Square, Terminal, ArrowRight, History, Sparkles, RefreshCw } from "lucide-react"
import {
  listSerialPorts,
  startModbusClient,
  stopModbusClient,
  getModbusClientStatus,
  modbusClientRequest,
  getConfig,
} from "@/lib/commands"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Toast, SimulatorConfig } from "@/types"

interface VirtualPlcViewProps {
  onToast: (type: Toast["type"], msg: string) => void
}

interface TxLog {
  timestamp: string
  unitId: number
  fc: number
  address: number
  valueOrQty: number
  status: "success" | "error"
  result?: number[]
  errorMsg?: string
}

export function VirtualPlcView({ onToast }: VirtualPlcViewProps) {
  const [ports, setPorts] = useState<string[]>([])
  const [selectedPort, setSelectedPort] = useState("")
  const [baud, setBaud] = useState(9600)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)

  // Config-driven presets
  const [config, setConfig] = useState<SimulatorConfig | null>(null)
  const [washerProg, setWasherProg] = useState(1)
  const [dryerProg, setDryerProg] = useState(1)

  // Custom request states
  const [unitId, setUnitId] = useState(1)
  const [fc, setFc] = useState(6)
  const [address, setAddress] = useState(1)
  const [valueOrQty, setValueOrQty] = useState(1)

  // Logs
  const [txLogs, setTxLogs] = useState<TxLog[]>([])

  const refreshPorts = useCallback(async () => {
    try {
      const list = await listSerialPorts()
      setPorts(list)
      // Use functional setState to avoid depending on `selectedPort`
      setSelectedPort(prev => (prev === "" && list.length > 0) ? list[0] : prev)
    } catch { /* ignore */ }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const active = await getModbusClientStatus()
      setConnected(active)
    } catch { /* ignore */ }
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await getConfig()
      setConfig(cfg)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    refreshPorts()
    checkStatus()
    loadConfig()
    const t = setInterval(checkStatus, 2000)
    return () => clearInterval(t)
  }, [refreshPorts, checkStatus, loadConfig])

  // Helper to get program price from config
  const getPrice = (type: "washer" | "dryer", progId: number): number => {
    if (!config) return 0
    const programs = type === "washer" ? config.washer_programs : config.dryer_programs
    return programs.find(p => p.id === progId)?.price ?? 0
  }

  // Helper to get register mapping
  const getMapping = (type: "washer" | "dryer") => {
    if (!config) return null
    return type === "washer" ? config.washer_mapping : config.dryer_mapping
  }

  const handleConnect = async () => {
    if (!selectedPort) {
      onToast("warning", "Please select a serial port")
      return
    }
    setLoading(true)
    try {
      await startModbusClient(selectedPort, baud)
      setConnected(true)
      onToast("success", `Modbus Client connected to ${selectedPort}`)
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await stopModbusClient()
      setConnected(false)
      onToast("info", "Modbus Client disconnected")
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setLoading(false)
    }
  }

  const sendRequest = async (overrideParams?: { unitId: number; fc: number; address: number; valueOrQty: number }) => {
    if (!connected) {
      onToast("warning", "Modbus Client is not connected")
      return
    }

    const u = overrideParams ? overrideParams.unitId : unitId
    const f = overrideParams ? overrideParams.fc : fc
    const a = overrideParams ? overrideParams.address : address
    const v = overrideParams ? overrideParams.valueOrQty : valueOrQty

    const newLog: TxLog = {
      timestamp: new Date().toLocaleTimeString(),
      unitId: u,
      fc: f,
      address: a,
      valueOrQty: v,
      status: "success",
    }

    try {
      const res = await modbusClientRequest(u, f, a, v)
      newLog.result = res
      setTxLogs(prev => [newLog, ...prev.slice(0, 49)])
      onToast("success", `Modbus Transaction complete: FC0${f} succeeded`)
    } catch (err) {
      newLog.status = "error"
      newLog.errorMsg = String(err)
      setTxLogs(prev => [newLog, ...prev.slice(0, 49)])
      onToast("error", `Modbus Request failed: ${err}`)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 bg-muted/20 flex-shrink-0">
        <Cpu size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase">Virtual PLC Controller</span>
        <span className="text-[10px] text-muted-foreground/60 font-mono ml-1">
          Built-in Modbus RTU Client (Master)
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/5">

        {/* Connection card */}
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("h-2.5 w-2.5 rounded-full", connected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40")} />
              <span className="font-bold text-sm">COM Port Connection</span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={refreshPorts}
              className="h-7 px-2 gap-1 text-[11px]"
            >
              <RefreshCw size={11} /> Refresh Ports
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 items-center">

            {/* Port dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Port:</span>
              <select
                value={selectedPort}
                onChange={e => setSelectedPort(e.target.value)}
                disabled={connected}
                className="h-8 px-2 border bg-background rounded focus:ring-1 focus:ring-primary focus:outline-none"
              >
                {ports.length === 0 ? (
                  <option value="">No COM Ports detected</option>
                ) : (
                  ports.map(p => <option key={p} value={p}>{p}</option>)
                )}
              </select>
            </div>

            {/* Baud rate */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Baud:</span>
              <select
                value={baud}
                onChange={e => setBaud(Number(e.target.value))}
                disabled={connected}
                className="h-8 px-2 border bg-background rounded focus:ring-1 focus:ring-primary focus:outline-none"
              >
                {[9600, 19200, 38400, 57600, 115200].map(b => (
                  <option key={b} value={b}>{b} bps</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="ml-auto flex gap-2">
              {connected ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="h-8 px-3 gap-1.5 text-xs font-semibold"
                >
                  <Square size={12} /> Disconnect Client
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={loading || !selectedPort}
                  className="h-8 px-3 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Play size={12} /> Connect Serial Client
                </Button>
              )}
            </div>

          </div>
        </div>

        {/* Workspace Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

          {/* Left panel: Presets & Manual Transaction */}
          <div className="space-y-4">

            {/* Quick Action Presets */}
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-1.5 text-primary">
                <Sparkles size={14} className="animate-pulse" />
                <span className="font-bold text-xs uppercase tracking-wide">Quick PLC Simulation Presets</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Easily simulate Modbus Master commands. Below are standardized register command shortcuts.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Washer Commands Card */}
                <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
                  <span className="font-bold text-xs text-blue-500 block">Washer Presets (Slave 1)</span>

                  {/* Program selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-bold">Program:</span>
                    <select
                      value={washerProg}
                      onChange={e => setWasherProg(Number(e.target.value))}
                      className="h-7 px-2 border bg-background rounded text-[10px] flex-1 focus:ring-1 focus:ring-primary focus:outline-none"
                    >
                      {(config?.washer_programs ?? []).map(p => (
                        <option key={p.id} value={p.id}>{p.label} — {p.price}฿</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("washer")
                          if (m) sendRequest({ unitId: 1, fc: 6, address: m.write_coins, valueOrQty: getPrice("washer", washerProg) })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card"
                      >
                        Insert {getPrice("washer", washerProg)}฿
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("washer")
                          if (m) sendRequest({ unitId: 1, fc: 6, address: m.write_program, valueOrQty: washerProg })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card"
                      >
                        Select Prog {washerProg}
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("washer")
                          if (m) sendRequest({ unitId: 1, fc: 6, address: m.write_start, valueOrQty: 1 })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card"
                      >
                        Start Program
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("washer")
                          if (m) sendRequest({ unitId: 1, fc: 6, address: m.write_stop, valueOrQty: 1 })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        Force Stop
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!connected}
                      onClick={() => sendRequest({ unitId: 1, fc: 3, address: 20, valueOrQty: 21 })}
                      className="text-[10px] h-7 bg-card border-blue-500/20 text-blue-500 hover:bg-blue-500/5"
                    >
                      Read All Registers (FC03, Add. 20 Qty 21)
                    </Button>
                  </div>
                </div>

                {/* Dryer Commands Card */}
                <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
                  <span className="font-bold text-xs text-orange-500 block">Dryer Presets (Slave 2)</span>

                  {/* Program selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-bold">Program:</span>
                    <select
                      value={dryerProg}
                      onChange={e => setDryerProg(Number(e.target.value))}
                      className="h-7 px-2 border bg-background rounded text-[10px] flex-1 focus:ring-1 focus:ring-primary focus:outline-none"
                    >
                      {(config?.dryer_programs ?? []).map(p => (
                        <option key={p.id} value={p.id}>{p.label} — {p.price}฿</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("dryer")
                          if (m) sendRequest({ unitId: 2, fc: 6, address: m.write_coins, valueOrQty: getPrice("dryer", dryerProg) })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card"
                      >
                        Insert {getPrice("dryer", dryerProg)}฿
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("dryer")
                          if (m) sendRequest({ unitId: 2, fc: 6, address: m.write_program, valueOrQty: dryerProg })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card"
                      >
                        Select Prog {dryerProg}
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("dryer")
                          if (m) sendRequest({ unitId: 2, fc: 6, address: m.write_start, valueOrQty: 1 })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card"
                      >
                        Start Program
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!connected || !config}
                        onClick={() => {
                          const m = getMapping("dryer")
                          if (m) sendRequest({ unitId: 2, fc: 6, address: m.write_error_reset, valueOrQty: 1 })
                        }}
                        className="flex-1 text-[10px] h-7 bg-card text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        Reset/Silence
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!connected}
                      onClick={() => sendRequest({ unitId: 2, fc: 3, address: 20, valueOrQty: 21 })}
                      className="text-[10px] h-7 bg-card border-orange-500/20 text-orange-500 hover:bg-orange-500/5"
                    >
                      Read All Registers (FC03, Add. 20 Qty 21)
                    </Button>
                  </div>
                </div>

              </div>
            </div>

            {/* Manual Modbus Transaction Builder */}
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-1.5 text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                <Terminal size={14} />
                <span>Manual Transaction Builder</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">

                {/* Unit ID */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Slave Unit ID</span>
                  <input
                    type="number"
                    min={1}
                    max={247}
                    value={unitId}
                    onChange={e => setUnitId(Number(e.target.value))}
                    className="h-8 w-full border bg-background rounded px-2 text-xs font-mono"
                  />
                </div>

                {/* FC */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Function Code</span>
                  <select
                    value={fc}
                    onChange={e => setFc(Number(e.target.value))}
                    className="h-8 w-full border bg-background rounded px-2 text-xs font-semibold focus:outline-none"
                  >
                    <option value={3}>Read Holding Registers (03)</option>
                    <option value={4}>Read Input Registers (04)</option>
                    <option value={5}>Write Single Coil (05)</option>
                    <option value={6}>Write Single Register (06)</option>
                  </select>
                </div>

                {/* Address */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Register Address (Base 10)</span>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={address}
                    onChange={e => setAddress(Number(e.target.value))}
                    className="h-8 w-full border bg-background rounded px-2 text-xs font-mono"
                  />
                </div>

                {/* Value/Qty */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                    {[3, 4].includes(fc) ? "Quantity (Registers)" : "Write Value"}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={valueOrQty}
                    onChange={e => setValueOrQty(Number(e.target.value))}
                    className="h-8 w-full border bg-background rounded px-2 text-xs font-mono"
                  />
                </div>

              </div>

              <Button
                disabled={!connected}
                onClick={() => sendRequest()}
                className="w-full h-9 gap-2 text-xs font-bold"
              >
                Send Request Frame <ArrowRight size={14} />
              </Button>
            </div>

          </div>

          {/* Right panel: Transaction history log */}
          <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col h-[400px] lg:h-auto overflow-hidden">
            <div className="flex items-center gap-1.5 text-muted-foreground font-semibold text-xs uppercase tracking-wide border-b pb-2 flex-shrink-0">
              <History size={14} />
              <span>Request Logger</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y font-mono text-[10px] pt-2 space-y-2.5">
              {txLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground opacity-60">
                  No Modbus transactions executed.
                </div>
              ) : (
                txLogs.map((log, idx) => (
                  <div key={idx} className="pt-2.5 first:pt-0">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-[9px] text-muted-foreground">{log.timestamp}</span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded font-bold text-[8px]",
                        log.status === "success" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                      )}>
                        {log.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-1 space-y-0.5 text-muted-foreground">
                      <div><span className="font-semibold text-foreground">REQ:</span> [ID {log.unitId}] FC0{log.fc} Addr {log.address} ({log.valueOrQty})</div>
                      {log.result !== undefined && (
                        <div className="text-emerald-500/90 truncate">
                          <span className="font-semibold text-foreground">RESP:</span> {JSON.stringify(log.result)}
                        </div>
                      )}
                      {log.errorMsg !== undefined && (
                        <div className="text-red-500/90 whitespace-normal leading-tight">
                          <span className="font-semibold text-foreground">ERR:</span> {log.errorMsg}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
