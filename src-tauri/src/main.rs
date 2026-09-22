// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ytdlp;
mod fs;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .invoke_handler(tauri::generate_handler![
      ytdlp::probe::ytdlp_probe,
      ytdlp::probe::ytdlp_probe_playlist,
      ytdlp::search::ytdlp_search,
      ytdlp::binary::ytdlp_status,
      ytdlp::binary::ytdlp_ensure_binaries,
      fs::ytdlp_download,
      fs::ytdlp_cancel,
      fs::ytdlp_cleanup,
      fs::fs_get_downloads_path,
      fs::fs_open_path,
      fs::fs_select_folder,
      fs::fs_save_description,
      fs::fs_stat,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}