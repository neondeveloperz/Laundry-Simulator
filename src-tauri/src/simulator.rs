// Path: src-tauri/src/simulator.rs
// Background simulation loop — ticks all running machines every real second
// (scaled by simulation speed factor).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::programs::get_active_step_details;
use crate::types::{Machine, MachineState, SimulatorConfig};

pub fn simulation_loop(
    machines: Arc<Mutex<Vec<Machine>>>,
    config:   Arc<Mutex<SimulatorConfig>>,
    enabled:  Arc<AtomicBool>,
    speed:    Arc<AtomicU32>,
    handle:   AppHandle,
) {
    let mut tick_acc: f32 = 0.0;

    loop {
        std::thread::sleep(Duration::from_millis(200));

        if !enabled.load(Ordering::Relaxed) {
            tick_acc = 0.0;
            continue;
        }

        let spd = speed.load(Ordering::Relaxed).max(1) as f32;
        tick_acc += 0.2 * spd; // accumulate real seconds × speed factor

        if tick_acc < 1.0 {
            continue; // not yet a full simulated second
        }
        let ticks = tick_acc.floor() as u32;
        tick_acc -= ticks as f32;

        let mut changed = false;
        {
            let mut machines = machines.lock().unwrap();
            let cfg = config.lock().unwrap();

            for m in machines.iter_mut() {
                // ── Door animation timer ──────────────────────
                if m.door_status == 5 || m.door_status == 6 {
                    m.door_timer = (m.door_timer - ticks as f32).max(0.0);
                    if m.door_timer <= 0.0 {
                        // 5 (Locking) → 3 (Locked) | 6 (Unlocking) → 2 (Closed)
                        m.door_status = if m.door_status == 5 { 3 } else { 2 };
                        changed = true;
                    }
                }

                // Guard: skip idle/completed/error machines
                if matches!(m.state, MachineState::Idle | MachineState::Completed | MachineState::Error) {
                    continue;
                }

                // ── Countdown ────────────────────────────────
                m.time_remaining = m.time_remaining.saturating_sub(ticks);
                changed = true;

                if m.time_remaining == 0 {
                    m.state       = MachineState::Completed;
                    m.rpm         = 0;
                    m.water_level = 0;
                    m.temperature = 25.0;
                    m.door_status = 2; // Unlock door when cycle ends
                } else {
                    let (step_idx, step, _) =
                        get_active_step_details(m.machine_type, m.program, m.time_remaining, &cfg);
                    m.current_step = step_idx as u8;

                    // Map step name → MachineState
                    let name_lower = step.name.to_lowercase();
                    if name_lower.contains("fill") {
                        m.state = MachineState::Filling;
                    } else if name_lower.contains("wash") || name_lower.contains("soak") || name_lower.contains("pre") {
                        m.state = MachineState::Washing;
                    } else if name_lower.contains("rinse") {
                        m.state = MachineState::Rinsing;
                    } else if name_lower.contains("spin") {
                        m.state = MachineState::Spinning;
                    } else if name_lower.contains("dry") || name_lower.contains("heat") || name_lower.contains("cool") {
                        m.state = MachineState::Drying;
                    }

                    let dt = ticks as f32;

                    // Smooth sensor transitions toward step targets
                    let target_water = step.target_water as u32;
                    if m.water_level < target_water {
                        m.water_level = (m.water_level + (dt * 4.0) as u32).min(target_water);
                    } else if m.water_level > target_water {
                        m.water_level = m.water_level.saturating_sub((dt * 4.0) as u32).max(target_water);
                    }

                    let target_temp = step.target_temp as f32;
                    if m.temperature < target_temp {
                        m.temperature = (m.temperature + dt * 1.5).min(target_temp);
                    } else if m.temperature > target_temp {
                        m.temperature = (m.temperature - dt * 1.5).max(target_temp);
                    }

                    let target_rpm = step.target_rpm as u32;
                    if m.rpm < target_rpm {
                        m.rpm = (m.rpm + (dt * 120.0) as u32).min(target_rpm);
                    } else if m.rpm > target_rpm {
                        m.rpm = m.rpm.saturating_sub((dt * 120.0) as u32).max(target_rpm);
                    }
                }
            }
        }

        if changed {
            let _ = handle.emit("machines-updated", ());
        }
    }
}
