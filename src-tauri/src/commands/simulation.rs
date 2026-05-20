// Path: src-tauri/src/commands/simulation.rs
// Tauri commands for simulation control (enable/disable, speed).

use std::sync::atomic::Ordering;
use tauri::State;

use crate::state::{AppState, safe_lock};

#[tauri::command]
pub fn set_simulation_mode(enabled: bool, speed: u32, state: State<AppState>) -> Result<(), String> {
    let clamped = speed.clamp(1, 10);
    state.simulation_enabled.store(enabled, Ordering::SeqCst);
    state.simulation_speed.store(clamped, Ordering::SeqCst);
    {
        let mut cfg = safe_lock(&state.config);
        cfg.simulation_enabled = enabled;
        cfg.simulation_speed   = clamped;
    }
    state.save_config();
    state.emit_log("INFO", &format!("Simulation: {} speed={}x", if enabled { "ON" } else { "OFF" }, speed));
    Ok(())
}
