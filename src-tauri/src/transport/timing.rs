//! Client for the torabo-tsuki custom timing-config GATT service.
//!
//! Mirrors encoder.rs: reuse the already-connected `bluest::Device` (kept in
//! `ActiveConnection`) to read/write our own service by UUID, independent of
//! Studio's protobuf RPC. The characteristic carries the whole 96-byte packed
//! timing wire (torabo-tsuki_ext_FW timing/include/zmk_timing_config/config.h,
//! see docs/DESIGN-timing.md); the frontend (src/timing/timingConfig.ts)
//! encodes/decodes it.
//!
//! The wire is fixed at 96 bytes. That fits in a single ATT write only once the
//! MTU has been negotiated up past 99 bytes; on the default 23-byte MTU (or on
//! Windows/WinRT, which does not reliably promote an oversized payload into an
//! ATT Write Long — see write_chunked in mod.rs) a single `chrc.write()` of the
//! full blob can fail. The firmware's write handler reassembles consecutive
//! offset==0 chunks for this service exactly like it does for trackpad (see
//! torabo-tsuki_ext_FW timing/src/gatt_service.c), so writes go through
//! write_chunked too.
//!
//! UUIDs match the firmware (allocated after led e1f4ae00):
//!   service e1f4b000-1c2d-4b6e-9f3a-0a1b2c3d4e5f
//!   config  e1f4b001-1c2d-4b6e-9f3a-0a1b2c3d4e5f

use bluest::{Characteristic, Device};
use tauri::ipc::{InvokeBody, Request};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const TMG_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4b000_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const TMG_CFG_UUID: Uuid = Uuid::from_u128(0xe1f4b001_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

/// Clone the connected device out of shared state (without holding the lock across
/// BLE I/O), then discover our config characteristic on it.
async fn cfg_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(TMG_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover timing service: {}", super::err_text(&e)))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "Timing config service not found (firmware built without the \
             timing module?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(TMG_CFG_UUID)
        .await
        .map_err(|e| format!("Failed to discover timing characteristic: {}", super::err_text(&e)))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Timing config characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read the current timing config blob from the keyboard.
#[command]
pub async fn timing_read_config(
    state: State<'_, ActiveConnection<'_>>,
) -> Result<Vec<u8>, String> {
    let chrc = cfg_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read timing config: {}", super::err_text(&e)))
}

/// Write a new timing config blob (raw bytes, 96B). Applies live + persists to NVS.
#[command]
pub async fn timing_write_config(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = cfg_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        // The 96-byte wire can exceed the negotiated ATT MTU-3 (e.g. the default
        // 23-byte MTU, or Windows/WinRT not promoting to a Write Long), so chunk
        // it the same way trackpad does; the firmware reassembles either way.
        super::write_chunked(&chrc, data.as_slice()).await
    } else {
        Err("timing_write_config expects a raw byte body".to_string())
    }
}
