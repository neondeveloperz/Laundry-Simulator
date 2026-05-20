// Path: src-tauri/src/commands/machine.rs
// Tauri commands for machine CRUD and operator control actions.

use tauri::State;

use crate::programs::{get_program_duration, get_program_price};
use crate::state::{AppState, safe_lock};
use crate::types::{Machine, MachineState, MachineType};

// ── CRUD ─────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_machines(state: State<AppState>) -> Vec<Machine> {
    safe_lock(&state.machines).clone()
}

#[tauri::command]
pub fn add_machine(machine_type_str: String, unit_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let machine = {
        let mut m = safe_lock(&state.machines);
        if m.iter().any(|m| m.id == unit_id) {
            return Err(format!("Unit ID {} is already in use", unit_id));
        }
        let machine = if machine_type_str == "Washer" {
            Machine::new_washer(unit_id)
        } else {
            Machine::new_dryer(unit_id)
        };
        m.push(machine.clone());
        machine
    };

    state.save_machines();
    state.emit_log("INFO", &format!("User: Added new {} with Unit ID {}", machine_type_str, unit_id));
    Ok(machine)
}

#[tauri::command]
pub fn remove_machine(unit_id: u8, state: State<AppState>) -> Result<(), String> {
    {
        let mut m = safe_lock(&state.machines);
        let pos = m.iter().position(|m| m.id == unit_id).ok_or("Machine not found")?;
        m.remove(pos);
    }
    state.save_machines();
    state.emit_log("INFO", &format!("User: Removed machine Unit ID {}", unit_id));
    Ok(())
}

// ── Operator controls ─────────────────────────────────────────

#[tauri::command]
pub fn insert_coin(machine_id: u8, amount: u32, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    machine.coins = machine.coins.saturating_add(amount);
    state.emit_log("INFO", &format!("User: Inserted {}฿ into machine #{}", amount, machine_id));
    Ok(machine.clone())
}

#[tauri::command]
pub fn clear_coins(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    machine.coins = 0;
    state.emit_log("INFO", &format!("User: Cleared coins on machine #{}", machine_id));
    Ok(machine.clone())
}

#[tauri::command]
pub fn start_machine(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;

    // Guard: door must be closed
    if machine.door_status == 1 {
        return Err("Cannot start: Door is OPEN. Please close it first.".into());
    }
    if machine.state != MachineState::Idle && machine.state != MachineState::Completed {
        return Err(format!("Cannot start: Machine is busy ({:?})", machine.state));
    }

    let cfg   = safe_lock(&state.config);
    let price = get_program_price(machine.machine_type, machine.program, &cfg);
    if machine.coins < price {
        return Err(format!("Insufficient coins (need ≥ {}฿, have {}฿)", price, machine.coins));
    }

    machine.coins         -= price;
    machine.total_coins   += price;
    machine.time_remaining = get_program_duration(machine.machine_type, machine.program, &cfg);
    machine.door_status    = 5; // Locking
    machine.door_timer     = 2.0;

    if machine.machine_type == MachineType::Washer {
        machine.state       = MachineState::Filling;
        machine.water_level = 60;
    } else {
        machine.state       = MachineState::Drying;
        machine.temperature = 60.0;
    }
    state.emit_log("INFO", &format!("User: Started machine #{} P{}", machine_id, machine.program));
    Ok(machine.clone())
}

#[tauri::command]
pub fn stop_machine(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    machine.state          = MachineState::Idle;
    machine.door_status    = 2;
    machine.rpm            = 0;
    machine.water_level    = 0;
    machine.temperature    = 25.0;
    machine.time_remaining = 0;
    state.emit_log("INFO", &format!("User: Emergency stop on machine #{}", machine_id));
    Ok(machine.clone())
}

#[tauri::command]
pub fn advance_state(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    let old = format!("{:?}", machine.state);

    if machine.machine_type == MachineType::Washer {
        machine.state = match machine.state {
            MachineState::Filling   => { machine.rpm = 30;   machine.time_remaining = 20*60; MachineState::Washing }
            MachineState::Washing   => { machine.water_level = 40; machine.time_remaining = 10*60; MachineState::Rinsing }
            MachineState::Rinsing   => { machine.water_level = 0; machine.rpm = 1200; machine.time_remaining = 5*60; MachineState::Spinning }
            MachineState::Spinning  => { machine.rpm = 0; machine.door_status = 2; machine.time_remaining = 0; MachineState::Completed }
            MachineState::Completed => MachineState::Idle,
            _ => return Ok(machine.clone()),
        };
    } else {
        machine.state = match machine.state {
            MachineState::Drying    => { machine.temperature = 25.0; machine.door_status = 2; machine.time_remaining = 0; MachineState::Completed }
            MachineState::Completed => MachineState::Idle,
            _ => return Ok(machine.clone()),
        };
    }
    state.emit_log("INFO", &format!("User: Advanced machine #{} {} → {:?}", machine_id, old, machine.state));
    Ok(machine.clone())
}

