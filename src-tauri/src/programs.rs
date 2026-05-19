// Path: src-tauri/src/programs.rs
// Program lookup helpers — duration, price, and step resolution.

use crate::types::{MachineType, ProgramStep, SimulatorConfig};

pub fn get_program_duration(m_type: MachineType, program: u8, cfg: &SimulatorConfig) -> u32 {
    let progs = match m_type {
        MachineType::Washer => &cfg.washer_programs,
        MachineType::Dryer  => &cfg.dryer_programs,
    };
    if let Some(p) = progs.iter().find(|p| p.id == program) {
        if let Some(ref steps) = p.steps {
            if !steps.is_empty() {
                return steps.iter().map(|s| s.duration_mins).sum::<u32>() * 60;
            }
        }
        return p.minutes * 60;
    }
    45 * 60
}

pub fn get_program_price(m_type: MachineType, program: u8, cfg: &SimulatorConfig) -> u32 {
    let progs = match m_type {
        MachineType::Washer => &cfg.washer_programs,
        MachineType::Dryer  => &cfg.dryer_programs,
    };
    progs.iter().find(|p| p.id == program).map(|p| p.price).unwrap_or(40)
}

pub fn get_program_steps(m_type: MachineType, program: u8, cfg: &SimulatorConfig) -> Vec<ProgramStep> {
    let progs = match m_type {
        MachineType::Washer => &cfg.washer_programs,
        MachineType::Dryer  => &cfg.dryer_programs,
    };
    if let Some(prog) = progs.iter().find(|p| p.id == program) {
        if let Some(ref s) = prog.steps {
            if !s.is_empty() {
                return s.clone();
            }
        }
        return get_default_steps(m_type, prog.minutes);
    }
    get_default_steps(m_type, 30)
}

pub fn get_default_steps(machine_type: MachineType, duration_mins: u32) -> Vec<ProgramStep> {
    match machine_type {
        MachineType::Washer => vec![
            ProgramStep {
                name: "Filling".into(),
                duration_mins: (duration_mins * 30 / 100).max(1),
                target_water: 100,
                target_temp: 30,
                target_rpm: 0,
            },
            ProgramStep {
                name: "Washing".into(),
                duration_mins: (duration_mins * 45 / 100).max(1),
                target_water: 80,
                target_temp: 40,
                target_rpm: 50,
            },
            ProgramStep {
                name: "Rinsing".into(),
                duration_mins: (duration_mins * 15 / 100).max(1),
                target_water: 50,
                target_temp: 25,
                target_rpm: 70,
            },
            ProgramStep {
                name: "Spinning".into(),
                duration_mins: (duration_mins * 10 / 100).max(1),
                target_water: 0,
                target_temp: 25,
                target_rpm: 1200,
            },
        ],
        MachineType::Dryer => vec![
            ProgramStep {
                name: "Drying".into(),
                duration_mins: (duration_mins * 85 / 100).max(1),
                target_water: 0,
                target_temp: 65,
                target_rpm: 50,
            },
            ProgramStep {
                name: "Cool Down".into(),
                duration_mins: (duration_mins * 15 / 100).max(1),
                target_water: 0,
                target_temp: 25,
                target_rpm: 40,
            },
        ],
    }
}

/// Returns the active step index, step details, and remaining seconds within that step.
pub fn get_active_step_details(
    m_type: MachineType,
    program: u8,
    time_remaining: u32,
    cfg: &SimulatorConfig,
) -> (usize, ProgramStep, u32) {
    let steps = get_program_steps(m_type, program, cfg);
    if steps.is_empty() {
        return (0, ProgramStep {
            name: "Idle".into(),
            duration_mins: 0,
            target_water: 0,
            target_temp: 25,
            target_rpm: 0,
        }, 0);
    }

    let total_sec: u32 = steps.iter().map(|s| s.duration_mins * 60).sum();
    let elapsed = total_sec.saturating_sub(time_remaining);
    let mut acc = 0u32;

    for (i, s) in steps.iter().enumerate() {
        let step_sec = s.duration_mins * 60;
        if elapsed < acc + step_sec {
            let step_remaining = step_sec - (elapsed - acc);
            return (i, s.clone(), step_remaining);
        }
        acc += step_sec;
    }

    let last_idx = steps.len() - 1;
    (last_idx, steps[last_idx].clone(), 0)
}
