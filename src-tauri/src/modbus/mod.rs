// Path: src-tauri/src/modbus/mod.rs
// Modbus RTU server thread, CRC helpers, frame encoding/decoding,
// and Tauri commands for managing the server lifecycle.

pub mod client;

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::state::{AppState, safe_lock};
use crate::types::{
    FaultConfig, LogEntry, Machine, MachineType, ModbusFrame, PortMachineFilter,
    RegisterMapping, SimulatorConfig, TrafficLog,
};

// ============================================================
// CRC-16 (Modbus RTU)
// ============================================================

pub fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= byte as u16;
        for _ in 0..8 {
            if crc & 0x0001 != 0 {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    crc
}

// ============================================================
// REGISTER HELPERS
// ============================================================

fn state_code(state: &crate::types::MachineState) -> u16 {
    use crate::types::MachineState;
    match state {
        MachineState::Idle | MachineState::Completed => 1,
        _ => 3,
    }
}

fn get_register_value(addr: u16, m: &Machine, map: &RegisterMapping, cfg: &SimulatorConfig) -> u16 {
    if m.machine_type == crate::types::MachineType::Dryer {
        // Dryer custom mapping
        if      addr == map.state       { state_code(&m.state) }
        else if addr == map.door_status { if m.door_status == 1 { 0 } else { 1 } }
        else if addr == map.error_flag  { if m.error_code > 0 { 1 } else { 0 } }
        else if addr == map.time_min    { (m.time_remaining / 60) as u16 } // Total minutes
        else if addr == map.time_sec    { (m.time_remaining % 60) as u16 } // Total seconds
        else if addr == map.time_min+2  { (m.time_remaining / 3600) as u16 } // Total hours
        else if addr == map.temperature { m.temperature as u16 } // Outlet temperature (exhaust)
        else if addr == map.temperature+1 { // Inlet temperature / Target temp
            let (_, step, _) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            if m.time_remaining > 0 { step.target_temp as u16 } else { 0 }
        }
        else if addr == map.program     { m.program as u16 }
        else if addr == map.program+1   {
            let (step_idx, _, _) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            if m.time_remaining > 0 { (step_idx + 1) as u16 } else { 0 }
        }
        else if addr == map.program+2   { crate::programs::get_program_price(m.machine_type, m.program, cfg) as u16 }
        else if addr == map.coins       { m.coins as u16 }
        else if addr == map.total_coins { m.total_coins as u16 }
        else if addr == map.total_coins+1 { m.total_coins as u16 }
        else if addr == map.machine_id  { m.unit_id as u16 }
        else if addr == map.error_code  { m.error_code as u16 }
        else { 0 }
    } else {
        // Washer standard mapping
        if      addr == map.state       { state_code(&m.state) }
        else if addr == map.door_status { m.door_status as u16 }
        else if addr == map.error_flag  { if m.error_code > 0 { 1 } else { 0 } }
        else if addr == map.time_min    {
            let (_, _, step_remain) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            (step_remain / 60) as u16
        }
        else if addr == map.time_sec    {
            let (_, _, step_remain) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            (step_remain % 60) as u16
        }
        // Auto program total remain time
        else if addr == map.time_min + 2 { // 25: Auto program remain time (h)
            (m.time_remaining / 3600) as u16
        }
        else if addr == map.time_min + 3 { // 26: Auto program remain time (min)
            ((m.time_remaining % 3600) / 60) as u16
        }
        else if addr == map.time_min + 4 { // 27: Auto program remain time (sec)
            (m.time_remaining % 60) as u16
        }
        else if addr == map.water_level { m.water_level as u16 }
        else if addr == map.water_level + 1 { // 29: target water level of active step
            let (_, step, _) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            step.target_water as u16
        }
        else if addr == map.temperature {
            m.temperature as u16
        }
        else if addr == map.temperature + 1 { // 31: target temp of active step
            let (_, step, _) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            step.target_temp as u16
        }
        else if addr == map.rpm         { m.rpm as u16 }
        else if addr == map.rpm + 1     { // 33: target rpm of active step
            let (_, step, _) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            step.target_rpm as u16
        }
        else if addr == map.program     { m.program as u16 }
        else if addr == map.program + 1 { // 35: Currently running step number (1-indexed)
            let (step_idx, _, _) = crate::programs::get_active_step_details(m.machine_type, m.program, m.time_remaining, cfg);
            if m.time_remaining > 0 { (step_idx + 1) as u16 } else { 0 }
        }
        else if addr == map.program + 2 { // 36: Coins required of currently selected program
            crate::programs::get_program_price(m.machine_type, m.program, cfg) as u16
        }
        else if addr == map.coins       { m.coins as u16 }
        else if addr == map.total_coins { m.total_coins as u16 }
        else if addr == map.total_coins + 1 { // 39: Current coins in cash box
            m.total_coins as u16
        }
        else if addr == map.machine_id  { m.unit_id as u16 }
        else if addr == map.error_code  { m.error_code as u16 }
        else                            { 0 }
    }
}

fn emit_modbus_log(handle: &AppHandle, msg: String) {
    let _ = handle.emit("log-event", &LogEntry {
        timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
        level: "MODBUS".into(),
        message: msg,
    });
}

fn apply_write_to_machine(
    addr: u16,
    value: u16,
    m: &mut Machine,
    cfg: &SimulatorConfig,
    map: &RegisterMapping,
    handle: &AppHandle,
) {
    use crate::programs::{get_program_duration, get_program_price};
    use crate::types::{MachineState, MachineType};

    let clean_addr = if addr >= 40000 { addr.saturating_sub(40000) } else { addr };

    if clean_addr == map.write_error_reset && value == 1 {
        m.state = MachineState::Idle;
        m.error_code = 0;
        m.temperature = 25.0;
        m.door_status = 2;
        emit_modbus_log(handle, format!("Modbus: Error reset on machine #{}", m.id));
    } else if clean_addr == map.write_start {
        if value == 1 && (m.state == MachineState::Idle || m.state == MachineState::Completed) {
            let price = get_program_price(m.machine_type, m.program, cfg);
            if m.coins >= price && m.door_status != 1 {
                m.coins -= price;
                m.total_coins += price;
                m.time_remaining = get_program_duration(m.machine_type, m.program, cfg);
                m.door_status = 3;
                if m.machine_type == MachineType::Washer {
                    m.state = MachineState::Filling;
                    m.water_level = 30;
                } else {
                    m.state = MachineState::Drying;
                    m.temperature = 45.0;
                }
                emit_modbus_log(handle, format!(
                    "Modbus: Machine #{} STARTED (prog={}, price={}, remaining_coins={})",
                    m.id, m.program, price, m.coins
                ));
            } else {
                // Log the reason for failure
                let reason = if m.coins < price {
                    format!("insufficient coins ({} < {} required)", m.coins, price)
                } else {
                    "door is open".to_string()
                };
                emit_modbus_log(handle, format!(
                    "Modbus: Machine #{} START REJECTED — {}",
                    m.id, reason
                ));
            }
        } else if value == 1 {
            emit_modbus_log(handle, format!(
                "Modbus: Machine #{} START REJECTED — state is {:?} (must be Idle or Completed)",
                m.id, m.state
            ));
        }
    } else if clean_addr == map.write_advance {
        if value == 1 && m.time_remaining > 60 {
            m.time_remaining = m.time_remaining.saturating_sub(60);
            emit_modbus_log(handle, format!("Modbus: Machine #{} advance -60s (remain={}s)", m.id, m.time_remaining));
        }
    } else if clean_addr == map.write_stop && value == 1 {
        m.state = MachineState::Idle;
        m.door_status = 2;
        m.rpm = 0;
        m.water_level = 0;
        m.temperature = 25.0;
        m.time_remaining = 0;
        emit_modbus_log(handle, format!("Modbus: Machine #{} STOPPED via write command", m.id));
    } else if clean_addr == map.write_coins {
        m.coins = m.coins.saturating_add(value as u32);
        emit_modbus_log(handle, format!("Modbus: Machine #{} coins +{} (total={})", m.id, value, m.coins));
    } else if clean_addr == map.write_program && (1..=30).contains(&value) {
        m.program = value as u8;
        emit_modbus_log(handle, format!("Modbus: Machine #{} program set to {}", m.id, value));
    } else {
        emit_modbus_log(handle, format!(
            "Modbus: Machine #{} — unhandled write reg {} = {} (no matching mapping)",
            m.id, clean_addr, value
        ));
    }
}

// ============================================================
// FRAME ENCODE / DECODE
// ============================================================

fn fc03_response_dynamic(
    unit_id: u8,
    start: u16,
    count: u16,
    m: &Machine,
    map: &RegisterMapping,
    cfg: &SimulatorConfig,
) -> Option<Vec<u8>> {
    // Modbus spec: max 125 registers per read request
    if count == 0 || count > 125 {
        return None;
    }
    let base_addr = if start >= 40000 { start.saturating_sub(40000) } else { start };
    let mut resp = vec![unit_id, 0x03, (count * 2) as u8];
    for i in 0..count {
        let v = get_register_value(base_addr + i, m, map, cfg);
        resp.push((v >> 8) as u8);
        resp.push((v & 0xFF) as u8);
    }
    let crc = crc16(&resp);
    resp.push((crc & 0xFF) as u8);
    resp.push((crc >> 8) as u8);
    Some(resp)
}

fn write_echo_response(frame: &[u8]) -> Vec<u8> {
    frame.to_vec()
}

fn decode_modbus_pdu(frame: &[u8], port_name: Option<&str>) -> Option<ModbusFrame> {
    if frame.len() < 6 {
        return None;
    }
    let unit_id = frame[0];
    let fc      = frame[1];
    let addr    = u16::from_be_bytes([frame[2], frame[3]]);
    let qty     = u16::from_be_bytes([frame[4], frame[5]]);
    let hex     = frame.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
    let desc = match fc {
        0x03 => format!("Read {} regs @ {}", qty, 40000 + addr),
        0x06 => format!("Write reg {} = {}", addr, qty),
        0x10 => format!("Write {} regs @ {}", qty, addr),
        _    => format!("FC{:02X}", fc),
    };
    Some(ModbusFrame {
        port: port_name.map(|s| s.to_string()),
        unit_id,
        function_code: fc,
        address: addr,
        quantity: qty,
        hex,
        desc,
        timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
    })
}

// ============================================================
// SERVER BACKGROUND THREAD
// ============================================================

pub fn modbus_server_thread(
    port_name:        String,
    baud:             u32,
    machine_filter:   PortMachineFilter,
    stop_flag:        Arc<AtomicBool>,
    machines:         Arc<Mutex<Vec<Machine>>>,
    config:           Arc<Mutex<SimulatorConfig>>,
    fault_cfg:        Arc<Mutex<FaultConfig>>,
    rx_counter:       Arc<Mutex<u64>>,
    tx_counter:       Arc<Mutex<u64>>,
    handle:           AppHandle,
    modbus_connected: Arc<AtomicBool>,
) {
    'reconnect: loop {
        if stop_flag.load(Ordering::SeqCst) { break; }

        let port_result = serialport::new(&port_name, baud)
            .timeout(Duration::from_millis(50))
            .open();

        let mut port = match port_result {
            Ok(p) => {
                modbus_connected.store(true, Ordering::SeqCst);
                let filter_desc = match &machine_filter {
                    PortMachineFilter::All => "All machines".to_string(),
                    PortMachineFilter::WashersOnly => "Washers only".to_string(),
                    PortMachineFilter::DryersOnly => "Dryers only".to_string(),
                    PortMachineFilter::Custom(ids) => format!("Machines: {:?}", ids),
                };
                let _ = handle.emit("log-event", &LogEntry {
                    timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                    level: "MODBUS".into(),
                    message: format!("Modbus: Opened {} @ {} baud ({})", port_name, baud, filter_desc),
                });
                p
            }
            Err(e) => {
                modbus_connected.store(false, Ordering::SeqCst);
                let _ = handle.emit("log-event", &LogEntry {
                    timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                    level: "ERROR".into(),
                    message: format!("Modbus: Failed to open {}: {} — retrying in 3s", port_name, e),
                });
                for _ in 0..30 {
                    if stop_flag.load(Ordering::SeqCst) { break 'reconnect; }
                    std::thread::sleep(Duration::from_millis(100));
                }
                continue 'reconnect;
            }
        };

        let mut buf     = [0u8; 256];
        let mut frame: Vec<u8> = Vec::with_capacity(256);
        let mut last_rx = std::time::Instant::now();

        loop {
            if stop_flag.load(Ordering::SeqCst) { break 'reconnect; }

            // Inter-frame silence detection: if we have accumulated bytes
            // but no new data for >5ms, the frame is complete (or garbage).
            // Modbus RTU standard: 3.5 char silence = frame boundary.
            if !frame.is_empty() && last_rx.elapsed() > Duration::from_millis(5) {
                let expected_len = if frame.len() >= 2 {
                    match frame[1] {
                        0x03 | 0x04 => Some(8usize),
                        0x06        => Some(8),
                        0x10 if frame.len() >= 7 => {
                            let byte_count = frame[6] as usize;
                            Some(9 + byte_count)
                        }
                        _ => None,
                    }
                } else {
                    None
                };

                let should_discard = match expected_len {
                    None => true,
                    Some(len) => frame.len() != len,
                };

                if should_discard {
                    let garbage_hex = frame.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                    let _ = handle.emit("log-event", &LogEntry {
                        timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                        level: "WARN".into(),
                        message: format!("Modbus [{}]: Discarded {} stale bytes: {}", port_name, frame.len(), garbage_hex),
                    });
                    frame.clear();
                }
            }

            match port.read(&mut buf) {
                Ok(n) if n > 0 => {
                    frame.extend_from_slice(&buf[..n]);
                    last_rx = std::time::Instant::now();

                    let expected_len = if frame.len() >= 2 {
                        match frame[1] {
                            0x03 | 0x04 => Some(8usize),
                            0x06        => Some(8),
                            0x10 if frame.len() >= 7 => {
                                let byte_count = frame[6] as usize;
                                Some(9 + byte_count)
                            }
                            _ => None,
                        }
                    } else {
                        None
                    };

                    if let Some(len) = expected_len {
                        if frame.len() < len { continue; }

                        let raw = frame.drain(..len).collect::<Vec<_>>();

                        // CRC validation
                        let payload_crc = crc16(&raw[..raw.len()-2]);
                        let frame_crc   = u16::from_le_bytes([raw[raw.len()-2], raw[raw.len()-1]]);
                        if payload_crc != frame_crc {
                            let _ = handle.emit("log-event", &LogEntry {
                                timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                                level: "ERROR".into(),
                                message: format!("Modbus [{}]: CRC error on received frame", port_name),
                            });
                            frame.clear();
                            continue;
                        }

                        *safe_lock(&rx_counter) += 1;
                        let rx_hex = raw.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                        let _ = handle.emit("traffic-event", &TrafficLog {
                            direction: "RX".into(),
                            hex: rx_hex,
                            timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                            port: Some(port_name.clone()),
                        });

                        if let Some(decoded) = decode_modbus_pdu(&raw, Some(&port_name)) {
                            // Dedicated machine filter per port check
                            let is_machine_allowed = match &machine_filter {
                                PortMachineFilter::All => {
                                    let m_lock = safe_lock(&machines);
                                    m_lock.iter().any(|m| m.unit_id == decoded.unit_id && (m.port.is_none() || m.port.as_deref() == Some(&port_name)))
                                }
                                PortMachineFilter::WashersOnly => {
                                    let m_lock = safe_lock(&machines);
                                    m_lock.iter().any(|m| m.unit_id == decoded.unit_id && m.machine_type == MachineType::Washer && (m.port.is_none() || m.port.as_deref() == Some(&port_name)))
                                }
                                PortMachineFilter::DryersOnly => {
                                    let m_lock = safe_lock(&machines);
                                    m_lock.iter().any(|m| m.unit_id == decoded.unit_id && m.machine_type == MachineType::Dryer && (m.port.is_none() || m.port.as_deref() == Some(&port_name)))
                                }
                                PortMachineFilter::Custom(ids) => ids.contains(&decoded.unit_id),
                            };

                            if !is_machine_allowed {
                                // Frame addressed to a slave not on this port bus — ignore silently per Modbus RTU spec
                                continue;
                            }

                            let _ = handle.emit("modbus-frame", &decoded);

                            let fault = safe_lock(&fault_cfg).clone();

                            if fault.timeout {
                                std::thread::sleep(Duration::from_secs(2));
                                continue;
                            }
                            if fault.exception_code > 0 {
                                let exc = vec![decoded.unit_id, 0x80 | decoded.function_code, fault.exception_code];
                                let crc = crc16(&exc);
                                let mut resp = exc;
                                resp.push((crc & 0xFF) as u8);
                                resp.push((crc >> 8) as u8);
                                let _ = port.write_all(&resp);
                                let _ = port.flush();
                                continue;
                            }

                            let response: Option<Vec<u8>> = {
                                let mut m_lock  = safe_lock(&machines);
                                let cfg_lock    = safe_lock(&config);
                                let machine = m_lock.iter_mut().find(|m| {
                                    m.unit_id == decoded.unit_id && (m.port.is_none() || m.port.as_deref() == Some(&port_name))
                                });

                                if let Some(m) = machine {
                                    let map = match m.machine_type {
                                        MachineType::Washer => &cfg_lock.washer_mapping,
                                        MachineType::Dryer  => &cfg_lock.dryer_mapping,
                                    };
                                    match decoded.function_code {
                                        0x03 | 0x04 => {
                                            fc03_response_dynamic(decoded.unit_id, decoded.address, decoded.quantity, m, map, &cfg_lock)
                                        }
                                        0x06 => {
                                            apply_write_to_machine(decoded.address, decoded.quantity, m, &cfg_lock, map, &handle);
                                            Some(write_echo_response(&raw))
                                        }
                                        0x10 => {
                                            let count = decoded.quantity;
                                            let byte_count = raw[6] as u16;
                                            if byte_count != count * 2 {
                                                None
                                            } else {
                                                for i in 0..count {
                                                    if 9 + (i as usize)*2 + 1 < raw.len() {
                                                        let val = u16::from_be_bytes([raw[9 + i as usize * 2], raw[9 + i as usize * 2 + 1]]);
                                                        apply_write_to_machine(decoded.address + i, val, m, &cfg_lock, map, &handle);
                                                    }
                                                }
                                                let echo_payload = raw[..6].to_vec();
                                                let echo_crc = crc16(&echo_payload);
                                                let mut echo_frame = echo_payload;
                                                echo_frame.push((echo_crc & 0xFF) as u8);
                                                echo_frame.push((echo_crc >> 8) as u8);
                                                Some(echo_frame)
                                            }
                                        }
                                        _ => None,
                                    }
                                } else { None }
                            };

                            if let Some(mut resp) = response {
                                if fault.crc_error && resp.len() >= 2 {
                                    let n = resp.len();
                                    resp[n-1] ^= 0xFF;
                                }

                                let tx_hex = resp.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                                let _ = port.write_all(&resp);
                                let _ = port.flush();
                                *safe_lock(&tx_counter) += 1;
                                let _ = handle.emit("traffic-event", &TrafficLog {
                                    direction: "TX".into(),
                                    hex: tx_hex,
                                    timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                                    port: Some(port_name.clone()),
                                });

                                if matches!(decoded.function_code, 0x06 | 0x10) {
                                    let _ = handle.emit("machines-updated", ());
                                }
                            }
                        }
                    }
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut
                    || e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    // Port disconnected or fatal I/O error — attempt auto-reconnect
                    modbus_connected.store(false, Ordering::SeqCst);
                    frame.clear();
                    let _ = handle.emit("log-event", &LogEntry {
                        timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                        level: "WARN".into(),
                        message: format!("Modbus: Port {} disconnected ({}) — reconnecting in 3s…", port_name, e),
                    });
                    let mut cancelled = false;
                    for _ in 0..30 {
                        if stop_flag.load(Ordering::SeqCst) { cancelled = true; break; }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    if cancelled { break 'reconnect; }
                    continue 'reconnect;
                }
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }

    modbus_connected.store(false, Ordering::SeqCst);
    let _ = handle.emit("log-event", &LogEntry {
        timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
        level: "MODBUS".into(),
        message: format!("Modbus: Server stopped on {}", port_name),
    });
}

// ============================================================
// HELPER: START PORT SERVER
// ============================================================

pub fn start_port_server_internal(
    port: String,
    baud: u32,
    machine_filter: PortMachineFilter,
    state: &AppState,
    handle: AppHandle,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    let mut workers = safe_lock(&state.modbus_workers);
    if let Some(existing) = workers.get(&port) {
        if existing.connected.load(Ordering::SeqCst) || !existing.stop_flag.load(Ordering::SeqCst) {
            return Err(format!("Modbus server on port {} is already running", port));
        }
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let connected = Arc::new(AtomicBool::new(false));
    let rx_counter = Arc::new(Mutex::new(0));
    let tx_counter = Arc::new(Mutex::new(0));

    let worker = crate::state::ActivePortWorker {
        port: port.clone(),
        baud,
        machine_filter: machine_filter.clone(),
        stop_flag: Arc::clone(&stop_flag),
        connected: Arc::clone(&connected),
        rx_counter: Arc::clone(&rx_counter),
        tx_counter: Arc::clone(&tx_counter),
    };
    workers.insert(port.clone(), worker);
    drop(workers);

    let machines          = Arc::clone(&state.machines);
    let config            = Arc::clone(&state.config);
    let fault_cfg         = Arc::clone(&state.fault_config);
    let port_clone        = port.clone();
    let conn_clone        = Arc::clone(&connected);

    std::thread::spawn(move || {
        modbus_server_thread(
            port_clone,
            baud,
            machine_filter,
            stop_flag,
            machines,
            config,
            fault_cfg,
            rx_counter,
            tx_counter,
            handle,
            conn_clone,
        );
    });

    state.emit_log("MODBUS", &format!("Modbus: Server started on {}", port));
    Ok(())
}

// ============================================================
// TAURI COMMANDS — Modbus Server
// ============================================================

#[tauri::command]
pub fn list_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .collect()
}

#[tauri::command]
pub fn get_modbus_status(state: State<AppState>) -> crate::types::ModbusStatus {
    use std::sync::atomic::Ordering;

    let workers = safe_lock(&state.modbus_workers);
    let cfg = safe_lock(&state.config);

    let mut port_statuses: Vec<crate::types::PortStatus> = Vec::new();
    let mut seen_ports = std::collections::HashSet::new();

    let mut total_rx = 0u64;
    let mut total_tx = 0u64;
    let mut any_connected = false;
    let mut active_port_names = Vec::new();

    // 1. Configured ports from settings
    for port_cfg in &cfg.ports {
        seen_ports.insert(port_cfg.port.clone());
        if let Some(worker) = workers.get(&port_cfg.port) {
            let is_conn = worker.connected.load(Ordering::SeqCst);
            let rx = *safe_lock(&worker.rx_counter);
            let tx = *safe_lock(&worker.tx_counter);
            total_rx += rx;
            total_tx += tx;
            if is_conn {
                any_connected = true;
                active_port_names.push(port_cfg.port.clone());
            }
            port_statuses.push(crate::types::PortStatus {
                port: port_cfg.port.clone(),
                baud: worker.baud,
                connected: is_conn,
                rx_count: rx,
                tx_count: tx,
                machine_filter: worker.machine_filter.clone(),
                auto_connect: port_cfg.auto_connect,
            });
        } else {
            port_statuses.push(crate::types::PortStatus {
                port: port_cfg.port.clone(),
                baud: port_cfg.baud,
                connected: false,
                rx_count: 0,
                tx_count: 0,
                machine_filter: port_cfg.machine_filter.clone(),
                auto_connect: port_cfg.auto_connect,
            });
        }
    }

    // 2. Active workers not in config.ports
    for (port_name, worker) in workers.iter() {
        if !seen_ports.contains(port_name) {
            let is_conn = worker.connected.load(Ordering::SeqCst);
            let rx = *safe_lock(&worker.rx_counter);
            let tx = *safe_lock(&worker.tx_counter);
            total_rx += rx;
            total_tx += tx;
            if is_conn {
                any_connected = true;
                active_port_names.push(port_name.clone());
            }
            port_statuses.push(crate::types::PortStatus {
                port: port_name.clone(),
                baud: worker.baud,
                connected: is_conn,
                rx_count: rx,
                tx_count: tx,
                machine_filter: worker.machine_filter.clone(),
                auto_connect: false,
            });
        }
    }

    let summary_port = if !active_port_names.is_empty() {
        active_port_names.join(", ")
    } else {
        safe_lock(&state.modbus_port).clone()
    };
    let summary_baud = port_statuses.first().map(|p| p.baud).unwrap_or(9600);

    state.modbus_connected.store(any_connected, Ordering::SeqCst);
    *safe_lock(&state.modbus_rx) = total_rx;
    *safe_lock(&state.modbus_tx) = total_tx;

    crate::types::ModbusStatus {
        connected: any_connected,
        port: summary_port,
        baud: summary_baud,
        rx_count: total_rx,
        tx_count: total_tx,
        ports: port_statuses,
    }
}

#[tauri::command]
pub fn start_modbus_server(
    port: String,
    baud: u32,
    machine_filter: Option<PortMachineFilter>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Validate baud rate
    if !matches!(baud, 1200 | 2400 | 4800 | 9600 | 19200 | 38400 | 57600 | 115200) {
        return Err(format!("Invalid baud rate: {}. Supported: 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200", baud));
    }

    let filter = machine_filter.unwrap_or_else(|| {
        let cfg = safe_lock(&state.config);
        cfg.ports.iter()
            .find(|p| p.port == port)
            .map(|p| p.machine_filter.clone())
            .unwrap_or(PortMachineFilter::All)
    });

    start_port_server_internal(port.clone(), baud, filter.clone(), &state, app)?;

    // Persist to configuration
    {
        let mut cfg = safe_lock(&state.config);
        cfg.auto_start = true;
        cfg.last_port  = port.clone();
        cfg.last_baud  = baud;
        if let Some(existing) = cfg.ports.iter_mut().find(|p| p.port == port) {
            existing.baud = baud;
            existing.machine_filter = filter;
            existing.auto_connect = true;
        } else {
            cfg.ports.push(crate::types::PortSetting {
                port: port.clone(),
                baud,
                machine_filter: filter,
                auto_connect: true,
            });
        }
    }
    state.save_config();

    Ok(())
}

#[tauri::command]
pub fn stop_modbus_server(port: Option<String>, state: State<AppState>) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    let mut workers = safe_lock(&state.modbus_workers);

    if let Some(target_port) = port {
        if let Some(worker) = workers.remove(&target_port) {
            worker.stop_flag.store(true, Ordering::SeqCst);
            worker.connected.store(false, Ordering::SeqCst);

            {
                let mut cfg = safe_lock(&state.config);
                if let Some(p) = cfg.ports.iter_mut().find(|p| p.port == target_port) {
                    p.auto_connect = false;
                }
            }
            drop(workers);
            state.save_config();
            state.emit_log("MODBUS", &format!("Modbus: Server stopped on {}", target_port));
            Ok(())
        } else {
            Err(format!("Port {} is not running", target_port))
        }
    } else {
        // Stop all ports
        for (port_name, worker) in workers.drain() {
            worker.stop_flag.store(true, Ordering::SeqCst);
            worker.connected.store(false, Ordering::SeqCst);
            state.emit_log("MODBUS", &format!("Modbus: Server stopped on {}", port_name));
        }
        drop(workers);
        {
            let mut cfg = safe_lock(&state.config);
            cfg.auto_start = false;
            for p in cfg.ports.iter_mut() {
                p.auto_connect = false;
            }
        }
        state.save_config();
        state.modbus_connected.store(false, Ordering::SeqCst);
        Ok(())
    }
}

#[tauri::command]
pub fn start_all_modbus_servers(state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let ports_to_start: Vec<(String, u32, PortMachineFilter)> = {
        let cfg = safe_lock(&state.config);
        cfg.ports.iter().map(|p| (p.port.clone(), p.baud, p.machine_filter.clone())).collect()
    };

    if ports_to_start.is_empty() {
        return Err("No ports configured to start".into());
    }

    let mut started = 0;
    for (port, baud, filter) in ports_to_start {
        if start_port_server_internal(port.clone(), baud, filter.clone(), &state, app.clone()).is_ok() {
            started += 1;
        }
    }

    {
        let mut cfg = safe_lock(&state.config);
        cfg.auto_start = true;
        for p in cfg.ports.iter_mut() {
            p.auto_connect = true;
        }
    }
    state.save_config();
    state.emit_log("MODBUS", &format!("Modbus: Started {} ports", started));
    Ok(())
}

#[tauri::command]
pub fn stop_all_modbus_servers(state: State<AppState>) -> Result<(), String> {
    stop_modbus_server(None, state)
}

#[tauri::command]
pub fn save_port_config(
    port: String,
    baud: u32,
    machine_filter: PortMachineFilter,
    auto_connect: bool,
    state: State<AppState>,
) -> Result<(), String> {
    let mut cfg = safe_lock(&state.config);
    if let Some(existing) = cfg.ports.iter_mut().find(|p| p.port == port) {
        existing.baud = baud;
        existing.machine_filter = machine_filter;
        existing.auto_connect = auto_connect;
    } else {
        cfg.ports.push(crate::types::PortSetting {
            port: port.clone(),
            baud,
            machine_filter,
            auto_connect,
        });
    }
    drop(cfg);
    state.save_config();
    Ok(())
}

#[tauri::command]
pub fn remove_port_config(port: String, state: State<AppState>) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    // Stop worker if running
    let mut workers = safe_lock(&state.modbus_workers);
    if let Some(worker) = workers.remove(&port) {
        worker.stop_flag.store(true, Ordering::SeqCst);
        worker.connected.store(false, Ordering::SeqCst);
    }
    drop(workers);

    // Remove from settings
    {
        let mut cfg = safe_lock(&state.config);
        cfg.ports.retain(|p| p.port != port);
    }
    state.save_config();
    state.emit_log("MODBUS", &format!("Modbus: Removed port configuration for {}", port));
    Ok(())
}

#[tauri::command]
pub fn set_fault_mode(config: FaultConfig, state: State<AppState>) -> Result<(), String> {
    *safe_lock(&state.fault_config) = config;
    Ok(())
}

#[tauri::command]
pub fn get_fault_config(state: State<AppState>) -> FaultConfig {
    safe_lock(&state.fault_config).clone()
}
