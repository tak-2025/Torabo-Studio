//! Client for the torabo-tsuki custom trackpad-config GATT service.
//!
//! Mirrors trackball.rs: it reuses the already-connected `bluest::Device` (kept
//! in `ActiveConnection`) to read/write our own service by UUID, independent of
//! Studio's protobuf RPC. The characteristic carries the whole packed trackpad
//! wire (see torabo-tsuki_ext_FW docs/DESIGN-trackpad.md §3); the frontend
//! (src/trackpad/tpConfig.ts) encodes/decodes it.
//!
//! UUIDs match the firmware's trackpad GATT service (allocated after trackball
//! e1f4a900 / macros e1f4aa00 / combos e1f4ab00):
//!   service e1f4ac00-1c2d-4b6e-9f3a-0a1b2c3d4e5f
//!   config  e1f4ac01-1c2d-4b6e-9f3a-0a1b2c3d4e5f

use bluest::{Characteristic, Device};
use tauri::ipc::{InvokeBody, Request};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const TP_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4ac00_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const TP_CFG_UUID: Uuid = Uuid::from_u128(0xe1f4ac01_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

/// Clone the connected device out of shared state (without holding the lock
/// across BLE I/O), then discover our config characteristic on it.
async fn cfg_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(TP_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover trackpad service: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "Trackpad config service not found (firmware built without the \
             trackpad-config module?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(TP_CFG_UUID)
        .await
        .map_err(|e| format!("Failed to discover trackpad characteristic: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Trackpad config characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read the current trackpad config blob from the keyboard.
#[command]
pub async fn trackpad_read_config(
    state: State<'_, ActiveConnection<'_>>,
) -> Result<Vec<u8>, String> {
    let chrc = cfg_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read trackpad config: {}", e.message()))
}

/// Write a new trackpad config blob (raw bytes). Applies live + persists to NVS.
#[command]
pub async fn trackpad_write_config(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = cfg_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        // The v2 wire can exceed one ATT MTU. bluest's write() is a single ATT
        // write and Windows/WinRT does not reliably turn an oversized payload into
        // an ATT Write Long, so chunk it at the application level (see
        // super::write_chunked). Small configs still go out as one write.
        super::write_chunked(&chrc, data.as_slice()).await
    } else {
        Err("trackpad_write_config expects a raw byte body".to_string())
    }
}
