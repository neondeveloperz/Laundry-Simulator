// Path: src-tauri/src/commands/config.rs
// Tauri commands for app configuration, system info, and data reset.

use tauri::{AppHandle, Manager, State};

use crate::state::AppState;
use crate::types::{AppInfo, SimulatorConfig};

#[tauri::command]
pub fn get_config(state: State<AppState>) -> SimulatorConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_config(config: SimulatorConfig, state: State<AppState>) -> Result<(), String> {
    *state.config.lock().unwrap() = config;
    state.save_config();
    state.emit_log("INFO", "Admin: Configuration updated");
    Ok(())
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> Result<AppInfo, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(AppInfo {
        config_dir:    config_dir.to_string_lossy().to_string(),
        machines_path: config_dir.join("machines.json").to_string_lossy().to_string(),
        settings_path: config_dir.join("settings.json").to_string_lossy().to_string(),
        logs_path:     config_dir.join("simulation.log").to_string_lossy().to_string(),
        version:       env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn update_simulator_programs(
    washer_programs: Vec<crate::types::ProgramInfo>,
    dryer_programs:  Vec<crate::types::ProgramInfo>,
    state:           State<AppState>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.washer_programs = washer_programs;
    cfg.dryer_programs  = dryer_programs;
    drop(cfg);
    state.save_config();
    state.emit_log("INFO", "Admin: Programs updated");
    Ok(())
}

#[tauri::command]
pub fn reset_all_data(state: State<AppState>, app: AppHandle) -> Result<(), String> {
    {
        state.machines.lock().unwrap().clear();
        *state.config.lock().unwrap() = SimulatorConfig::default();
    }
    if let Ok(app_dir) = app.path().app_config_dir() {
        let _ = std::fs::remove_file(app_dir.join("machines.json"));
        let _ = std::fs::remove_file(app_dir.join("settings.json"));
        let _ = std::fs::remove_file(app_dir.join("simulation.log"));
    }
    state.emit_log("INFO", "Admin: Factory reset complete");
    Ok(())
}

#[tauri::command]
pub fn clear_log_file(app: AppHandle) -> Result<(), String> {
    if let Ok(app_dir) = app.path().app_config_dir() {
        let _ = std::fs::write(app_dir.join("simulation.log"), "");
    }
    Ok(())
}
