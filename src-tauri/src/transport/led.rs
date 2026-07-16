//! Client for the torabo-tsuki custom LED rule-table GATT service.
//!
//! Mirrors trackpad.rs: reuse the already-connected `bluest::Device` (kept in
//! `ActiveConnection`) to read/write our own service by UUID, independent of
//! Studio's protobuf RPC. The characteristic carries the whole packed led wire
//! (torabo-tsuki_ext_FW led/include/zmk_led_config/config.h); the frontend
//! (src/led/encConfig.ts) encodes/decodes it.
//!
//! Unlike the trackpad the wire is tiny (72 B), so it always fits
//! in a single ATT write — no chunking, and the firmware rejects offset != 0.
//!
//! UUIDs match the firmware (allocated after trackball e1f4a900 / macros e1f4aa00 /
//! combos e1f4ab00 / trackpad e1f4ac00):
//!   service e1f4ad00-1c2d-4b6e-9f3a-0a1b2c3d4e5f
//!   config  e1f4ad01-1c2d-4b6e-9f3a-0a1b2c3d4e5f

use bluest::{Characteristic, Device};
use tauri::ipc::{InvokeBody, Request};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const LED_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4ae00_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const LED_CFG_UUID: Uuid = Uuid::from_u128(0xe1f4ae01_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

/// Clone the connected device out of shared state (without holding the lock across
/// BLE I/O), then discover our config characteristic on it.
async fn cfg_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(LED_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover led service: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "LED config service not found (firmware built without the \
             led module, or no led on this keyboard?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(LED_CFG_UUID)
        .await
        .map_err(|e| format!("Failed to discover led characteristic: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| "LED config characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read the current led config blob from the keyboard.
#[command]
pub async fn led_read_config(
    state: State<'_, ActiveConnection<'_>>,
) -> Result<Vec<u8>, String> {
    let chrc = cfg_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read led config: {}", e.message()))
}

/// Write a new led config blob (raw bytes). Applies live + persists to NVS.
#[command]
pub async fn led_write_config(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = cfg_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        // Fits in one ATT write; the firmware rejects a fragmented write outright.
        chrc.write(data.as_slice())
            .await
            .map_err(|e| format!("Failed to write led config: {}", e.message()))
    } else {
        Err("led_write_config expects a raw byte body".to_string())
    }
}
