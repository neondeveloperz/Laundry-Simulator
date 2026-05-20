// Path: src-tauri/src/modbus/client.rs
// Virtual PLC — Modbus RTU master (client) commands.
// Allows the app to act as a Modbus master to query real devices on the same bus.

use std::io::{Read, Write};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::State;

use crate::modbus::crc16;
use crate::state::{AppState, safe_lock};

#[tauri::command]
pub fn start_modbus_client(port_name: String, baud: u32, state: State<AppState>) -> Result<(), String> {
    let mut client = safe_lock(&state.client_port);
    if client.is_some() {
        return Err("Client already connected".into());
    }

    let port = serialport::new(&port_name, baud)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| format!("Failed to open port: {}", e))?;

    *client = Some(port);
    state.client_connected.store(true, Ordering::SeqCst);
    state.emit_log("MODBUS", &format!("Modbus Client: Connected to {} @ {} baud", port_name, baud));
    Ok(())
}

#[tauri::command]
pub fn stop_modbus_client(state: State<AppState>) -> Result<(), String> {
    *safe_lock(&state.client_port) = None;
    state.client_connected.store(false, Ordering::SeqCst);
    state.emit_log("MODBUS", "Modbus Client: Disconnected");
    Ok(())
}

#[tauri::command]
pub fn get_modbus_client_status(state: State<AppState>) -> Result<bool, String> {
    Ok(state.client_connected.load(Ordering::SeqCst))
}

/// Send a Modbus RTU request and return the decoded register values.
/// Supports FC03/FC04 (read) and FC05/FC06 (write single).
#[tauri::command]
pub fn modbus_client_request(
    unit_id: u8,
    fc: u8,
    address: u16,
    value_or_qty: u16,
    state: State<AppState>,
) -> Result<Vec<u16>, String> {
    let mut client_lock = safe_lock(&state.client_port);
    let port = client_lock.as_mut().ok_or("Modbus client is not connected")?;

    let _ = port.clear(serialport::ClearBuffer::All);

    // Build RTU request
    let mut req = vec![
        unit_id,
        fc,
        (address >> 8) as u8,
        (address & 0xFF) as u8,
        (value_or_qty >> 8) as u8,
        (value_or_qty & 0xFF) as u8,
    ];
    let crc = crc16(&req);
    req.push((crc & 0xFF) as u8);
    req.push((crc >> 8) as u8);

    port.write_all(&req).map_err(|e| format!("Failed to write serial: {}", e))?;
    let _ = port.flush();

    // Read response with 1s timeout
    let mut buf  = [0u8; 256];
    let mut resp = Vec::with_capacity(256);
    let start    = std::time::Instant::now();

    while start.elapsed() < Duration::from_millis(1000) {
        if let Ok(n) = port.read(&mut buf) {
            if n > 0 {
                resp.extend_from_slice(&buf[..n]);

                if resp.len() >= 3 {
                    // Guard: check for Modbus exception response
                    if resp[1] == fc + 0x80 && resp.len() >= 5 {
                        let crc_calc = crc16(&resp[..3]);
                        let crc_val  = u16::from_le_bytes([resp[3], resp[4]]);
                        return if crc_calc == crc_val {
                            Err(format!("Modbus Exception: Code {}", resp[2]))
                        } else {
                            Err("Modbus Exception returned, but CRC was invalid".into())
                        };
                    }

                    let expected_len = match fc {
                        0x03 | 0x04 => {
                            let byte_count = resp[2] as usize;
                            Some(5 + byte_count)
                        }
                        0x05 | 0x06 => Some(8),
                        _ => None,
                    };

                    if let Some(len) = expected_len {
                        if resp.len() >= len {
                            let crc_calc = crc16(&resp[..len - 2]);
                            let crc_val  = u16::from_le_bytes([resp[len - 2], resp[len - 1]]);
                            if crc_calc != crc_val {
                                return Err("CRC Error on response frame".into());
                            }

                            let mut data = Vec::new();
                            match fc {
                                0x03 | 0x04 => {
                                    let qty = (resp[2] / 2) as usize;
                                    for i in 0..qty {
                                        let value = ((resp[3 + i * 2] as u16) << 8)
                                            | (resp[3 + i * 2 + 1] as u16);
                                        data.push(value);
                                    }
                                }
                                0x05 | 0x06 => {
                                    data.push(((resp[4] as u16) << 8) | (resp[5] as u16));
                                }
                                _ => {}
                            }
                            return Ok(data);
                        }
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(5));
    }

    Err("Timeout waiting for response".into())
}
