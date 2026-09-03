use blocking::unblock;
use futures::channel::mpsc::channel;
use futures::StreamExt;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_serial::{available_ports, SerialPortBuilderExt, SerialPortType};

use tauri::{command, AppHandle, State};
use tauri_plugin_cli::CliExt;

const READ_BUF_SIZE: usize = 1024;

#[command]
pub async fn serial_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<u64, String> {
    // Close the previous link BEFORE touching the port. It may be holding this
    // very port (a reconnect after a wedged session is the common case), and
    // opening it while it is still owned fails with "access is denied" — the
    // error that made one bad session poison every later connection, to this
    // keyboard and to any other. `begin` also waits for the old tasks to drop
    // their half of the port, so the handle is genuinely released here.
    let generation = state.begin().await;

    match open_port_with_retry(&id) {
        #[allow(unused_mut)] // `mut` is only needed on unix, below
        Ok(mut port) => {
            #[cfg(unix)]
            port.set_exclusive(false)
                .expect("Unable to set serial port exclusive to false");

            let (mut reader, mut writer) = tokio::io::split(port);

            // Every event below is addressed to this link's id, so a listener
            // attached to an older link never sees this one's traffic.
            let data_event = format!("connection_data:{}", generation);
            let gone_event = format!("connection_disconnected:{}", generation);

            let ahc = app_handle.clone();
            let (send, mut recv) = channel(5);
            *state.conn.lock().await = Some(Box::new(send));

            let read_process = tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                use tauri::Manager;

                let mut buffer = vec![0; READ_BUF_SIZE];
                while let Ok(size) = reader.read(&mut buffer).await {
                    if size > 0 {
                        let _ = app_handle.emit(&data_event, &buffer[..size]);
                    } else {
                        break;
                    }
                }

                // Only clear the slot if it is still ours; a newer link may have
                // taken it while this reader was draining.
                let state = app_handle.state::<super::commands::ActiveConnection>();
                if state.is_current(generation) {
                    *state.conn.lock().await = None;
                }

                let _ = app_handle.emit(&gone_event, ());
            });

            let write_process = tauri::async_runtime::spawn(async move {
                use tauri::Manager;

                while let Some(data) = recv.next().await {
                    let _res = writer.write(&data).await;
                }

                // Await the reader after aborting it: the port's read half is
                // only released when that task is actually gone, and the next
                // connect waits on THIS task to know the port is free.
                read_process.abort();
                let _ = read_process.await;

                let state = ahc.state::<super::commands::ActiveConnection>();
                if state.is_current(generation) {
                    *state.conn.lock().await = None;
                }
            });

            // The writer owns the reader's handle and aborts it on the way out,
            // so waiting on the writer covers both halves. The OS can still lag
            // behind the drop, which is what open_port_with_retry absorbs.
            state.track(write_process).await;

            Ok(generation)
        }
        Err(e) => Err(format!("Failed to open the serial port: {}", e)),
    }
}

/// Open the port, retrying briefly on failure.
///
/// Even after the previous owner's handles are dropped, Windows can take a
/// moment to make a CDC port openable again, and the retry is cheaper than
/// telling the user to unplug the keyboard.
fn open_port_with_retry(id: &str) -> Result<tokio_serial::SerialStream, String> {
    let mut last = String::new();
    for attempt in 0..5 {
        match tokio_serial::new(id, 9600).open_native_async() {
            Ok(port) => return Ok(port),
            Err(e) => {
                last = e.description.clone();
                if attempt < 4 {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
            }
        }
    }
    Err(last)
}

#[command]
pub async fn serial_list_devices(app_handle: AppHandle) -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let ports = unblock(|| available_ports()).await.unwrap();

    let mut candidates = ports
        .into_iter()
        .filter_map(|pi| {
            if let SerialPortType::UsbPort(u) = pi.port_type {
                Some(super::commands::AvailableDevice {
                    id: pi.port_name,
                    label: u.product.unwrap_or("Unnamed device".to_string()),
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    match app_handle.cli().matches() {
        Ok(m) => {
            if let Some(p) = m.args.get("serial-port") {
                if let serde_json::Value::String(path) = &p.value {
                    candidates.push(super::commands::AvailableDevice {
                        id: path.to_string(),
                        label: format!("CLI Port: {path}").to_string(),
                    })
                }
            }
        },
        Err(_) => {},
    }

    Ok(candidates)
}
