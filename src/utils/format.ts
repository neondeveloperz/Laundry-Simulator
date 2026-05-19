// Path: src/utils/format.ts
import type { MachineState } from "@/types"

export function formatTime(seconds: number): string {
  if (seconds <= 0) return "00:00"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function stateClass(state: MachineState): string {
  switch (state) {
    case "Idle":      return "state-idle"
    case "Filling":   return "state-filling"
    case "Washing":   return "state-washing"
    case "Rinsing":   return "state-rinsing"
    case "Spinning":  return "state-spinning"
    case "Drying":    return "state-drying"
    case "Completed": return "state-completed"
    case "Error":     return "state-error"
  }
}

export function stateToCode(state: MachineState): number {
  switch (state) {
    case "Idle":
    case "Completed": return 1
    case "Filling":
    case "Washing":
    case "Rinsing":
    case "Spinning":
    case "Drying":    return 3
    case "Error":     return 1
  }
}
