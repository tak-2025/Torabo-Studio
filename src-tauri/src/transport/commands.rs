use futures::lock::Mutex;
use futures::Sink;
use futures::SinkExt;

use futures::channel::mpsc::SendError;

use serde::{Deserialize, Serialize};

use bluest::Device;

use tauri::ipc::InvokeBody;
use tauri::{
    command,
    ipc::{Request},
    State,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct AvailableDevice {
    pub label: String,
    pub id: String,
}

#[derive(Debug, Default)]
pub struct ActiveConnection<'a> {
    pub conn: Mutex<Option<Box<dyn Sink<Vec<u8>, Error = SendError> + Unpin + Send + 'a>>>,
    // Kept alive so a second, independent GATT service (e.g. the trackball
    // config service) can be read/written on the same connected device without
    // touching the RPC transport above.
    pub device: Mutex<Option<Device>>,
}

#[command]
pub async fn transport_send_data(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), ()> {
    if let InvokeBody::Raw(data) = req.body() {
        let mut lock = state.conn.lock().await;

        let sink = lock.as_mut().unwrap();
        sink.send(data.clone()).await;
    }

    Ok(())
}

/// Whether a BLE device handle is being held for this connection.
///
/// Only `gatt_connect` stores one; `serial_connect` leaves it `None`, because a
/// CDC-ACM cable has no GATT to reach. That difference is exactly what the
/// frontend needs and could not previously see: it assumed the desktop build
/// could always read the torabo config services, so a USB connection offered
/// every settings tab and then failed each one with "No active BLE connection".
///
/// Firmware with the RPC tunnel makes the question moot — the tunnel backend
/// registers itself and works over the cable — so this only decides what a
/// desktop USB connection to PRE-TUNNEL firmware is allowed to show.
#[command]
pub async fn transport_has_device(
    state: State<'_, ActiveConnection<'_>>,
) -> Result<bool, ()> {
    Ok(state.device.lock().await.is_some())
}

#[command]
pub async fn transport_close(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), ()> {
    *state.conn.lock().await = None;
    *state.device.lock().await = None;

    Ok(())
}
