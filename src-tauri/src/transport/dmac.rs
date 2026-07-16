//! Client for the torabo-tsuki dynamic-macro GATT service.
//!
//! Same approach as `trackball.rs`: reuse the connected `bluest::Device` and
//! talk to our own service by UUID. READ returns ALL macro slots (Read Blob);
//! WRITE updates ONE slot (small enough for a single ATT write). The frontend
//! encodes/decodes the wire (`src/dynamic_macros/dmacConfig.ts`).
//!
//! UUIDs match zmk-feature-dynamic-keymap/src/gatt_service.c:
//!   service e1f4aa00-1c2d-4b6e-9f3a-0a1b2c3d4e5f
//!   macros  e1f4aa01-1c2d-4b6e-9f3a-0a1b2c3d4e5f

use bluest::{Characteristic, Device};
use tauri::ipc::{InvokeBody, Request};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const DM_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4aa00_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const DM_MACRO_UUID: Uuid = Uuid::from_u128(0xe1f4aa01_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

async fn macro_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(DM_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover dynamic-macro service: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "Dynamic-macro service not found (firmware built without \
             CONFIG_ZMK_DYNAMIC_KEYMAP_BLE?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(DM_MACRO_UUID)
        .await
        .map_err(|e| format!("Failed to discover dynamic-macro characteristic: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Dynamic-macro characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read all macro slots (full wire) from the keyboard.
#[command]
pub async fn dmac_read_all(state: State<'_, ActiveConnection<'_>>) -> Result<Vec<u8>, String> {
    let chrc = macro_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read dynamic macros: {}", e.message()))
}

/// Write one slot (raw bytes: version, slot, len, steps). Applies live + NVS.
#[command]
pub async fn dmac_write_slot(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = macro_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        chrc.write(data.as_slice())
            .await
            .map_err(|e| format!("Failed to write dynamic macro slot: {}", e.message()))
    } else {
        Err("dmac_write_slot expects a raw byte body".to_string())
    }
}
