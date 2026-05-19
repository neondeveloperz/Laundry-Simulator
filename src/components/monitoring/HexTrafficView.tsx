// Path: src/components/monitoring/HexTrafficView.tsx
import { useState, useEffect, useRef } from "react"
import { listen } from "@tauri-apps/api/event"
import { Binary, Trash2, PauseCircle, PlayCircle, ArrowDown } from "lucide-react"
import type { ModbusFrame } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const FC_NAMES: Record<number, string> = {
  0x03: "FC03 Read Holding",
  0x04: "FC04 Read Input",
  0x06: "FC06 Write Single",
  0x10: "FC10 Write Multi",
}

export function HexTrafficView() {
  const [frames, setFrames]   = useState<ModbusFrame[]>([])
  const [paused, setPaused]   = useState(false)
  const [filter, setFilter]   = useState<number | null>(null) // unit_id filter
  const [search, setSearch]   = useState("")
  const bottomRef             = useRef<HTMLDivElement>(null)
  const pausedRef             = useRef(false)

  pausedRef.current = paused

  useEffect(() => {
    const unlisten = listen<ModbusFrame>("modbus-frame", e => {
      if (!pausedRef.current) {
        setFrames(prev => [...prev.slice(-499), e.payload])
      }
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [frames, paused])

  // Unique unit IDs seen
  const seenIds = [...new Set(frames.map(f => f.unit_id))].sort((a, b) => a - b)
  const visible = frames.filter(f => {
    const matchesFilter = filter === null || f.unit_id === filter
    const matchesSearch = !search ||
      f.hex.toLowerCase().includes(search.toLowerCase()) ||
      f.desc.toLowerCase().includes(search.toLowerCase()) ||
      String(f.unit_id).includes(search)
    return matchesFilter && matchesSearch
  })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 flex-shrink-0 bg-muted/20 flex-wrap gap-y-1">
        <Binary size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">HEX TRAFFIC</span>
        <Badge variant="secondary" className="text-[10px] h-5">{visible.length} frames</Badge>

        {/* Search bar */}
        <input
          type="text"
          placeholder="Search hex / description..."
          className="h-6 rounded border border-input bg-background px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary w-36 ml-2"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Unit ID filter */}
        {seenIds.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] text-muted-foreground">ID:</span>
            <button
              onClick={() => setFilter(null)}
              className={cn(
                "h-5 px-2 rounded text-[10px] font-semibold border transition-all",
                filter === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              ALL
            </button>
            {seenIds.map(id => (
              <button
                key={id}
                onClick={() => setFilter(filter === id ? null : id)}
                className={cn(
                  "h-5 px-2 rounded text-[10px] font-semibold border transition-all",
                  filter === id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                #{id}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1 text-xs"
            onClick={() => setPaused(p => !p)}
          >
            {paused
              ? <><PlayCircle size={13} /> Resume</>
              : <><PauseCircle size={13} /> Pause</>
            }
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => setFrames([])}
          >
            <Trash2 size={13} /> Clear
          </Button>
        </div>
      </div>

      {/* Frame list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1" id="hex-traffic-list">
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs gap-2">
            <Binary size={20} strokeWidth={1.2} />
            <span>{frames.length === 0 ? "Waiting for Modbus frames…" : "No frames match filter"}</span>
          </div>
        )}
        {visible.map((frame, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border bg-muted/20 px-3 py-2 font-mono text-[11px] space-y-1",
              "hover:bg-muted/40 transition-colors",
            )}
          >
            {/* Frame header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground/60 text-[10px]">{frame.timestamp}</span>
              <Badge className="text-[9px] h-4 px-1.5 gap-0.5">
                <ArrowDown size={9} />
                RX
              </Badge>
              <span className="text-primary/80 font-bold">ID:{frame.unit_id}</span>
              <span className={cn(
                "text-[10px] px-1.5 rounded border",
                frame.function_code === 0x03 || frame.function_code === 0x04
                  ? "border-blue-500/30 text-blue-300"
                  : "border-emerald-500/30 text-emerald-300"
              )}>
                {FC_NAMES[frame.function_code] ?? `FC${frame.function_code.toString(16).toUpperCase().padStart(2,"0")}`}
              </span>
              <span className="text-muted-foreground text-[10px] ml-auto">{frame.desc}</span>
            </div>
            {/* Hex bytes */}
            <div className="flex flex-wrap gap-1">
              {frame.hex.split(" ").map((byte, j) => (
                <span
                  key={j}
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                    j === 0 ? "bg-primary/20 text-primary" :           // unit_id
                    j === 1 ? "bg-blue-500/20 text-blue-300" :         // function code
                    j >= frame.hex.split(" ").length - 2 ? "bg-muted text-muted-foreground" : // CRC
                    "bg-muted/50 text-foreground/80"
                  )}
                >
                  {byte}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {paused && (
        <div className="border-t bg-yellow-500/10 px-4 py-1 text-[10px] text-yellow-400 font-mono flex items-center gap-1">
          <PauseCircle size={11} /> Capture paused
        </div>
      )}
    </div>
  )
}
