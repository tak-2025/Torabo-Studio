//! Client for the torabo-tsuki custom encoder-config GATT service.
//!
//! Mirrors trackpad.rs: reuse the already-connected `bluest::Device` (kept in
//! `ActiveConnection`) to read/write our own service by UUID, independent of
//! Studio's protobuf RPC. The characteristic carries the whole packed encoder wire
//! (torabo-tsuki_ext_FW encoder/include/zmk_encoder_config/config.h); the frontend
//! (src/encoder/encConfig.ts) encodes/decodes it.
//!
//! The wire is 4 + layers*12 bytes, which passes one ATT MTU as the layer count
//! grows (20 layers = 244 B, and the negotiated MTU-3 is smaller than that on
//! plenty of links). bluest's `write()` is a SINGLE ATT write and Windows/WinRT
//! does not reliably promote an oversized payload into an ATT Write Long, so
//! writes go through `super::write_chunked` exactly as trackpad and timing
//! already do. The firmware reassembles those consecutive offset==0 chunks:
//! the torabo-tsuki_ext_FW change that moved this service's write handler onto
//! the shared `torabo_wire_asm` chunk-reassembly buffer and added
//! BT_GATT_PERM_PREPARE_WRITE to the attribute. That same change brought the
//! client-driven windowed READ, which the caps header advertises as
//! TORABO_CAPS_HDR_WINDOW_READ (`_rsv` byte 7, bit2 = 0x04) — so the bit is the
//! stable way to ask whether this firmware reassembles chunks, and older
//! firmware without it fails a split write's second chunk with
//! BT_ATT_ERR_INVALID_OFFSET. Nothing else changed with it — same GATT layout,
//! same wire bytes, same length rules, same exact-length apply check.
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

const ENC_SVC_UUID: Uuid = Uuid::from_u128(0xe1f4ad00_1c2d_4b6e_9f3a_0a1b2c3d4e5f);
const ENC_CFG_UUID: Uuid = Uuid::from_u128(0xe1f4ad01_1c2d_4b6e_9f3a_0a1b2c3d4e5f);

/// Clone the connected device out of shared state (without holding the lock across
/// BLE I/O), then discover our config characteristic on it.
async fn cfg_characteristic(state: &ActiveConnection<'_>) -> Result<Characteristic, String> {
    let device: Option<Device> = state.device.lock().await.as_ref().cloned();
    let device = device.ok_or_else(|| "No active BLE connection".to_string())?;

    let service = device
        .discover_services_with_uuid(ENC_SVC_UUID)
        .await
        .map_err(|e| format!("Failed to discover encoder service: {}", super::err_text(&e)))?
        .get(0)
        .cloned()
        .ok_or_else(|| {
            "Encoder config service not found (firmware built without the \
             encoder module, or no encoder on this keyboard?)"
                .to_string()
        })?;

    let chrc = service
        .discover_characteristics_with_uuid(ENC_CFG_UUID)
        .await
        .map_err(|e| format!("Failed to discover encoder characteristic: {}", super::err_text(&e)))?
        .get(0)
        .cloned()
        .ok_or_else(|| "Encoder config characteristic not found".to_string())?;

    Ok(chrc)
}

/// Read the current encoder config blob from the keyboard.
#[command]
pub async fn encoder_read_config(
    state: State<'_, ActiveConnection<'_>>,
) -> Result<Vec<u8>, String> {
    let chrc = cfg_characteristic(&state).await?;
    chrc.read()
        .await
        .map_err(|e| format!("Failed to read encoder config: {}", super::err_text(&e)))
}

/// Write a new encoder config blob (raw bytes). Applies live + persists to NVS.
#[command]
pub async fn encoder_write_config(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    let chrc = cfg_characteristic(&state).await?;
    if let InvokeBody::Raw(data) = req.body() {
        // May exceed the negotiated ATT MTU-3 once enough layers are in play, so
        // chunk it the same way trackpad does (see super::write_chunked); the
        // firmware reassembles either way once it advertises the caps-header
        // WINDOW_READ bit (see the module doc).
        super::write_chunked(&chrc, data.as_slice()).await
    } else {
        Err("encoder_write_config expects a raw byte body".to_string())
    }
}
