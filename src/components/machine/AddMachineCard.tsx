// Path: src/components/machine/AddMachineCard.tsx
import { useState, useEffect, useMemo } from "react"
import { PlusCircle, Waves, Wind, Cable, ChevronDown } from "lucide-react"
import { addMachine, getModbusStatus, listSerialPorts, getConfig } from "@/lib/commands"
import type { Machine, MachineType, Toast } from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AddMachineCardProps {
  onAdd: () => void
  onToast: (type: Toast["type"], msg: string) => void
  machines?: Machine[]
  nextId?: number
}

export function AddMachineCard({ onAdd, onToast, machines = [] }: AddMachineCardProps) {
  const [type, setType]               = useState<MachineType>("Washer")
  const [selectedPort, setSelectedPort] = useState<string>("")
  const [unitId, setUnitId]           = useState<number>(1)
  const [availablePorts, setAvailablePorts] = useState<string[]>([])
  const [loading, setLoading]         = useState(false)

  // Fetch available and configured ports
  useEffect(() => {
    const loadPorts = async () => {
      try {
        const [modbusStat, serialList, cfg] = await Promise.all([
          getModbusStatus().catch(() => null),
          listSerialPorts().catch(() => []),
          getConfig().catch(() => null),
        ])

        const portsSet = new Set<string>()
        if (modbusStat?.ports) {
          for (const p of modbusStat.ports) portsSet.add(p.port)
        }
        if (cfg?.ports) {
          for (const p of cfg.ports) portsSet.add(p.port)
        }
        if (cfg?.last_port) portsSet.add(cfg.last_port)
        for (const p of serialList) portsSet.add(p)

        const uniquePorts = Array.from(portsSet).filter(Boolean)
        setAvailablePorts(uniquePorts)

        // Default to first port if available
        if (uniquePorts.length > 0 && !selectedPort) {
          setSelectedPort(uniquePorts[0])
        }
      } catch { /* ignore */ }
    }
    loadPorts()
  }, [])

  // Auto-calculate the next recommended Unit ID for the selected port
  const suggestedUnitId = useMemo(() => {
    const portMachines = machines.filter(m => {
      if (!selectedPort || selectedPort === "all") {
        return !m.port || m.port === "all"
      }
      return m.port === selectedPort
    })
    const existingUnitIds = portMachines.map(m => m.unit_id)
    let candidate = 1
    while (existingUnitIds.includes(candidate) && candidate <= 247) {
      candidate++
    }
    return candidate
  }, [machines, selectedPort])

  // Update unitId when suggestedUnitId changes, if user hasn't customized
  useEffect(() => {
    setUnitId(suggestedUnitId)
  }, [suggestedUnitId])

  const handleAdd = async () => {
    setLoading(true)
    try {
      const portParam = selectedPort === "all" ? undefined : selectedPort
      await addMachine(type, unitId, portParam)
      const portLabel = portParam ? portParam.split("/").pop() : "All Ports"
      onToast("success", `Added ${type} with Unit ID ${unitId} on ${portLabel}`)
      onAdd()
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setLoading(false)
    }
  }

  const portDisplayLabel = selectedPort && selectedPort !== "all"
    ? selectedPort.split("/").pop()
    : "All Ports"

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 hover:border-primary/40 transition-all duration-200">
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-2">
          <PlusCircle size={18} className="text-primary" />
          <span className="font-semibold text-sm text-foreground">Add Machine</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">Multi-Port Aware</span>
      </div>

      {/* Type selector */}
      <div className="flex gap-2">
        {(["Washer", "Dryer"] as MachineType[]).map(t => (
          <button
            key={t}
            type="button"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all cursor-pointer",
              type === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50"
            )}
            onClick={() => setType(t)}
          >
            {t === "Washer"
              ? <Waves size={14} />
              : <Wind  size={14} />
            }
            {t}
          </button>
        ))}
      </div>

      {/* Port Selection */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1">
          <Cable size={11} /> Associated RS485 Port
        </label>
        <div className="relative">
          <select
            className="w-full h-7 rounded-md border border-input bg-background pl-2 pr-7 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
            value={selectedPort}
            onChange={e => setSelectedPort(e.target.value)}
          >
            <option value="all">All Ports (Shared / Any)</option>
            {availablePorts.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Unit ID (Can be same on different ports!) */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col flex-1">
          <label className="text-[10px] text-muted-foreground font-semibold uppercase">Modbus Unit ID</label>
          <span className="text-[9px] text-muted-foreground/70">Same ID allowed on different ports</span>
        </div>
        <input
          type="number"
          min={1}
          max={247}
          value={unitId}
          onChange={e => setUnitId(Number(e.target.value))}
          className="w-20 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Button
        className="h-8 text-xs font-bold gap-1 mt-1"
        onClick={handleAdd}
        disabled={loading}
      >
        {loading
          ? "Adding…"
          : <><PlusCircle size={13} /> Add {type} #{unitId} on {portDisplayLabel}</>
        }
      </Button>
    </div>
  )
}
