// No Android, todo o backend desktop (binários, spawn, cortes ffmpeg) é
// desligado por `cfg(target_os)` — o rustc acusa ~60 `dead_code` que não são
// problema: o código segue vivo e verificado no target desktop. O allow vale
// SÓ para o target android; `cargo check`/`clippy` de desktop continuam
// acusando dead code real normalmente.
#![cfg_attr(target_os = "android", allow(dead_code))]

mod ytdlp;
mod fs;
#[cfg(target_os = "android")]
mod mobile_ytdlp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
  }

  #[cfg(target_os = "android")]
  {
    builder = builder.plugin(mobile_ytdlp::init());
  }

  builder
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
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
      fs::fs_fetch_cover,
      fs::fs_stat,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
