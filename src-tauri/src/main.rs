// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;

use futures::lock::Mutex;

mod backup;
mod transport;
use backup::{backup_read, backup_write, keymap_read};
use transport::commands::{transport_close, transport_send_data, ActiveConnection};

use transport::gatt::{gatt_connect, gatt_list_devices};
use transport::serial::{serial_connect, serial_list_devices};
use transport::trackball::{trackball_read_config, trackball_write_config};
use transport::caps::torabo_read_caps;
use transport::encoder::{encoder_read_config, encoder_write_config};
use transport::led::{led_read_config, led_write_config};
use transport::trackpad::{trackpad_read_config, trackpad_write_config};
use transport::dmac::{dmac_read_all, dmac_write_slot};
use transport::combo::{combo_read_all, combo_write_slot};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ActiveConnection {
            conn: Mutex::new(None),
            device: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            transport_send_data,
            transport_close,
            gatt_list_devices,
            gatt_connect,
            serial_list_devices,
            serial_connect,
            trackball_read_config,
            trackball_write_config,
            trackpad_read_config,
            trackpad_write_config,
            encoder_read_config,
            encoder_write_config,
            led_read_config,
            led_write_config,
            torabo_read_caps,
            dmac_read_all,
            dmac_write_slot,
            combo_read_all,
            combo_write_slot,
            backup_write,
            backup_read,
            keymap_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
