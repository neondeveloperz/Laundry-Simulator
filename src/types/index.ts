// Path: src/types/index.ts
// Phase 1 (v0.1) — Mirror of Rust domain types

// ============================================================
// ENUMS
// ============================================================

export type MachineState =
  | "Idle"
  | "Filling"
  | "Washing"
  | "Rinsing"
  | "Spinning"
  | "Drying"
  | "Completed"
  | "Error"

export type MachineType = "Washer" | "Dryer"

// ============================================================
// CORE STRUCTS
// ============================================================

export interface Machine {
  id: number
  machine_type: MachineType
  state: MachineState
  coins: number
  total_coins: number
  program: number
  current_step: number
  temperature: number
  set_temp: number
  rpm: number
  set_rpm: number
  time_remaining: number
  error_code: number
  water_level: number
  /** 0:Idle 1:Opened 2:Closed 3:Locked 4:Error 5:Locking 6:Unlocking */
  door_status: number
  door_timer: number
}

export interface ProgramStep {
  name: string
  duration_mins: number
  target_water: number
  target_temp: number
  target_rpm: number
}

export interface ProgramInfo {
  id: number
  label: string
  minutes: number
  price: number
  steps?: ProgramStep[]
}

export interface RegisterMapping {
  state: number
  door_status: number
  error_flag: number
  time_min: number
  time_sec: number
  water_level: number
  temperature: number
  rpm: number
  program: number
  coins: number
  total_coins: number
  machine_id: number
  error_code: number

  write_error_reset: number
  write_start: number
  write_advance: number
  write_stop: number
  write_coins: number
  write_program: number
}

export interface SimulatorConfig {
  auto_start: boolean
  last_port: string
  last_baud: number
  simulation_enabled: boolean
  simulation_speed: number
  washer_programs: ProgramInfo[]
  dryer_programs: ProgramInfo[]
  washer_mapping: RegisterMapping
  dryer_mapping: RegisterMapping
}

export interface ModbusStatus {
  connected: boolean
  port: string
  baud: number
  rx_count: number
  tx_count: number
}

export interface LogEntry {
  timestamp: string
  level: string // "INFO" | "MODBUS" | "ERROR" | "SCENARIO"
  message: string
}

export interface TrafficLog {
  direction: "RX" | "TX"
  hex: string
  timestamp: string
}

export interface AppInfo {
  config_dir: string
  machines_path: string
  settings_path: string
  logs_path: string
  version: string
}

export interface ModbusFrame {
  unit_id: number
  function_code: number
  address: number
  quantity: number
  hex: string
  desc: string
  timestamp: string
}

export interface ScenarioEvent {
  time_offset_sec: number
  unit_id: number
  action: "START" | "STOP" | "COIN" | "ERROR_1"
}

export interface Scenario {
  name: string
  events: ScenarioEvent[]
}

export interface FaultConfig {
  timeout: boolean
  crc_error: boolean
  exception_code: number // 0 = none, 1–6 = Modbus exception code
}

export interface Toast {
  id: number
  type: "success" | "error" | "warning" | "info"
  msg: string
}

// ============================================================
// CONSTANTS
// ============================================================

export const WASHER_PROGRAMS: Record<
  number,
  { label: string; time: string; minutes: number; price: number }
> = {
  1: { label: "QuickWash", time: "30m", minutes: 30, price: 30 },
  2: { label: "Normal",    time: "45m", minutes: 45, price: 40 },
  3: { label: "Heavy",     time: "60m", minutes: 60, price: 50 },
  4: { label: "Delicate",  time: "35m", minutes: 35, price: 40 },
  5: { label: "Sanitize",  time: "75m", minutes: 75, price: 60 },
}

export const DRYER_PROGRAMS: Record<
  number,
  { label: string; time: string; minutes: number; price: number }
> = {
  1: { label: "Air Dry",   time: "20m", minutes: 20, price: 20 },
  2: { label: "Low Heat",  time: "35m", minutes: 35, price: 30 },
  3: { label: "Normal",    time: "45m", minutes: 45, price: 40 },
  4: { label: "High Heat", time: "60m", minutes: 60, price: 50 },
  5: { label: "ExtraDry",  time: "75m", minutes: 75, price: 60 },
}

export const STATE_PROGRESS: Record<MachineState, number> = {
  Idle: 0,
  Filling: 15,
  Washing: 35,
  Rinsing: 60,
  Spinning: 80,
  Drying: 50,
  Completed: 100,
  Error: 0,
}

export const STATE_EMOJI: Record<MachineState, string> = {
  Idle:      "⏸",
  Filling:   "💧",
  Washing:   "🫧",
  Rinsing:   "🌊",
  Spinning:  "🌀",
  Drying:    "🔥",
  Completed: "✅",
  Error:     "⚠️",
}

export const DOOR_LABELS: Record<number, { label: string; icon: string }> = {
  0: { label: "Idle",        icon: "🚪" },
  1: { label: "Opened",      icon: "🔓" },
  2: { label: "Closed",      icon: "🚪" },
  3: { label: "Locked",      icon: "🔒" },
  4: { label: "Error",       icon: "⚠️" },
  5: { label: "Locking...",  icon: "⚙️" },
  6: { label: "Unlocking...", icon: "⚙️" },
}
