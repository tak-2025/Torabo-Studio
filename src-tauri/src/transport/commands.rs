use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

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

#[derive(Default)]
pub struct ActiveConnection<'a> {
    pub conn: Mutex<Option<Box<dyn Sink<Vec<u8>, Error = SendError> + Unpin + Send + 'a>>>,
    // Kept alive so a second, independent GATT service (e.g. the trackball
    // config service) can be read/written on the same connected device without
    // touching the RPC transport above.
    pub device: Mutex<Option<Device>>,
    /// Which link owns `conn`/`device` right now.
    ///
    /// Everything here used to be a singleton with no identity: both transports
    /// emitted the same global `connection_data` / `connection_disconnected`
    /// events, and `transport_close` cleared whatever happened to be open. So a
    /// link that had already been replaced — the previous device, the previous
    /// transport, a connection attempt that failed — could tear down the live
    /// one as it wound down. The window is real: `connect` installs the new sink
    /// and only then does the old pump notice its sender was dropped, so its
    /// disconnect can land AFTER the new transport has started listening.
    ///
    /// Every link now carries the id it was opened with, and anything acting on
    /// behalf of an older one is ignored.
    pub generation: AtomicU64,
    /// The tasks that own this link's OS handle — the serial port halves, the
    /// GATT notification subscription.
    ///
    /// Dropping the sink ends them eventually, but only eventually, and the
    /// handle is released when the last of them drops. Reopening the same COM
    /// port in that window fails with "access is denied", which is what made a
    /// wedged link poison every later connection — including to a different
    /// keyboard. `begin` waits for them so the release is actually done.
    pub tasks: Mutex<Vec<tauri::async_runtime::JoinHandle<()>>>,
}

impl ActiveConnection<'_> {
    /// Claim the connection slot for a new link and return its id.
    ///
    /// Closes whatever was open first, so the previous pump winds down against
    /// its own (now stale) id rather than racing the link replacing it.
    pub async fn begin(&self) -> u64 {
        *self.conn.lock().await = None;
        *self.device.lock().await = None;

        // Wait for the previous link's tasks to actually finish: they hold the
        // reader/writer halves (serial) or the notification stream (GATT), and
        // the OS handle is only freed once they drop.
        //
        // Let them END rather than aborting them. Dropping the sink above closes
        // the pump's channel, so it exits on its own and runs the teardown that
        // releases the other half. abort() cancels the task at its await point
        // and SKIPS that teardown — which left the reader holding the COM port
        // and made the next connect fail with "access is denied". Abort is only
        // the fallback for a pump that is itself stuck.
        let mut tasks = self.tasks.lock().await;
        for mut t in tasks.drain(..) {
            if async_std::future::timeout(Duration::from_millis(1500), &mut t)
                .await
                .is_err()
            {
                t.abort();
                let _ = t.await;
            }
        }

        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Record a task that holds this link's OS handle, so `begin` can wait it out.
    pub async fn track(&self, task: tauri::async_runtime::JoinHandle<()>) {
        self.tasks.lock().await.push(task);
    }

    /// True when `id` is the link currently installed.
    pub fn is_current(&self, id: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == id
    }
}

#[command]
pub async fn transport_send_data(
    req: Request<'_>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), String> {
    if let InvokeBody::Raw(data) = req.body() {
        let mut lock = state.conn.lock().await;

        // Previously `lock.as_mut().unwrap()`, which panics the command when the
        // slot is empty — and the slot goes empty on every disconnect, including
        // one caused by another link being torn down. A write after the link is
        // gone is an ordinary error, not a crash.
        let sink = lock
            .as_mut()
            .ok_or_else(|| "No active connection".to_string())?;

        sink.send(data.clone())
            .await
            .map_err(|e| format!("Failed to send on the active connection: {}", e))?;
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

/// Close the link `id` opened.
///
/// `id` is what `gatt_connect` / `serial_connect` returned. A transport that has
/// already been superseded must not close the link that replaced it, so a stale
/// id is a no-op. `None` keeps the old unconditional behaviour for any caller
/// that has no id to give.
#[command]
pub async fn transport_close(
    id: Option<u64>,
    state: State<'_, ActiveConnection<'_>>,
) -> Result<(), ()> {
    if let Some(id) = id {
        if !state.is_current(id) {
            return Ok(());
        }
    }

    *state.conn.lock().await = None;
    *state.device.lock().await = None;

    Ok(())
}
