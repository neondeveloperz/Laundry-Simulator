// Path: src/components/machine/AddMachineCard.tsx
import { useState } from "react"
import { PlusCircle, Waves, Wind } from "lucide-react"
import { trackedInvoke } from "@/lib/tauri"
import type { MachineType, Toast } from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AddMachineCardProps {
  nextId: number
  onAdd: () => void
  onToast: (type: Toast["type"], msg: string) => void
}

export function AddMachineCard({ nextId, onAdd, onToast }: AddMachineCardProps) {
  const [type, setType]       = useState<MachineType>("Washer")
  const [unitId, setUnitId]   = useState(nextId)
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    setLoading(true)
    try {
      await trackedInvoke("add_machine", { machineTypeStr: type, unitId })
      onToast("success", `Added ${type} #${unitId}`)
      onAdd()
      setUnitId(unitId + 1)
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 hover:border-primary/40 transition-all duration-200">
      <div className="flex items-center gap-2 text-muted-foreground">
        <PlusCircle size={18} />
        <span className="font-semibold text-sm">Add Machine</span>
      </div>

      {/* Type selector */}
      <div className="flex gap-2">
        {(["Washer", "Dryer"] as MachineType[]).map(t => (
          <button
            key={t}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all",
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

      {/* Unit ID */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground font-medium w-14">UNIT ID</label>
        <input
          type="number"
          min={1}
          max={247}
          value={unitId}
          onChange={e => setUnitId(Number(e.target.value))}
          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Button
        className="h-8 text-xs font-bold gap-1"
        onClick={handleAdd}
        disabled={loading}
      >
        {loading
          ? "Adding…"
          : <><PlusCircle size={13} /> Add {type} #{unitId}</>
        }
      </Button>
    </div>
  )
}
