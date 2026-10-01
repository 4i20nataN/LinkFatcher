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
  // [AFETA-DESKTOP] Aceleração de hardware do WebView (Linux/WebKitGTK):
  // o WebKitGTK 2.42+ compõe na GPU por padrão (DMA-BUF), mas DUAS vars de
  // ambiente forçam raster por software e anulam isso — herdadas de sessão,
  // IDE ou launch script, elas explicam "60fps que nunca chega" mesmo com
  // GPU livre. Remove-as do NOSSO processo antes do wry criar o WebView
  // (leitura ocorre na criação do contexto; aqui ainda é cedo). WebView2
  // (Windows) já é GPU por padrão — nada a fazer lá. Se o driver não tiver
  // GL (VM, NVIDIA+X11 legado), o fallback continua sendo o perfil
  // 'efficient' do frontend (renderProfile.ts) — sem placebo: sem GPU real,
  // sem 60fps grátis. Mitigação desktop: zero efeito funcional, só remove
  // veto de composição; loga o que fez via eprintln.
  #[cfg(target_os = "linux")]
  {
    for var in ["WEBKIT_DISABLE_COMPOSITING_MODE", "LIBGL_ALWAYS_SOFTWARE"] {
      if std::env::var_os(var).is_some() {
        std::env::remove_var(var);
        eprintln!("[hw-accel] removido veto de software: {var}=* (GPU liberada)");
      }
    }
  }

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
      fs::ytdlp_job_state,
      fs::fs_get_downloads_path,
      fs::fs_open_path,
      fs::fs_select_folder,
      fs::fs_save_description,
      fs::fs_fetch_cover,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
