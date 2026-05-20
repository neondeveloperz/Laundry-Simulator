// Path: src-tauri/src/state.rs
// Global application state with persistence and event-emission helpers.

use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU32};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

use crate::types::{LogEntry, Machine, SimulatorConfig, FaultConfig};

pub struct AppState {
    pub machines:          Arc<Mutex<Vec<Machine>>>,
    pub config:            Arc<Mutex<SimulatorConfig>>,
    pub app_handle:        Mutex<Option<AppHandle>>,
    pub fault_config:      Arc<Mutex<FaultConfig>>,
    // Modbus server
    pub modbus_stop:       Mutex<Option<Arc<AtomicBool>>>,
    pub modbus_connected:  AtomicBool,
    pub modbus_port:       Mutex<String>,
    pub modbus_baud:       Mutex<u32>,
    pub modbus_rx:         Arc<Mutex<u64>>,
    pub modbus_tx:         Arc<Mutex<u64>>,
    // Simulation
    pub simulation_enabled: Arc<AtomicBool>,
    pub simulation_speed:   Arc<AtomicU32>,
    // Modbus client (Virtual PLC)
    pub client_port:       Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>,
    pub client_connected:  Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            machines:          Arc::new(Mutex::new(Vec::new())),
            config:            Arc::new(Mutex::new(SimulatorConfig::default())),
            app_handle:        Mutex::new(None),
            fault_config:      Arc::new(Mutex::new(FaultConfig::default())),
            modbus_stop:       Mutex::new(None),
            modbus_connected:  AtomicBool::new(false),
            modbus_port:       Mutex::new(String::new()),
            modbus_baud:       Mutex::new(9600),
            modbus_rx:         Arc::new(Mutex::new(0)),
            modbus_tx:         Arc::new(Mutex::new(0)),
            simulation_enabled: Arc::new(AtomicBool::new(true)),
            simulation_speed:   Arc::new(AtomicU32::new(1)),
            client_port:       Arc::new(Mutex::new(None)),
            client_connected:  Arc::new(AtomicBool::new(false)),
        }
    }

    // ── Persistence ──────────────────────────────────────────

    pub fn save_machines(&self) {
        if let Some(handle) = self.app_handle.lock().unwrap().as_ref() {
            let machines = self.machines.lock().unwrap().clone();
            if let Ok(app_dir) = handle.path().app_config_dir() {
                let _ = std::fs::create_dir_all(&app_dir);
                let path = app_dir.join("machines.json");
                if let Ok(json) = serde_json::to_string_pretty(&machines) {
                    let _ = std::fs::write(path, json);
                }
            }
        }
    }

    pub fn load_machines(&self) {
        if let Some(handle) = self.app_handle.lock().unwrap().as_ref() {
            if let Ok(app_dir) = handle.path().app_config_dir() {
                let path = app_dir.join("machines.json");
                if let Ok(data) = std::fs::read_to_string(path) {
                    if let Ok(saved) = serde_json::from_str::<Vec<Machine>>(&data) {
                        let mut m = self.machines.lock().unwrap();
                        *m = saved;
                    }
                }
            }
        }
    }

    pub fn save_config(&self) {
        if let Some(handle) = self.app_handle.lock().unwrap().as_ref() {
            let cfg = self.config.lock().unwrap().clone();
            if let Ok(app_dir) = handle.path().app_config_dir() {
                let _ = std::fs::create_dir_all(&app_dir);
                let path = app_dir.join("settings.json");
                if let Ok(json) = serde_json::to_string_pretty(&cfg) {
                    let _ = std::fs::write(path, json);
                }
            }
        }
    }

    pub fn load_config(&self) {
        if let Some(handle) = self.app_handle.lock().unwrap().as_ref() {
            if let Ok(app_dir) = handle.path().app_config_dir() {
                let path = app_dir.join("settings.json");
                if let Ok(data) = std::fs::read_to_string(path) {
                    if let Ok(cfg) = serde_json::from_str::<SimulatorConfig>(&data) {
                        let mut c = self.config.lock().unwrap();
                        *c = cfg;
                    }
                }
            }
        }
    }

    // ── Event emission ───────────────────────────────────────

    /// Emit a structured log event to the frontend and append to simulation.log on disk.
    pub fn emit_log(&self, level: &str, msg: &str) {
        let timestamp = chrono::Local::now().format("%H:%M:%S%.3f").to_string();
        if let Some(handle) = self.app_handle.lock().unwrap().as_ref() {
            let entry = LogEntry {
                timestamp: timestamp.clone(),
                level: level.to_string(),
                message: msg.to_string(),
            };
            let _ = handle.emit("log-event", &entry);

            if let Ok(app_dir) = handle.path().app_config_dir() {
                let _ = std::fs::create_dir_all(&app_dir);
                let path = app_dir.join("simulation.log");
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)
                {
                    let _ = writeln!(file, "[{}] {}: {}", timestamp, level, msg);
                }
            }
        }
    }
}