#[tauri::command]
pub fn set_program(machine_id: u8, program: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    if machine.state != MachineState::Idle && machine.state != MachineState::Completed {
        return Err("Cannot change program while running".into());
    }
    let cfg = safe_lock(&state.config);
    let progs = match machine.machine_type {
        MachineType::Washer => &cfg.washer_programs,
        MachineType::Dryer  => &cfg.dryer_programs,
    };
    if progs.iter().any(|p| p.id == program) {
        machine.program = program;
    } else if let Some(first_p) = progs.first() {
        machine.program = first_p.id;
    } else {
        return Err("No programs configured for this machine type".into());
    }
    state.emit_log("INFO", &format!("User: Machine #{} set to P{}", machine_id, machine.program));
    Ok(machine.clone())
}

#[tauri::command]
pub fn toggle_door(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    match machine.door_status {
        1 => { machine.door_status = 2; state.emit_log("INFO", &format!("User: Closed door on machine #{}", machine_id)); }
        2 => { machine.door_status = 1; state.emit_log("INFO", &format!("User: Opened door on machine #{}", machine_id)); }
        3 => { machine.door_status = 6; machine.door_timer = 2.0; state.emit_log("INFO", &format!("User: Unlocking door on machine #{}", machine_id)); }
        _ => {}
    }
    Ok(machine.clone())
}

#[tauri::command]
pub fn toggle_door_lock(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    if machine.door_status == 2 {
        machine.door_status = 5;
        machine.door_timer  = 2.0;
        state.emit_log("INFO", &format!("User: Locking door on machine #{}", machine_id));
    } else if machine.door_status == 3 {
        machine.door_status = 6;
        machine.door_timer  = 2.0;
        state.emit_log("INFO", &format!("User: Unlocking door on machine #{}", machine_id));
    }
    Ok(machine.clone())
}

#[tauri::command]
pub fn trigger_error(machine_id: u8, error_code: u32, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    machine.state      = MachineState::Error;
    machine.error_code = error_code;
    let desc = match error_code {
        1 => { machine.temperature = 120.0; "Overheat" }
        2 => "Water Timeout",
        3 => "Drain Blockage",
        4 => "Door Sensor Fault",
        _ => "General Error",
    };
    state.emit_log("ERROR", &format!("User: Triggered E{:02} ({}) on machine #{}", error_code, desc, machine_id));
    Ok(machine.clone())
}

#[tauri::command]
pub fn clear_error(machine_id: u8, state: State<AppState>) -> Result<Machine, String> {
    let mut m = safe_lock(&state.machines);
    let machine = m.iter_mut().find(|m| m.id == machine_id).ok_or("Machine not found")?;
    machine.state       = MachineState::Idle;
    machine.error_code  = 0;
    machine.temperature = 25.0;
    machine.door_status = 2;
    state.emit_log("INFO", &format!("User: Cleared error on machine #{}", machine_id));
    Ok(machine.clone())
}

// ── Bulk operations ───────────────────────────────────────────

#[tauri::command]
pub fn bulk_start_machines(state: State<AppState>) -> Result<(), String> {
    let mut m   = safe_lock(&state.machines);
    let cfg     = safe_lock(&state.config);
    let mut count = 0u32;

    for machine in m.iter_mut() {
        if machine.state != MachineState::Idle { continue; }
        let price = get_program_price(machine.machine_type, machine.program, &cfg);
        if machine.coins >= price {
            machine.coins         -= price;
            machine.total_coins   += price;
            machine.door_status    = 3;
            machine.time_remaining = get_program_duration(machine.machine_type, machine.program, &cfg);
            if machine.machine_type == MachineType::Washer {
                machine.state       = MachineState::Filling;
                machine.water_level = 30;
            } else {
                machine.state       = MachineState::Drying;
                machine.temperature = 45.0;
            }
            count += 1;
        }
    }
    state.emit_log("INFO", &format!("Bulk: Started {} machines", count));
    Ok(())
}

#[tauri::command]
pub fn bulk_stop_machines(state: State<AppState>) -> Result<(), String> {
    let mut m = safe_lock(&state.machines);
    for machine in m.iter_mut() {
        machine.state          = MachineState::Idle;
        machine.door_status    = 2;
        machine.rpm            = 0;
        machine.water_level    = 0;
        machine.temperature    = 25.0;
        machine.time_remaining = 0;
    }
    state.emit_log("INFO", "Bulk: All machines stopped");
    Ok(())
}
