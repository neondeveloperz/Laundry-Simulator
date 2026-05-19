// Path: src/components/monitoring/EventStreamView.tsx
import { useState, useEffect, useRef } from "react"
import { listen } from "@tauri-apps/api/event"
import { ScrollText, Trash2, PauseCircle, PlayCircle, Filter } from "lucide-react"
import type { LogEntry } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const LEVEL_STYLE: Record<string, string> = {
  INFO:     "border-blue-500/30 text-blue-300 bg-blue-500/10",
  MODBUS:   "border-primary/30 text-primary bg-primary/10",
  ERROR:    "border-destructive/30 text-destructive bg-destructive/10",
  SCENARIO: "border-amber-500/30 text-amber-400 bg-amber-500/10",
}

const LEVELS = ["ALL", "INFO", "MODBUS", "ERROR", "SCENARIO"] as const
type Level = typeof LEVELS[number]

export function EventStreamView() {
  const [logs, setLogs]       = useState<LogEntry[]>([])
  const [paused, setPaused]   = useState(false)
  const [filter, setFilter]   = useState<Level>("ALL")
  const bottomRef             = useRef<HTMLDivElement>(null)
  const pausedRef             = useRef(false)

  pausedRef.current = paused

  useEffect(() => {
    const unlisten = listen<LogEntry>("log-event", e => {
      if (!pausedRef.current) {
        setLogs(prev => [...prev.slice(-999), e.payload])
      }
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Auto-scroll when not paused
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, paused])

  const visible = filter === "ALL" ? logs : logs.filter(l => l.level === filter)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 flex-shrink-0 bg-muted/20">
        <ScrollText size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">EVENT STREAM</span>
        <Badge variant="secondary" className="text-[10px] h-5">{visible.length} / {logs.length}</Badge>

        <div className="flex items-center gap-1 ml-2">
          <Filter size={11} className="text-muted-foreground" />
          {LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className={cn(
                "h-5 px-2 rounded text-[10px] font-semibold border transition-all",
                filter === l
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {l}
            </button>
          ))}
        </div>

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
            onClick={() => setLogs([])}
          >
            <Trash2 size={13} /> Clear
          </Button>
        </div>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] p-2 space-y-0.5" id="log-stream-list">
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs gap-2">
            <ScrollText size={20} strokeWidth={1.2} />
            <span>Waiting for events…</span>
          </div>
        )}
        {visible.map((log, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2 px-2 py-0.5 rounded hover:bg-muted/30 transition-colors",
            )}
          >
            <span className="text-muted-foreground/60 shrink-0 w-20">{log.timestamp}</span>
            <span className={cn(
              "shrink-0 text-[10px] font-bold px-1.5 rounded border",
              LEVEL_STYLE[log.level] ?? "border-border text-muted-foreground"
            )}>
              {log.level}
            </span>
            <span className="text-foreground/90 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Paused indicator */}
      {paused && (
        <div className="border-t bg-yellow-500/10 px-4 py-1 text-[10px] text-yellow-400 font-mono flex items-center gap-1">
          <PauseCircle size={11} /> Stream paused — new events buffered
        </div>
      )}
    </div>
  )
}
