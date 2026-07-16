//! Client for the torabo capability descriptor (GATT e1f4a000).
//!
//! Read-only, read once on connect: it tells the app which feature modules this
//! firmware was actually built with, their wire versions, and the firmware
//! version — so the UI shows only what this keyboard can do instead of guessing.
//!
//! A firmware without the service is "pre-capabilities": discovery fails, the app
//! falls back to showing everything, and individual feature reads fail as before.
//! So this never breaks an older keyboard.

use bluest::{Characteristic, Device};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const CAPS_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4a000_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const CAPS_VAL_UUID: Uuid = Uuid::from_u128(0xe1f4a001_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

async fn caps_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(CAPS_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover capability service: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Capability service not found (firmware predates it)".to_string())?;

    let chrc = service
        .discover_characteristics_with_uuid(CAPS_VAL_UUID)
        .await
        .map_err(|e| format!("Failed to discover capability characteristic: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Capability characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read the firmware's self-description. Errors if the firmware predates it —
/// the caller treats that as "unknown capabilities", not as a failure.
#[command]
pub async fn torabo_read_caps(state: State<'_, ActiveConnection<'_>>) -> Result<Vec<u8>, String> {
    let chrc = caps_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read capabilities: {}", e.message()))
}
