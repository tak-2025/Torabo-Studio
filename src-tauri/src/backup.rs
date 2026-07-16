//! Plain file read/write for the torabo backup feature.
//!
//! The native Save/Open dialog (tauri-plugin-dialog) returns a path on the
//! frontend; these commands then do the actual disk I/O. Keeping the I/O in our
//! own commands avoids configuring tauri-plugin-fs scopes for arbitrary paths.
//!
//! Hardening (defense-in-depth): although in normal use the path always comes
//! from a native dialog the user picked, the IPC command itself could be invoked
//! with an attacker-chosen path if the (bundled, local-only) frontend were ever
//! compromised. To bound that, both commands reject anything that is not an
//! ABSOLUTE path with a `.json` extension — so they can never be used to
//! overwrite executables/DLLs/config or read arbitrary secret files. We do not
//! pin a single base directory on purpose: the user must be able to save/load
//! backups anywhere (Desktop, Documents, a USB drive, ...).

use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

const ALLOWED_EXTENSIONS: &[&str] = &["json"];

fn validate_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("絶対パスが必要です".into());
    }
    let ext_ok = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| ALLOWED_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    if !ext_ok {
        return Err("許可されていないファイル形式です（.json のみ）".into());
    }
    Ok(p.to_path_buf())
}

/// Write `contents` (UTF-8 JSON) to `path`, overwriting if it exists.
#[command]
pub fn backup_write(path: String, contents: String) -> Result<(), String> {
    let safe = validate_path(&path)?;
    fs::write(&safe, contents).map_err(|e| format!("ファイル書き込みに失敗: {e}"))
}

/// Read the whole file at `path` as a UTF-8 string.
#[command]
pub fn backup_read(path: String) -> Result<String, String> {
    let safe = validate_path(&path)?;
    fs::read_to_string(&safe).map_err(|e| format!("ファイル読み込みに失敗: {e}"))
}

// Read-only: source keymap files for the macro importer. Broader extension set
// than backup (which stays .json-only for writes), but still READ-ONLY and
// extension-bounded so it can't slurp arbitrary secret files.
const READ_TEXT_EXTENSIONS: &[&str] = &["keymap", "dtsi", "overlay", "conf", "txt", "json"];

fn validate_read_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("絶対パスが必要です".into());
    }
    let ext_ok = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| READ_TEXT_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    if !ext_ok {
        return Err("許可されていないファイル形式です（.keymap/.dtsi/.overlay/.conf/.txt）".into());
    }
    Ok(p.to_path_buf())
}

/// Read a source keymap-ish text file (for the macro importer).
#[command]
pub fn keymap_read(path: String) -> Result<String, String> {
    let safe = validate_read_path(&path)?;
    fs::read_to_string(&safe).map_err(|e| format!("ファイル読み込みに失敗: {e}"))
}
