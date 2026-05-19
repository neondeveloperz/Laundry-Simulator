// Path: src-tauri/src/lib.rs
// Entry point — wires up modules, plugins, and the Tauri app builder.
// All domain logic lives in the submodules below.

mod commands;
mod modbus;
mod programs;
mod simulator;
mod state;
mod types;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{webview::PageLoadEvent, Manager};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

use state::AppState;

// ── External-link navigation plugin ──────────────────────────
// Intercepts navigation events: internal URLs pass through,
// external http/https links are opened in the system browser.
fn external_navigation_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("external-navigation")
        .on_navigation(|webview, url| {
            let is_internal = url.scheme() == "tauri"
                || matches!(
                    url.host_str(),
                    Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost") | Some("::1")
                );
            if is_internal {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
                log::info!("opening external link in system browser: {}", url);
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }
            true
        })
        .build()
}

// ============================================================
// ENTRY POINT
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(external_navigation_plugin())
        .manage(AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let state  = app.state::<AppState>();

            // Store handle so AppState can emit events from any context
            *state.app_handle.lock().unwrap() = Some(handle.clone());

            // Restore persisted fleet and settings
            state.load_machines();
            state.load_config();

            // Sync atomic flags from loaded config
            {
                let cfg = state.config.lock().unwrap();
                state.simulation_enabled.store(cfg.simulation_enabled, Ordering::SeqCst);
                state.simulation_speed.store(cfg.simulation_speed.clamp(1, 10), Ordering::SeqCst);
            }

            // Auto-restart Modbus server if the previous session had it running
            {
                let cfg = state.config.lock().unwrap();
                if cfg.auto_start && !cfg.last_port.is_empty() {
                    let port = cfg.last_port.clone();
                    let baud = cfg.last_baud;
                    drop(cfg);

                    let stop_flag = Arc::new(AtomicBool::new(false));
                    *state.modbus_stop.lock().unwrap() = Some(Arc::clone(&stop_flag));
                    *state.modbus_port.lock().unwrap() = port.clone();
                    *state.modbus_baud.lock().unwrap() = baud;
                    *state.modbus_rx.lock().unwrap()   = 0;
                    *state.modbus_tx.lock().unwrap()   = 0;
                    state.modbus_connected.store(true, Ordering::SeqCst);

                    let machines   = Arc::clone(&state.machines);
                    let config     = Arc::clone(&state.config);
                    let fault_cfg  = Arc::clone(&state.fault_config);
                    let rx_counter = Arc::clone(&state.modbus_rx);
                    let tx_counter = Arc::clone(&state.modbus_tx);
                    let auto_handle = handle.clone();

                    std::thread::spawn(move || {
                        modbus::modbus_server_thread(
                            port, baud, stop_flag,
                            machines, config, fault_cfg,
                            rx_counter, tx_counter, auto_handle,
                        );
                    });
                    state.emit_log("MODBUS", "Modbus: Auto-started from last session config");
                }
            }

            // Spawn simulation background thread
            let sim_machines = Arc::clone(&state.machines);
            let sim_config   = Arc::clone(&state.config);
            let sim_enabled  = Arc::clone(&state.simulation_enabled);
            let sim_speed    = Arc::clone(&state.simulation_speed);
            let sim_handle   = handle.clone();
            std::thread::spawn(move || {
                simulator::simulation_loop(sim_machines, sim_config, sim_enabled, sim_speed, sim_handle);
            });

            log::info!("Laundry Simulator v{} started", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Machine CRUD
            commands::machine::get_all_machines,
            commands::machine::add_machine,
            commands::machine::remove_machine,
            // Machine Control
            commands::machine::insert_coin,
            commands::machine::clear_coins,
            commands::machine::start_machine,
            commands::machine::stop_machine,
            commands::machine::advance_state,
            commands::machine::set_program,
            commands::machine::toggle_door,
            commands::machine::toggle_door_lock,
            commands::machine::trigger_error,
            commands::machine::clear_error,
            commands::machine::bulk_start_machines,
            commands::machine::bulk_stop_machines,
            // Modbus Server
            modbus::list_serial_ports,
            modbus::get_modbus_status,
            modbus::start_modbus_server,
            modbus::stop_modbus_server,
            modbus::set_fault_mode,
            modbus::get_fault_config,
            // Simulation
            commands::simulation::set_simulation_mode,
            // Config & System
            commands::config::get_config,
            commands::config::update_config,
            commands::config::get_app_info,
            commands::config::update_simulator_programs,
            commands::config::reset_all_data,
            commands::config::clear_log_file,
            // Modbus Client (Virtual PLC)
            modbus::client::start_modbus_client,
            modbus::client::stop_modbus_client,
            modbus::client::get_modbus_client_status,
            modbus::client::modbus_client_request,
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("main webview finished loading");
                let _ = webview.window().show();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
