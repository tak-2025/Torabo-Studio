pub mod caps;
pub mod combo;
pub mod commands;
pub mod dmac;
pub mod encoder;
pub mod gatt;
pub mod led;
pub mod serial;
pub mod timing;
pub mod trackball;
pub mod trackpad;

use bluest::{Characteristic, Error};

/// Describe a bluest error well enough to act on it.
///
/// `Error::message()` is frequently the EMPTY STRING on Windows/WinRT: the
/// underlying HRESULT carries no text and bluest passes that straight through.
/// Every message in this module was built from `message()` alone, so a save
/// that failed mid-transfer surfaced as
/// "Failed to write config chunk 5/5 (104 bytes at offset 976): " — nothing
/// after the colon, in the one place a reason was needed.
///
/// `ErrorKind` is always present and is the part that actually distinguishes
/// the faults worth telling apart here ("the Bluetooth device isn't
/// connected" — the link dropped — from "protocol error: ..." — the firmware
/// rejected the write, with the ATT code named). Its `Display` already spells
/// all of them out, including the ATT error inside `Protocol`, so it leads;
/// the message and the underlying OS error are appended only when they have
/// something to add. The result is never empty.
pub(crate) fn err_text(e: &Error) -> String {
    use std::error::Error as _;

    let kind = e.kind().to_string();
    let msg = e.message().trim().to_string();
    let source = e.source().map(|s| s.to_string()).unwrap_or_default();

    match (msg.is_empty(), source.is_empty()) {
        (true, true) => kind,
        (false, true) => format!("{}: {}", kind, msg),
        (true, false) => format!("{} ({})", kind, source),
        (false, false) => format!("{}: {} ({})", kind, msg, source),
    }
}

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
            .map_err(|e| format!("Failed to write config: {}", err_text(&e)));
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
                err_text(&e)
            )
        })?;
    }
    Ok(())
}
