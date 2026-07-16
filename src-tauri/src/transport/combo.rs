//! Client for the torabo-tsuki dynamic-combo GATT service.
//!
//! Same approach as `dmac.rs`/`trackball.rs`: reuse the connected `bluest::Device`
//! and talk to our own service by UUID. READ returns ALL combo slots (Read Blob);
//! WRITE updates ONE combo (small enough for a single ATT write). The frontend
//! encodes/decodes the wire (`src/dynamic_combos/comboConfig.ts`).
//!
//! UUIDs match torabo-tsuki_ext_FW/combos/src/gatt_service.c:
//!   service e1f4ab00-1c2d-4b6e-9f3a-0a1b2c3d4e5f
//!   combos  e1f4ab01-1c2d-4b6e-9f3a-0a1b2c3d4e5f

use bluest::{Characteristic, Device};
use tauri::ipc::{InvokeBody, Request};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const CB_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4ab00_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const CB_COMBO_UUID: Uuid = Uuid::from_u128(0xe1f4ab01_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

async fn combo_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(CB_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover dynamic-combo service: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "Dynamic-combo service not found (firmware built without \
             CONFIG_ZMK_DYNAMIC_COMBOS_BLE?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(CB_COMBO_UUID)
        .await
        .map_err(|e| format!("Failed to discover dynamic-combo characteristic: {}", e.message()))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Dynamic-combo characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read all combo slots (full wire) from the keyboard.
#[command]
pub async fn combo_read_all(state: State<'_, ActiveConnection<'_>>) -> Result<Vec<u8>, String> {
    let chrc = combo_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read dynamic combos: {}", e.message()))
}

/// Write one combo (raw bytes: version, slot, 26-byte slot). Applies live + NVS.
#[command]
pub async fn combo_write_slot(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = combo_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        chrc.write(data.as_slice())
            .await
            .map_err(|e| format!("Failed to write dynamic combo slot: {}", e.message()))
    } else {
        Err("combo_write_slot expects a raw byte body".to_string())
    }
}
