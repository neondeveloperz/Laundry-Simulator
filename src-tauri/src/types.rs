// Path: src-tauri/src/types.rs
// All domain-level types, enums, and default implementations.

use serde::{Deserialize, Serialize};

// ============================================================
// MACHINE
// ============================================================

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum MachineType {
    Washer,
    Dryer,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum MachineState {
    Idle,
    Filling,
    Washing,
    Rinsing,
    Spinning,
    Drying,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Machine {
    pub id: u8,
    pub machine_type: MachineType,
    pub state: MachineState,
    pub coins: u32,
    pub total_coins: u32,
    pub program: u8,
    pub current_step: u8,
    pub temperature: f32,
    pub set_temp: f32,
    pub rpm: u32,
    pub set_rpm: u32,
    pub time_remaining: u32,
    pub error_code: u32,
    pub water_level: u32,
    /// 0:Idle, 1:Opened, 2:Closed, 3:Locked, 4:Error, 5:Locking, 6:Unlocking
    pub door_status: u8,
    pub door_timer: f32,
}

impl Machine {
    pub fn new_washer(id: u8) -> Self {
        Machine {
            id,
            machine_type: MachineType::Washer,
            state: MachineState::Idle,
            coins: 0,
            total_coins: 0,
            program: 1,
            current_step: 0,
            temperature: 25.0,
            set_temp: 60.0,
            rpm: 0,
            set_rpm: 800,
            time_remaining: 0,
            error_code: 0,
            water_level: 0,
            door_status: 2, // Closed
            door_timer: 0.0,
        }
    }

    pub fn new_dryer(id: u8) -> Self {
        Machine {
            id,
            machine_type: MachineType::Dryer,
            state: MachineState::Idle,
            coins: 0,
            total_coins: 0,
            program: 1,
            current_step: 0,
            temperature: 25.0,
            set_temp: 75.0,
            rpm: 0,
            set_rpm: 0,
            time_remaining: 0,
            error_code: 0,
            water_level: 0,
            door_status: 2, // Closed
            door_timer: 0.0,
        }
    }
}

// ============================================================
// PROGRAMS
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramStep {
    pub name: String,
    pub duration_mins: u32,
    pub target_water: u16,
    pub target_temp: u16,
    pub target_rpm: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramInfo {
    pub id: u8,
    pub label: String,
    pub minutes: u32,
    pub price: u32,
    pub steps: Option<Vec<ProgramStep>>,
}

// ============================================================
// REGISTER MAPPING
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterMapping {
    pub state: u16,
    pub door_status: u16,
    pub error_flag: u16,
    pub time_min: u16,
    pub time_sec: u16,
    pub water_level: u16,
    pub temperature: u16,
    pub rpm: u16,
    pub program: u16,
    pub coins: u16,
    pub total_coins: u16,
    pub machine_id: u16,
    pub error_code: u16,

    pub write_error_reset: u16,
    pub write_start: u16,
    pub write_advance: u16,
    pub write_stop: u16,
    pub write_coins: u16,
    pub write_program: u16,
}

impl Default for RegisterMapping {
    fn default() -> Self {
        Self {
            state: 20,
            door_status: 21,
            error_flag: 22,
            time_min: 23,
            time_sec: 24,
            water_level: 28,
            temperature: 30,
            rpm: 32,
            program: 34,
            coins: 37,
            total_coins: 38,
            machine_id: 40,
            error_code: 60,

            write_error_reset: 0,
            write_start: 1,
            write_advance: 2,
            write_stop: 3,
            write_coins: 4,
            write_program: 5,
        }
    }
}

impl RegisterMapping {
    pub fn dryer_default() -> Self {
        Self {
            state: 20,
            door_status: 21,
            error_flag: 22,
            time_min: 23,
            time_sec: 24,
            water_level: 28,
            temperature: 30,
            rpm: 32,
            program: 34,
            coins: 37,
            total_coins: 38,
            machine_id: 40,
            error_code: 60,

            write_error_reset: 0,
            write_start: 1,
            write_advance: 2,
            write_stop: 99, // Unmapped by default on dryer
            write_coins: 3,
            write_program: 4,
        }
    }
}

// ============================================================
// CONFIG
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulatorConfig {
    pub auto_start: bool,
    pub last_port: String,
    pub last_baud: u32,
    pub last_unit_id: u8,
    pub simulation_enabled: bool,
    pub simulation_speed: u32,
    pub washer_programs: Vec<ProgramInfo>,
    pub dryer_programs: Vec<ProgramInfo>,
    pub washer_mapping: RegisterMapping,
    pub dryer_mapping: RegisterMapping,
}

impl Default for SimulatorConfig {
    fn default() -> Self {
        Self {
            auto_start: false,
            last_port: String::new(),
            last_baud: 9600,
            last_unit_id: 1,
            simulation_enabled: true,
            simulation_speed: 1,
            washer_programs: vec![
                ProgramInfo { id: 1, label: "QuickWash".into(), minutes: 30, price: 30, steps: None },
                ProgramInfo { id: 2, label: "Normal".into(),    minutes: 45, price: 40, steps: None },
                ProgramInfo { id: 3, label: "Heavy".into(),     minutes: 60, price: 50, steps: None },
                ProgramInfo { id: 4, label: "Delicate".into(),  minutes: 35, price: 40, steps: None },
                ProgramInfo { id: 5, label: "Sanitize".into(),  minutes: 75, price: 60, steps: None },
            ],
            dryer_programs: vec![
                ProgramInfo { id: 1, label: "Air Dry".into(),   minutes: 20, price: 20, steps: None },
                ProgramInfo { id: 2, label: "Low Heat".into(),  minutes: 35, price: 30, steps: None },
                ProgramInfo { id: 3, label: "Normal".into(),    minutes: 45, price: 40, steps: None },
                ProgramInfo { id: 4, label: "High Heat".into(), minutes: 60, price: 50, steps: None },
                ProgramInfo { id: 5, label: "ExtraDry".into(),  minutes: 75, price: 60, steps: None },
            ],
            washer_mapping: RegisterMapping::default(),
            dryer_mapping: RegisterMapping::dryer_default(),
        }
    }
}

// ============================================================
// TELEMETRY / EVENTS
// ============================================================

#[derive(Debug, Serialize)]
pub struct ModbusStatus {
    pub connected: bool,
    pub port: String,
    pub baud: u32,
    pub rx_count: u64,
    pub tx_count: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String, // "INFO", "MODBUS", "ERROR", "SCENARIO"
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrafficLog {
    pub direction: String, // "RX" or "TX"
    pub hex: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub config_dir: String,
    pub machines_path: String,
    pub settings_path: String,
    pub logs_path: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModbusFrame {
    pub unit_id: u8,
    pub function_code: u8,
    pub address: u16,
    pub quantity: u16,
    pub hex: String,
    pub desc: String,
    pub timestamp: String,
}

// ============================================================
// SCENARIOS & FAULT INJECTION
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioEvent {
    pub time_offset_sec: u32,
    pub unit_id: u8,
    pub action: String, // "START", "STOP", "COIN", "ERROR_1"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scenario {
    pub name: String,
    pub events: Vec<ScenarioEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaultConfig {
    pub timeout: bool,
    pub crc_error: bool,
    pub exception_code: u8, // 0 = none, 1–6 = Modbus exception
}

impl Default for FaultConfig {
    fn default() -> Self {
        Self {
            timeout: false,
            crc_error: false,
            exception_code: 0,
        }
    }
}
