//! Client for the torabo-tsuki custom trackball-config GATT service.
//!
//! Independent of Studio's protobuf RPC: it reuses the already-connected
//! `bluest::Device` (kept in `ActiveConnection`) to read/write our own service
//! by UUID. The characteristic carries the whole `struct ztc_config` blob; the
//! frontend encodes/decodes it.
//!
//! The wire is 8 + layers*12 bytes, so at 20 layers it is 248 B — past any ATT
//! MTU this link negotiates. bluest's `write()` is a SINGLE ATT write and
//! Windows/WinRT does not reliably promote an oversized payload into an ATT
//! Write Long, so writes go through `super::write_chunked` exactly as trackpad
//! and timing already do. The firmware reassembles those consecutive offset==0
//! chunks: the torabo-tsuki_ext_FW change that moved this service's write
//! handler onto the shared `torabo_wire_asm` chunk-reassembly buffer and added
//! BT_GATT_PERM_PREPARE_WRITE to the attribute. That same change brought the
//! client-driven windowed READ, which the caps header advertises as
//! TORABO_CAPS_HDR_WINDOW_READ (`_rsv` byte 7, bit2 = 0x04) — so the bit is
//! the stable way to ask whether this firmware reassembles chunks, and older
//! firmware without it fails a split write's second chunk with
//! BT_ATT_ERR_INVALID_OFFSET. Nothing else changed with it — same GATT layout,
//! same wire bytes, same length rules, same exact-length apply check.
//!
//! UUIDs match zmk-feature-trackball-config/src/gatt_service.c:
//!   service e1f4a900-1c2d-4b6e-9f3a-0a1b2c3d4e5f
//!   config  e1f4a901-1c2d-4b6e-9f3a-0a1b2c3d4e5f

use bluest::{Characteristic, Device};
use tauri::ipc::{InvokeBody, Request};
use tauri::{command, State};
use uuid::Uuid;

use super::commands::ActiveConnection;

const TB_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4a900_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const TB_CFG_UUID: Uuid = Uuid::from_u128(0xe1f4a901_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

/// Clone the connected device out of shared state (without holding the lock
/// across BLE I/O), then discover our config characteristic on it.
async fn cfg_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(TB_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover trackball service: {}", super::err_text(&e)))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "Trackball config service not found (firmware built without \
             CONFIG_ZMK_TRACKBALL_CONFIG_BLE?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(TB_CFG_UUID)
        .await
        .map_err(|e| format!("Failed to discover trackball characteristic: {}", super::err_text(&e)))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Trackball config characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read the current config blob from the keyboard.
#[command]
pub async fn trackball_read_config(
    state: State<'_, ActiveConnection<'_>>,
) -> Result<Vec<u8>, String> {
    let chrc = cfg_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read trackball config: {}", super::err_text(&e)))
}

/// Write a new config blob (raw bytes). Applies live + persists to NVS on the FW.
#[command]
pub async fn trackball_write_config(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = cfg_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        // The wire grows with the layer count and passes one ATT MTU well
        // before the layer cap, so chunk it the same way trackpad does (see
        // super::write_chunked); the firmware reassembles either way once it
        // advertises the caps-header WINDOW_READ bit (see the module doc).
        // Small configs still go out as one write.
        super::write_chunked(&chrc, data.as_slice()).await
    } else {
        Err("trackball_write_config expects a raw byte body".to_string())
    }
}
