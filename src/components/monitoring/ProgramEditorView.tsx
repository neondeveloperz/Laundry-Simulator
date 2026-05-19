// Path: src/components/monitoring/ProgramEditorView.tsx
import { useState, useEffect, useCallback } from "react"
import { SlidersHorizontal, Save, RotateCcw, Waves, Wind, Clock, Plus, Trash2, ArrowUp, ArrowDown, Sparkles } from "lucide-react"
import { getConfig, updateSimulatorPrograms } from "@/lib/commands"
import type { ProgramInfo, SimulatorConfig, Toast, ProgramStep } from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const WASHER_DEFAULTS: ProgramInfo[] = [
  { id: 1, label: "QuickWash", minutes: 30, price: 30, steps: [] },
  { id: 2, label: "Normal", minutes: 45, price: 40, steps: [] },
  { id: 3, label: "Heavy", minutes: 60, price: 50, steps: [] },
  { id: 4, label: "Delicate", minutes: 35, price: 40, steps: [] },
  { id: 5, label: "Sanitize", minutes: 75, price: 60, steps: [] },
]
const DRYER_DEFAULTS: ProgramInfo[] = [
  { id: 1, label: "Air Dry", minutes: 20, price: 20, steps: [] },
  { id: 2, label: "Low Heat", minutes: 35, price: 30, steps: [] },
  { id: 3, label: "Normal", minutes: 45, price: 40, steps: [] },
  { id: 4, label: "High Heat", minutes: 60, price: 50, steps: [] },
  { id: 5, label: "Extra Dry", minutes: 75, price: 60, steps: [] },
]

const GET_DEFAULT_STEPS = (type: "Washer" | "Dryer", duration: number): ProgramStep[] => {
  if (type === "Washer") {
    return [
      { name: "Filling", duration_mins: Math.max(1, Math.round(duration * 0.3)), target_water: 100, target_temp: 30, target_rpm: 0 },
      { name: "Washing", duration_mins: Math.max(1, Math.round(duration * 0.45)), target_water: 80, target_temp: 40, target_rpm: 50 },
      { name: "Rinsing", duration_mins: Math.max(1, Math.round(duration * 0.15)), target_water: 50, target_temp: 25, target_rpm: 70 },
      { name: "Spinning", duration_mins: Math.max(1, Math.round(duration * 0.1)), target_water: 0, target_temp: 25, target_rpm: 1200 },
    ]
  } else {
    return [
      { name: "Drying", duration_mins: Math.max(1, Math.round(duration * 0.85)), target_water: 0, target_temp: 65, target_rpm: 50 },
      { name: "Cool Down", duration_mins: Math.max(1, Math.round(duration * 0.15)), target_water: 0, target_temp: 25, target_rpm: 40 },
    ]
  }
}

type ProgramField = "label" | "minutes" | "price"

