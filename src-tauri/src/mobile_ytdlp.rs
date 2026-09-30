//! Ponte mobile: registra o plugin Kotlin `YtDlpPlugin` (yt-dlp embarcado
//! via youtubedl-android) sob o nome `ytdlp` e oferece os mesmos comandos do
//! backend desktop, encaminhando cada chamada ao Kotlin com
//! `run_mobile_plugin`. Só compila no Android; no desktop este módulo é vazio.

#[cfg(target_os = "android")]
mod inner {
    use serde::de::DeserializeOwned;
    use serde::Serialize;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        AppHandle, Manager, Runtime,
    };

    /// Handle do plugin Kotlin, guardado no estado do app no `setup`.
    pub struct MobileYtdlp<R: Runtime>(pub PluginHandle<R>);

    /// Plugin Tauri `ytdlp`: no setup registra a classe Kotlin no
    /// PluginManager (é o que torna `plugin:ytdlp|*` e `run_mobile_plugin`
    /// funcionais — sem isso o JS cai no fallback desktop que não existe).
    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("ytdlp")
            .setup(|app, api| {
                let handle = api
                    .register_android_plugin("com.linkfetcher.app", "YtDlpPlugin")
                    .map_err(|e| Box::new(std::io::Error::other(e.to_string())) as Box<dyn std::error::Error>)?;
                app.manage(MobileYtdlp(handle));
                Ok(())
            })
            .build()
    }

    /// Chamada assíncrona a um comando do `YtDlpPlugin` Kotlin.
    pub async fn call_mobile<R: Runtime, T: DeserializeOwned>(
        app: &AppHandle<R>,
        command: &str,
        payload: impl Serialize,
    ) -> Result<T, String> {
        let state = app
            .try_state::<MobileYtdlp<R>>()
            .ok_or_else(|| "plugin ytdlp não registrado".to_string())?;
        state
            .0
            .run_mobile_plugin_async(command, payload)
            .await
            .map_err(|e| e.to_string())
    }

    /// `invoke.resolve` do Kotlin só aceita `JSObject`: os comandos que
    /// retornam escalar respondem com envelope (`{dir}`, `{success}`).
    #[derive(serde::Deserialize)]
    struct DirResult {
        dir: String,
    }

    #[derive(serde::Deserialize)]
    struct SuccessResult {
        success: bool,
    }

    /// Pasta de downloads do app (Kotlin `getDownloadsDir`).
    pub async fn downloads_dir<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, String> {
        let r: DirResult = call_mobile(app, "getDownloadsDir", &serde_json::json!({})).await?;
        Ok(std::path::PathBuf::from(r.dir))
    }

    /// Mata o processo no yt-dlp embarcado; `true` = havia processo ativo.
    pub async fn cancel_mobile<R: Runtime>(
        app: &AppHandle<R>,
        id: &str,
        cleanup: bool,
    ) -> Result<bool, String> {
        let r: SuccessResult = call_mobile(
            app,
            "cancel",
            &serde_json::json!({ "id": id, "cleanup": cleanup }),
        )
        .await?;
        Ok(r.success)
    }
}

#[cfg(target_os = "android")]
pub use inner::{call_mobile, cancel_mobile, downloads_dir, init};
