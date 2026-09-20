//! Probe — replica exata de YtDlpProbe.ts (args + NDJSON parse).

use std::path::Path;
use tauri::AppHandle;

#[derive(serde::Deserialize)]
pub struct ProbeOptions {
    pub url: String,
    pub cookies: Option<String>,
    #[serde(rename = "cookiesFromBrowser")]
    pub cookies_from_browser: Option<String>,
    pub proxy: Option<String>,
}

async fn run_capture(bin: &Path, args: &[String]) -> Result<Vec<u8>, String> {
    let out = tokio::process::Command::new(bin)
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    Ok(out.stdout)
}

fn common_auth(
    args: &mut Vec<String>,
    cookies: &Option<String>,
    cfb: &Option<String>,
    proxy: &Option<String>,
) {
    if let Some(c) = cookies {
        args.push("--cookies".into());
        args.push(c.clone());
    }
    if let Some(c) = cfb {
        args.push("--cookies-from-browser".into());
        args.push(c.clone());
    }
    if let Some(p) = proxy {
        args.push("--proxy".into());
        args.push(p.clone());
    }
}

/// probeUrl — YtDlpProbe.ts:27-42. Retorna o JSON bruto; Providers.ts parseia no renderer.
#[tauri::command]
pub async fn ytdlp_probe(
    app: AppHandle,
    options: ProbeOptions,
) -> Result<serde_json::Value, String> {
    let bin = super::binary::ytdlp_path(&app)?;
    let mut args = vec!["--dump-json".into(), "--no-download".into()];
    common_auth(
        &mut args,
        &options.cookies,
        &options.cookies_from_browser,
        &options.proxy,
    );
    args.push(options.url);
    let stdout = run_capture(&bin, &args).await?;
    serde_json::from_slice(&stdout).map_err(|e| format!("probe: JSON inválido: {e}"))
}

#[derive(serde::Serialize)]
pub struct PlaylistResult {
    pub entries: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// probePlaylist — YtDlpProbe.ts:52-94, mesma regra NDJSON
/// (linha playlist: `_type == "playlist"` ou tem `playlist_count`).
#[tauri::command]
pub async fn ytdlp_probe_playlist(
    app: AppHandle,
    options: ProbeOptions,
) -> Result<PlaylistResult, String> {
    let bin = super::binary::ytdlp_path(&app)?;
    let mut args = vec![
        "--flat-playlist".into(),
        "--dump-json".into(),
        "--no-download".into(),
        "--ignore-errors".into(),
    ];
    common_auth(
        &mut args,
        &options.cookies,
        &options.cookies_from_browser,
        &options.proxy,
    );
    args.push(options.url);
    let stdout = run_capture(&bin, &args).await?;
    let text = String::from_utf8_lossy(&stdout);
    let mut entries = Vec::new();
    let mut count: Option<u64> = None;
    let mut title: Option<String> = None;
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let is_playlist = obj.get("_type").and_then(|v| v.as_str()) == Some("playlist")
            || obj.get("playlist_count").is_some();
        if is_playlist {
            if count.is_none() {
                count = obj.get("playlist_count").and_then(|v| v.as_u64());
            }
            if title.is_none() {
                title = obj
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_owned());
            }
        } else {
            entries.push(obj);
        }
    }
    if count.is_none() && !entries.is_empty() {
        count = Some(entries.len() as u64);
    }
    if title.is_none() {
        title = entries
            .first()
            .and_then(|e| e.get("playlist"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_owned());
    }
    Ok(PlaylistResult {
        entries,
        playlist_count: count,
        title,
    })
}