export function ProgramEditorView({ onToast }: { onToast: (type: Toast["type"], msg: string) => void }) {
  const [, setConfig] = useState<SimulatorConfig | null>(null)
  const [washerProgs, setWasherProgs] = useState<ProgramInfo[]>(WASHER_DEFAULTS)
  const [dryerProgs, setDryerProgs] = useState<ProgramInfo[]>(DRYER_DEFAULTS)
  const [washerDirty, setWasherDirty] = useState(false)
  const [dryerDirty, setDryerDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Selector for active program designer
  const [selectedType, setSelectedType] = useState<"Washer" | "Dryer">("Washer")
  const [selectedId, setSelectedId] = useState<number>(1)

  const load = useCallback(async () => {
    try {
      const cfg = await getConfig()
      setConfig(cfg)
      if (cfg.washer_programs?.length) setWasherProgs(cfg.washer_programs)
      if (cfg.dryer_programs?.length) setDryerProgs(cfg.dryer_programs)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const updateWasher = (id: number, field: ProgramField, val: string | number) => {
    setWasherProgs(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p))
    setWasherDirty(true)
  }

  const updateDryer = (id: number, field: ProgramField, val: string | number) => {
    setDryerProgs(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p))
    setDryerDirty(true)
  }

  const activeProgramList = selectedType === "Washer" ? washerProgs : dryerProgs
  const activeProgram = activeProgramList.find(p => p.id === selectedId) || activeProgramList[0]

  // Seeding steps if empty
  const activeSteps = activeProgram.steps && activeProgram.steps.length > 0
    ? activeProgram.steps
    : GET_DEFAULT_STEPS(selectedType, activeProgram.minutes)

  const updateActiveSteps = (newSteps: ProgramStep[]) => {
    // Recalculate total duration based on sum of steps duration
    const totalMinutes = newSteps.reduce((acc, s) => acc + s.duration_mins, 0)

    if (selectedType === "Washer") {
      setWasherProgs(prev => prev.map(p => p.id === selectedId ? { ...p, steps: newSteps, minutes: totalMinutes } : p))
      setWasherDirty(true)
    } else {
      setDryerProgs(prev => prev.map(p => p.id === selectedId ? { ...p, steps: newSteps, minutes: totalMinutes } : p))
      setDryerDirty(true)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Before saving, ensure all programs have seeded steps if they are empty
      const washerToSave = washerProgs.map(p => ({
        ...p,
        steps: p.steps && p.steps.length > 0 ? p.steps : GET_DEFAULT_STEPS("Washer", p.minutes)
      }))
      const dryerToSave = dryerProgs.map(p => ({
        ...p,
        steps: p.steps && p.steps.length > 0 ? p.steps : GET_DEFAULT_STEPS("Dryer", p.minutes)
      }))

      await updateSimulatorPrograms(washerToSave, dryerToSave)
      setWasherDirty(false)
      setDryerDirty(false)
      onToast("success", "Custom wash/dry cycles saved successfully")
      await load()
    } catch (err) {
      onToast("error", String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setWasherProgs(WASHER_DEFAULTS.map(p => ({ ...p, steps: GET_DEFAULT_STEPS("Washer", p.minutes) })))
    setDryerProgs(DRYER_DEFAULTS.map(p => ({ ...p, steps: GET_DEFAULT_STEPS("Dryer", p.minutes) })))
    setWasherDirty(true)
    setDryerDirty(true)
    onToast("info", "Reset programs to standard factory cycles. Click Save to apply.")
  }

  const handleAddProgram = (type: "Washer" | "Dryer") => {
    const list = type === "Washer" ? washerProgs : dryerProgs
    const maxId = list.reduce((max, p) => p.id > max ? p.id : max, 0)
    const nextId = maxId + 1

    const newProgram: ProgramInfo = {
      id: nextId,
      label: `New Program ${nextId}`,
      minutes: type === "Washer" ? 40 : 30,
      price: type === "Washer" ? 40 : 30,
      steps: GET_DEFAULT_STEPS(type, type === "Washer" ? 40 : 30),
    }

    if (type === "Washer") {
      setWasherProgs(prev => [...prev, newProgram])
      setWasherDirty(true)
      setSelectedType("Washer")
      setSelectedId(nextId)
    } else {
      setDryerProgs(prev => [...prev, newProgram])
      setDryerDirty(true)
      setSelectedType("Dryer")
      setSelectedId(nextId)
    }
    onToast("success", `Added new ${type.toLowerCase()} program P${nextId}`)
  }

  const handleDeleteProgram = (type: "Washer" | "Dryer", id: number) => {
    const list = type === "Washer" ? washerProgs : dryerProgs
    if (list.length <= 1) {
      onToast("warning", `Cannot delete: A ${type.toLowerCase()} must have at least one program.`)
      return
    }

    const nextList = list.filter(p => p.id !== id)

    if (type === "Washer") {
      setWasherProgs(nextList)
      setWasherDirty(true)
      if (selectedType === "Washer" && selectedId === id) {
        setSelectedId(nextList[0].id)
      }
    } else {
      setDryerProgs(nextList)
      setDryerDirty(true)
      if (selectedType === "Dryer" && selectedId === id) {
        setSelectedId(nextList[0].id)
      }
    }
    onToast("info", `Removed program P${id}. Click Save to apply.`)
  }

  // Steps Designer handlers
  const handleAddStep = () => {
    const defaultStep: ProgramStep = selectedType === "Washer"
      ? { name: "Custom Wash", duration_mins: 5, target_water: 80, target_temp: 35, target_rpm: 50 }
      : { name: "Low Tumble", duration_mins: 5, target_water: 0, target_temp: 45, target_rpm: 50 }

    updateActiveSteps([...activeSteps, defaultStep])
  }

  const handleDeleteStep = (index: number) => {
    if (activeSteps.length <= 1) {
      onToast("warning", "A program must have at least one step")
      return
    }
    const next = [...activeSteps]
    next.splice(index, 1)
    updateActiveSteps(next)
  }

  const handleMoveStep = (index: number, dir: "up" | "down") => {
    if (dir === "up" && index === 0) return
    if (dir === "down" && index === activeSteps.length - 1) return
    const targetIdx = dir === "up" ? index - 1 : index + 1
    const next = [...activeSteps]
    const temp = next[index]
    next[index] = next[targetIdx]
    next[targetIdx] = temp
    updateActiveSteps(next)
  }

  const handleUpdateStepField = (index: number, field: keyof ProgramStep, value: string | number) => {
    const next = activeSteps.map((s, idx) => {
      if (idx === index) {
        return { ...s, [field]: value }
      }
      return s
    })
    updateActiveSteps(next)
  }

  const isDirty = washerDirty || dryerDirty

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 flex-shrink-0 bg-muted/20">
        <SlidersHorizontal size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase">Cycle & Program Designer</span>
        <span className="text-[10px] text-muted-foreground/60 font-mono ml-1">
          Real-time Custom State Machines
        </span>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:bg-muted/80"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw size={12} /> Reset Defaults
          </Button>
          <Button
            size="sm"
            className={cn("h-7 px-3 gap-1 text-xs font-semibold bg-primary hover:bg-primary/95 text-primary-foreground transition-all", isDirty && "shadow-lg shadow-primary/20")}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            <Save size={12} /> {saving ? "Saving…" : "Save Cycles"}
          </Button>
        </div>
      </div>

      {/* Main Designer Grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[380px_1fr] divide-x">

        {/* Left Side: Program Selection Tables */}
        <div className="overflow-y-auto p-4 space-y-4 bg-muted/5 flex flex-col h-full">



          {/* Washer Programs */}
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Waves size={14} className="text-blue-500 animate-pulse" />
                <span className="font-bold text-xs uppercase tracking-wide font-sans">Washer Programs</span>
                {washerDirty && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-bold">DIRTY</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAddProgram("Washer")}
                className="h-6 w-6 p-0 text-primary hover:bg-primary/10 rounded-md"
                title="Add Washer Program"
              >
                <Plus size={14} />
              </Button>
            </div>
            <div className="divide-y text-xs">
              {washerProgs.map(p => (
                <div
                  key={p.id}
                  onClick={() => { setSelectedType("Washer"); setSelectedId(p.id) }}
                  className={cn(
                    "flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors group",
                    selectedType === "Washer" && selectedId === p.id && "bg-primary/10 border-l-4 border-primary hover:bg-primary/15"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span className="h-6 w-6 rounded bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center flex-shrink-0">P{p.id}</span>
                    <input
                      type="text"
                      value={p.label}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateWasher(p.id, "label", e.target.value)}
                      className="h-6 w-24 px-1 border bg-background rounded text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="number"
                      value={p.minutes}
                      disabled
                      className="h-6 w-8 text-center border bg-muted/30 rounded text-[10px] font-mono"
                    />
                    <span className="text-[9px] text-muted-foreground">m</span>
                    <input
                      type="number"
                      value={p.price}
                      onChange={e => updateWasher(p.id, "price", Number(e.target.value))}
                      className="h-6 w-10 text-center border bg-background rounded text-[10px] font-mono"
                    />
                    <span className="text-[9px] text-muted-foreground mr-1">฿</span>
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteProgram("Washer", p.id)}
                      className="h-6 w-6 text-red-500 hover:bg-red-500/10 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete Program"
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dryer Programs */}
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Wind size={14} className="text-orange-500 animate-pulse" />
                <span className="font-bold text-xs uppercase tracking-wide font-sans">Dryer Programs</span>
                {dryerDirty && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-bold">DIRTY</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAddProgram("Dryer")}
                className="h-6 w-6 p-0 text-primary hover:bg-primary/10 rounded-md"
                title="Add Dryer Program"
              >
                <Plus size={14} />
              </Button>
            </div>
            <div className="divide-y text-xs">
              {dryerProgs.map(p => (
                <div
                  key={p.id}
                  onClick={() => { setSelectedType("Dryer"); setSelectedId(p.id) }}
                  className={cn(
                    "flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors group",
                    selectedType === "Dryer" && selectedId === p.id && "bg-primary/10 border-l-4 border-primary hover:bg-primary/15"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span className="h-6 w-6 rounded bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center flex-shrink-0">P{p.id}</span>
                    <input
                      type="text"
                      value={p.label}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateDryer(p.id, "label", e.target.value)}
                      className="h-6 w-24 px-1 border bg-background rounded text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="number"
                      value={p.minutes}
                      disabled
                      className="h-6 w-8 text-center border bg-muted/30 rounded text-[10px] font-mono"
                    />
                    <span className="text-[9px] text-muted-foreground">m</span>
                    <input
                      type="number"
                      value={p.price}
                      onChange={e => updateDryer(p.id, "price", Number(e.target.value))}
                      className="h-6 w-10 text-center border bg-background rounded text-[10px] font-mono"
                    />
                    <span className="text-[9px] text-muted-foreground mr-1">฿</span>
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteProgram("Dryer", p.id)}
                      className="h-6 w-6 text-red-500 hover:bg-red-500/10 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete Program"
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Interactive Step Timeline Designer */}
        <div className="overflow-hidden flex flex-col bg-background h-full">

          {/* Active Selection Header */}
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-muted/10">
            <span className={cn(
              "px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider",
              selectedType === "Washer" ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
            )}>
              {selectedType} Program {selectedId}
            </span>
            <span className="font-bold text-base">{activeProgram.label}</span>
            <span className="text-xs text-muted-foreground font-mono">({activeProgram.minutes} minutes total)</span>

            <Button
              size="sm"
              variant="outline"
              onClick={handleAddStep}
              className="ml-auto h-8 gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5 hover:border-primary/45"
            >
              <Plus size={12} /> Add Cycle Step
            </Button>
          </div>

          {/* Interactive Steps Workspace */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* 1. VISUAL TIMELINE COMPONENT */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Visual Sensors Timeline</span>
              <div className="rounded-xl border bg-muted/5 p-4 flex gap-1.5 overflow-x-auto select-none min-h-[90px] items-stretch">
                {activeSteps.map((step, idx) => {
                  const percent = Math.round((step.duration_mins / Math.max(1, activeProgram.minutes)) * 100);
                  return (
                    <div
                      key={idx}
                      style={{ flexGrow: step.duration_mins, minWidth: "90px" }}
                      className="rounded-lg border bg-card p-3 relative flex flex-col justify-between shadow-sm overflow-hidden hover:ring-1 hover:ring-primary/40 transition-all group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs truncate max-w-[80px]">{step.name || `Step ${idx + 1}`}</span>
                          <span className="text-[9px] px-1 py-0.2 bg-muted rounded font-mono font-bold">{step.duration_mins}m</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground block">{percent}% of cycle</span>
                      </div>

                      {/* Micro Sensors Badges */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {selectedType === "Washer" && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">💧{step.target_water}%</span>
                        )}
                        <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/10 text-red-500 font-mono">🌡️{step.target_temp}°C</span>
                        <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-500 font-mono">🌀{step.target_rpm} RPM</span>
                      </div>

                      {/* Number tag */}
                      <div className="absolute top-0 right-0 h-6 w-6 bg-muted/30 text-muted-foreground/60 text-[9px] font-bold flex items-center justify-center rounded-bl-lg">
                        {idx + 1}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 2. STEPS CARD EDITOR */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Sequence Editor</span>

              <div className="space-y-3">
                {activeSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="group border rounded-xl bg-card p-4 hover:border-muted-foreground/20 transition-all shadow-sm relative flex flex-col gap-4"
                  >

                    {/* Header: Name, Position controls, and Delete */}
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded bg-muted font-bold text-xs flex items-center justify-center text-muted-foreground font-mono">
                        {idx + 1}
                      </div>

                      <input
                        type="text"
                        value={step.name}
                        placeholder={`Step ${idx + 1} Name`}
                        onChange={e => handleUpdateStepField(idx, "name", e.target.value)}
                        className="h-8 w-44 font-semibold px-2 border rounded text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                      />

                      {/* Position / Up-Down Order */}
                      <div className="flex gap-0.5 ml-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMoveStep(idx, "up")}
                          disabled={idx === 0}
                          className="h-7 w-7 text-muted-foreground hover:bg-muted"
                        >
                          <ArrowUp size={12} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMoveStep(idx, "down")}
                          disabled={idx === activeSteps.length - 1}
                          className="h-7 w-7 text-muted-foreground hover:bg-muted"
                        >
                          <ArrowDown size={12} />
                        </Button>
                      </div>

                      {/* Delete */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteStep(idx)}
                        className="ml-auto h-7 w-7 text-red-500 hover:bg-red-500/10 hover:text-red-600 opacity-50 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>

                    {/* Metric sliders inside grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">

                      {/* Step Duration */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><Clock size={11} /> Duration</span>
                          <span className="font-mono font-bold text-primary">{step.duration_mins} min</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={60}
                          value={step.duration_mins}
                          onChange={e => handleUpdateStepField(idx, "duration_mins", Number(e.target.value))}
                          className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>

                      {/* Target Temp */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">🌡️ Temperature</span>
                          <span className="font-mono font-bold text-red-500">{step.target_temp}°C</span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={95}
                          value={step.target_temp}
                          onChange={e => handleUpdateStepField(idx, "target_temp", Number(e.target.value))}
                          className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                      </div>

                      {/* Target Drum RPM */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">🌀 Drum Speed</span>
                          <span className="font-mono font-bold text-purple-500">{step.target_rpm} RPM</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1600}
                          step={50}
                          value={step.target_rpm}
                          onChange={e => handleUpdateStepField(idx, "target_rpm", Number(e.target.value))}
                          className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Target Water Level (Washers only) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">💧 Water Level</span>
                          <span className={cn("font-mono font-bold", selectedType === "Washer" ? "text-blue-500" : "text-muted-foreground/40")}>
                            {selectedType === "Washer" ? `${step.target_water}%` : "N/A"}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          disabled={selectedType !== "Washer"}
                          value={selectedType === "Washer" ? step.target_water : 0}
                          onChange={e => handleUpdateStepField(idx, "target_water", Number(e.target.value))}
                          className={cn("w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500", selectedType !== "Washer" && "opacity-30 cursor-not-allowed")}
                        />
                      </div>

                    </div>

                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
