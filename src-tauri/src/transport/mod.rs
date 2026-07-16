pub mod caps;
pub mod combo;
pub mod commands;
pub mod dmac;
pub mod encoder;
pub mod gatt;
pub mod led;
pub mod serial;
pub mod trackball;
pub mod trackpad;

use bluest::Characteristic;

/// Conservative single-write payload used when the OS/driver can't report a
/// per-characteristic max write length. 180 stays safely under any negotiated
/// ATT MTU-3 while keeping the chunk count low for our multi-hundred-byte configs.
const WRITE_CHUNK_FALLBACK: usize = 180;

/// Write `data` to `chrc` as one or more response-serialized ATT writes.
///
/// bluest's `Characteristic::write()` maps to a SINGLE ATT write; on Windows/WinRT
/// it does NOT reliably promote a payload larger than the negotiated MTU into an
/// ATT Write Long, so a multi-hundred-byte config would silently fail to land. We
/// therefore chunk at the application level: split the payload into
/// `max_write_len()`-sized pieces and send them in order, each WITH a response. The
/// write-response round-trip serializes the chunks (correct ordering + flow
/// control), so no artificial delays are needed. The firmware reassembles these
/// plain chunks — see torabo-tsuki_ext_FW trackpad/src/gatt_service.c.
///
/// On Windows `max_write_len()` returns the negotiated ATT MTU minus 3 bytes of
/// per-write overhead; if it is unavailable or returns 0 we fall back to
/// [`WRITE_CHUNK_FALLBACK`].
pub(crate) async fn write_chunked(chrc: &Characteristic, data: &[u8]) -> Result<(), String> {
    let chunk = match chrc.max_write_len() {
        Ok(n) if n > 0 => n,
        _ => WRITE_CHUNK_FALLBACK,
    };

    if data.len() <= chunk {
        return chrc
            .write(data)
            .await
            .map_err(|e| format!("Failed to write config: {}", e.message()));
    }

    let total = (data.len() + chunk - 1) / chunk;
    for (i, part) in data.chunks(chunk).enumerate() {
        chrc.write(part).await.map_err(|e| {
            format!(
                "Failed to write config chunk {}/{} ({} bytes at offset {}): {}",
                i + 1,
                total,
                part.len(),
                i * chunk,
                e.message()
            )
        })?;
    }
    Ok(())
}
