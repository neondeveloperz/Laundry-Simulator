// Path: src/lib/commands.ts
// Typed wrappers for all Tauri invoke commands
// Uses trackedInvoke from tauri.ts for debug logging

import { trackedInvoke } from "./tauri"
import type {
  Machine,
  SimulatorConfig,
  AppInfo,
  ModbusStatus,
  FaultConfig,
} from "@/types"

// ── Machine CRUD ───────────────────────────────────────────────
export const getAllMachines = () =>
  trackedInvoke<Machine[]>("get_all_machines")

export const addMachine = (machineTypeStr: "Washer" | "Dryer", unitId: number) =>
  trackedInvoke<Machine>("add_machine", { machineTypeStr, unitId })

export const removeMachine = (unitId: number) =>
  trackedInvoke<void>("remove_machine", { unitId })

// ── Machine Control ────────────────────────────────────────────
export const insertCoin = (machineId: number, amount: number) =>
  trackedInvoke<Machine>("insert_coin", { machineId, amount })

export const clearCoins = (machineId: number) =>
  trackedInvoke<Machine>("clear_coins", { machineId })

export const startMachine = (machineId: number) =>
  trackedInvoke<Machine>("start_machine", { machineId })

export const stopMachine = (machineId: number) =>
  trackedInvoke<Machine>("stop_machine", { machineId })

export const advanceState = (machineId: number) =>
  trackedInvoke<Machine>("advance_state", { machineId })

export const setProgram = (machineId: number, program: number) =>
  trackedInvoke<Machine>("set_program", { machineId, program })

export const toggleDoor = (machineId: number) =>
  trackedInvoke<Machine>("toggle_door", { machineId })

export const toggleDoorLock = (machineId: number) =>
  trackedInvoke<Machine>("toggle_door_lock", { machineId })

export const triggerError = (machineId: number, errorCode: number) =>
  trackedInvoke<Machine>("trigger_error", { machineId, errorCode })

export const clearError = (machineId: number) =>
  trackedInvoke<Machine>("clear_error", { machineId })

export const bulkStartMachines = () =>
  trackedInvoke<void>("bulk_start_machines")

export const bulkStopMachines = () =>
  trackedInvoke<void>("bulk_stop_machines")

// ── Config ─────────────────────────────────────────────────────
export const getConfig = () =>
  trackedInvoke<SimulatorConfig>("get_config")

export const updateConfig = (config: SimulatorConfig) =>
  trackedInvoke<void>("update_config", { config })

export const getAppInfo = () =>
  trackedInvoke<AppInfo>("get_app_info")

// ── Modbus Server ───────────────────────────────────────────────
export const listSerialPorts = () =>
  trackedInvoke<string[]>("list_serial_ports")

export const getModbusStatus = () =>
  trackedInvoke<ModbusStatus>("get_modbus_status")

export const startModbusServer = (port: string, baud: number) =>
  trackedInvoke<void>("start_modbus_server", { port, baud })

export const stopModbusServer = () =>
  trackedInvoke<void>("stop_modbus_server")

export const setFaultMode = (config: FaultConfig) =>
  trackedInvoke<void>("set_fault_mode", { config })

export const getFaultConfig = () =>
  trackedInvoke<FaultConfig>("get_fault_config")

// ── Simulation ─────────────────────────────────────────────────
export const setSimulationMode = (enabled: boolean, speed: number) =>
  trackedInvoke<void>("set_simulation_mode", { enabled, speed })

export const updateSimulatorPrograms = (
  washerPrograms: import("@/types").ProgramInfo[],
  dryerPrograms: import("@/types").ProgramInfo[],
) => trackedInvoke<void>("update_simulator_programs", { washerPrograms, dryerPrograms })

// ── System ─────────────────────────────────────────────────────
export const resetAllData = () =>
  trackedInvoke<void>("reset_all_data")

export const clearLogFile = () =>
  trackedInvoke<void>("clear_log_file")

// ── Modbus Client (Virtual PLC) ─────────────────────────────────
export const startModbusClient = (portName: string, baud: number) =>
  trackedInvoke<void>("start_modbus_client", { portName, baud })

export const stopModbusClient = () =>
  trackedInvoke<void>("stop_modbus_client")

export const getModbusClientStatus = () =>
  trackedInvoke<boolean>("get_modbus_client_status")

export const modbusClientRequest = (unitId: number, fc: number, address: number, valueOrQty: number) =>
  trackedInvoke<number[]>("modbus_client_request", { unitId, fc, address, valueOrQty })
