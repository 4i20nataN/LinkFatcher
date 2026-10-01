//! utilitários de filesystem e download para o Tauri.
//! Todos os comandos Tauri estão aqui para evitar conflitos de namespace
//! com o macro `generate_handler!`.

use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::SystemTime;
use tokio::process::Child;
#[cfg(not(target_os = "android"))]
use tokio::io::AsyncReadExt;

use tauri::AppHandle;
#[cfg(not(target_os = "android"))]
use tauri::{Emitter, Manager};

/// Maps download id → child process (kill on cancel).
type CancelMap = std::collections::HashMap<String, std::sync::Arc<tokio::sync::Mutex<Child>>>;

/// Global cancel map (shared state across commands) - LazyLock para static init.
static CANCEL_MAP: LazyLock<std::sync::Mutex<CancelMap>> = LazyLock::new(|| {
    std::sync::Mutex::new(std::collections::HashMap::new())
});

/// Insere child process no mapa global.
pub fn register_cancel(id: String, child: std::sync::Arc<tokio::sync::Mutex<Child>>) {
    let mut g = CANCEL_MAP.lock().unwrap();
    g.insert(id, child);
}

/// Remove e retorna o child.
pub fn unregister_cancel(id: &str) -> Option<std::sync::Arc<tokio::sync::Mutex<Child>>> {
    let mut g = CANCEL_MAP.lock().unwrap();
    g.remove(id)
}

/// Intenção de limpeza: ids cujo `.part` deve ser apagado quando a task
/// `ytdlp_download` terminar. `pause` NÃO marca (resume reaproveita o
/// `.part`); `cancel` definitivo marca via `ytdlp_cancel(cleanup=true)`.
static CLEANUP_INTENT: LazyLock<std::sync::Mutex<std::collections::HashSet<String>>> =
    LazyLock::new(|| std::sync::Mutex::new(std::collections::HashSet::new()));

fn mark_cleanup_intent(id: &str) {
    CLEANUP_INTENT.lock().unwrap().insert(id.to_owned());
}

/// Consome a intenção (true = havia pedido de limpeza).
fn take_cleanup_intent(id: &str) -> bool {
    CLEANUP_INTENT.lock().unwrap().remove(id)
}

/// Últimos destinos capturados por download id (todos os `Destination:`
/// vistos no stdout — vídeo + áudio separados geram arquivos distintos).
/// Mantido após falha para permitir `ytdlp_cleanup` post-mortem e resume;
/// descartado no sucesso. Só guarda nomes (a deleção valida o diretório).
static LAST_PATHS: LazyLock<std::sync::Mutex<std::collections::HashMap<String, Vec<String>>>> =
    LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

fn remember_download_path(id: &str, path: &str) {
    let mut g = LAST_PATHS.lock().unwrap();
    if g.len() > 1000 {
        g.clear();
    }
    let v = g.entry(id.to_owned()).or_default();
    if !v.contains(&path.to_owned()) {
        v.push(path.to_owned());
        if v.len() > 8 {
            v.remove(0);
        }
    }
}

fn forget_download_paths(id: &str) -> Option<Vec<String>> {
    LAST_PATHS.lock().unwrap().remove(id)
}

/// Retorna o diretório de downloads do SO. Paridade `main.cjs:203`.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn fs_get_downloads_path(app: AppHandle) -> Result<String, String> {
    let p = app.path().download_dir().map_err(|e| format!("{:?}", e))?;
    Ok(p.to_string_lossy().into_owned())
}

/// No Android: pasta de downloads do app no armazenamento externo
/// (`getExternalFilesDir(DOWNLOADS)` via Kotlin) — gravável sem permissão,
/// visível em gerenciadores de arquivos. A pública (`/Download`) é
/// bloqueada pelo scoped storage (EACCES via File API no SDK 30+).
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn fs_get_downloads_path(app: AppHandle) -> Result<String, String> {
    let dir = crate::mobile_ytdlp::downloads_dir(&app).await?;
    Ok(dir.to_string_lossy().into_owned())
}

/// `shell:openPath` — abre arquivo ou pasta no gerenciador de arquivos do SO.
/// Paridade `main.cjs:205-230`.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn fs_open_path(_app: AppHandle, target_path: String) -> Result<(), String> {
    let normalized = target_path.trim().trim_matches(|c| c == '\'' || c == '"');
    if normalized.is_empty() {
        return Err("path vazio".into());
    }
    let path = PathBuf::from(normalized);
    if path.exists() {
        if path.is_file() {
            // show in folder
            #[cfg(target_os = "linux")]
            {
                use std::process::Command;
                let parent = path.parent().unwrap_or(&path);
                Command::new("xdg-open").arg(parent).spawn().map_err(|e| e.to_string())?;
            }
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                Command::new("explorer").args(["/select,", &normalized]).spawn().map_err(|e| e.to_string())?;
            }
            #[cfg(target_os = "macos")]
            {
                use std::process::Command;
                Command::new("open").args(["-R", &normalized]).spawn().map_err(|e| e.to_string())?;
            }
        } else if path.is_dir() {
            // open folder
            #[cfg(target_os = "linux")]
            {
                use std::process::Command;
                Command::new("xdg-open").arg(&normalized).spawn().map_err(|e| e.to_string())?;
            }
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                Command::new("explorer").arg(&normalized).spawn().map_err(|e| e.to_string())?;
            }
            #[cfg(target_os = "macos")]
            {
                use std::process::Command;
                Command::new("open").arg(&normalized).spawn().map_err(|e| e.to_string())?;
            }
        }
    } else {
        // path não existe — tenta abrir o pai
        if let Some(parent) = path.parent() {
            if parent.exists() {
                #[cfg(target_os = "linux")]
                {
                    use std::process::Command;
                    Command::new("xdg-open").arg(parent).spawn().map_err(|e| e.to_string())?;
                }
                #[cfg(target_os = "windows")]
                {
                    use std::process::Command;
                    Command::new("explorer").arg(parent).spawn().map_err(|e| e.to_string())?;
                }
                #[cfg(target_os = "macos")]
                {
                    use std::process::Command;
                    Command::new("open").arg(parent).spawn().map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

/// No Android: abre via intent VIEW com FileProvider (Kotlin).
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn fs_open_path(app: AppHandle, target_path: String) -> Result<(), String> {
    let normalized = target_path.trim().trim_matches(|c| c == '\'' || c == '"');
    if normalized.is_empty() {
        return Err("path vazio".into());
    }
    let _: serde_json::Value = crate::mobile_ytdlp::call_mobile(
        &app,
        "openFile",
        &serde_json::json!({ "path": normalized }),
    )
    .await?;
    Ok(())
}

/// `shell:selectFolder` — abre diálogo para selecionar pasta.
/// Paridade `main.cjs:357-368`.
#[tauri::command]
pub async fn fs_select_folder(app: AppHandle, default_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_dialog::DialogExt;
        let default = default_path.and_then(|p| {
            let path = PathBuf::from(p);
            if path.is_absolute() && path.exists() {
                Some(path)
            } else {
                None
            }
        }).unwrap_or_else(|| {
            app.path().download_dir().unwrap_or(PathBuf::from("/tmp"))
        });

        let dialog = app.dialog().file().set_directory(&default);
        let (tx, rx) = tokio::sync::oneshot::channel();
        dialog.pick_folder(move |folder| {
            let _ = tx.send(folder.map(|f| f.to_string()));
        });
        match rx.await {
            Ok(folder) => Ok(folder),
            Err(_) => Ok(None),
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, default_path);
        Ok(None)
    }
}

/// `save-description` — salva arquivo de texto na pasta de downloads.
/// Paridade `main.cjs:335-355`.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn fs_save_description(
    app: AppHandle,
    filename: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let downloads = app.path().download_dir().map_err(|e| format!("{:?}", e))?;
    Ok(write_description_file(&downloads, &filename, &content)?)
}

/// No Android: mesma lógica, na pasta do app (Kotlin).
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn fs_save_description(
    app: AppHandle,
    filename: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let dir: String =
        crate::mobile_ytdlp::downloads_dir(&app).await?.to_string_lossy().into_owned();
    Ok(write_description_file(&PathBuf::from(dir), &filename, &content)?)
}

fn write_description_file(
    downloads: &Path,
    filename: &str,
    content: &str,
) -> Result<serde_json::Value, String> {
    let safe = filename.trim().trim_matches(|c| c == '\'' || c == '"');
    let safe = safe.replace(|c: char| matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'), "_");
    let mut file_path = downloads.join(&safe);
    if file_path.exists() {
        let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_string();
        let base = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("description").to_string();
        let mut counter = 1;
        while file_path.exists() {
            file_path = downloads.join(format!("{}_{}.{}", base, counter, ext));
            counter += 1;
        }
    }
    std::fs::write(&file_path, content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "success": true,
        "filePath": file_path.to_string_lossy(),
        "dir": downloads.to_string_lossy(),
    }))
}

/// Extensão pela content-type (`image/jpeg; charset=x` → `jpg`).
fn content_type_ext(ct: &str) -> Option<&'static str> {
    let mime = ct.split(';').next()?.trim().to_lowercase();
    match mime.as_str() {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

/// Extensão pelo path da URL (`.../hqdefault.jpg?x` → `jpg`).
fn url_path_ext(url: &str) -> Option<String> {
    let path = url.split(['?', '#']).next()?;
    let ext = path.rsplit('.').next()?;
    if ext.len() >= 2
        && ext.len() <= 5
        && ext.chars().all(|c| c.is_ascii_alphanumeric())
        && !path.ends_with('/')
    {
        Some(if ext.eq_ignore_ascii_case("jpeg") {
            "jpg".to_owned()
        } else {
            ext.to_lowercase()
        })
    } else {
        None
    }
}

/// Host bloqueado para capa (S3): a URL vem do probe (conteúdo de
/// terceiros) — nunca buscar metadata/link-local/IP literal, mesmo que o
/// backend não encaminhe a resposta a ninguém.
fn cover_host_blocked(url: &str) -> bool {
    let Some(after_scheme) = url.split("://").nth(1) else {
        return true;
    };
    let authority = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("");
    let host = authority.rsplit('@').next().unwrap_or("");
    if host.starts_with('[') {
        return true; // IPv6 literal
    }
    let bare = host.split(':').next().unwrap_or("").trim_end_matches('.');
    let lower = bare.to_lowercase();
    if lower.is_empty() || lower == "localhost" || lower.starts_with("localhost.") {
        return true;
    }
    // IPv4 literal: 4 grupos decimais.
    let parts: Vec<&str> = lower.split('.').collect();
    if parts.len() == 4
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.len() <= 3 && p.bytes().all(|b| b.is_ascii_digit()))
    {
        return true;
    }
    // Sobra de IPv6 sem colchetes ou hostname inválido.
    if lower.contains(':') {
        return true;
    }
    false
}

/// `fs_fetch_cover` — baixa os bytes da imagem de capa via HTTPS direto
/// (sem CORS de canvas) e devolve em base64 + extensão real. O frontend
/// converte (blob: URL = canvas limpo) e salva via plugin-fs. Teto 25 MB.
/// Só `https://` e hosts públicos (S3: sem IP literal/localhost/metadata).
#[tauri::command]
pub async fn fs_fetch_cover(url: String) -> Result<serde_json::Value, String> {
    use base64::Engine as _;
    let url = url.trim().to_owned();
    if !url.starts_with("https://") || cover_host_blocked(&url) {
        return Err("URL de capa inválida".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("LinkFetcher")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("baixar capa: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("capa: HTTP {}", resp.status()));
    }
    let ext = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(content_type_ext)
        .map(str::to_owned)
        .or_else(|| url_path_ext(&url))
        .unwrap_or_else(|| "jpg".to_owned());
    // Teto anti-abuso: capa de 25 MB já é absurda.
    const MAX_COVER: u64 = 25 * 1024 * 1024;
    if resp.content_length().is_some_and(|n| n > MAX_COVER) {
        return Err("capa grande demais".into());
    }
    let bytes = resp.bytes().await.map_err(|e| format!("ler capa: {e}"))?;
    if bytes.len() as u64 > MAX_COVER {
        return Err("capa grande demais".into());
    }
    Ok(serde_json::json!({
        "success": true,
        "data": base64::engine::general_purpose::STANDARD.encode(&bytes),
        "ext": ext,
        "size": bytes.len(),
    }))
}

/// Limpa o stderr para exibição: descarta segmentos de progresso do ffmpeg
/// (`frame=… fps=…`, `size=… time=…`) que soterrariam o erro real; mantém as
/// últimas linhas significativas, máx. 500 chars.
///
/// O ffmpeg atualiza o status com `\r` (mesma "linha"), não `\n` — o split
/// precisa cobrir os dois, senão o progresso inteiro vira uma mega-linha que
/// ou é descartada junto com a causa real ou vaza como "mensagem de erro".
fn clean_error_message(stderr_output: &str) -> String {
    fn is_progress_noise(line: &str) -> bool {
        let l = line.trim();
        if l.is_empty() {
            return true;
        }
        // Linhas de status do ffmpeg: "frame= 123 fps=... q=..." e "size=... time=..."
        (l.contains("frame=") && l.contains("fps="))
            || (l.starts_with("size=") && l.contains("time="))
            || (l.contains("bitrate=") && l.contains("speed="))
            || l.starts_with("elapsed=")
    }

    let kept: Vec<&str> = stderr_output
        .split(|c| c == '\n' || c == '\r')
        .map(str::trim)
        .filter(|l| !is_progress_noise(l))
        .collect();
    // Prioriza o fim (onde está a causa)
    let tail: Vec<&str> = kept
        .into_iter()
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let mut msg = tail.join(" · ");
    if msg.is_empty() {
        // Tudo era ruído (ex. ffmpeg morto no meio do corte): mostra o último
        // segmento significativo em vez da mega-linha de progresso crua.
        msg = stderr_output
            .split(|c| c == '\n' || c == '\r')
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .last()
            .unwrap_or("erro desconhecido")
            .to_owned();
    }
    // Normaliza prefixos comuns do yt-dlp/ffmpeg
    for prefix in ["ERROR: ", "Error: "] {
        if let Some(rest) = msg.strip_prefix(prefix) {
            msg = rest.to_owned();
            break;
        }
    }
    if msg.chars().count() > 500 {
        msg = msg.chars().take(497).collect::<String>() + "...";
    }
    msg
}

/// Parse `MM:SS` ou `H:MM:SS` (aceita decimais) → segundos.
fn parse_section_time(t: &str) -> Option<f64> {
    let t = t.trim();
    if t.is_empty() {
        return None;
    }
    let mut total = 0.0;
    let mut any = false;
    for p in t.split(':') {
        total = total * 60.0 + p.trim().parse::<f64>().ok()?;
        any = true;
    }
    if any && total >= 0.0 { Some(total) } else { None }
}

/// Parse `*INÍCIO-FIM` (formato emitido pelo FormatSelector) → segundos.
/// Fim pode ser vazio (`*01:00-` = até o fim); `*-02:00` = do início.
fn parse_section_range(s: &str) -> Option<(Option<f64>, Option<f64>)> {
    let body = s.strip_prefix('*').unwrap_or(s);
    let (start_s, end_s) = body.split_once('-')?;
    let start = parse_section_time(start_s);
    let end = parse_section_time(end_s);
    if start.is_none() && end.is_none() {
        return None;
    }
    if let (Some(st), Some(en)) = (start, end) {
        if en <= st {
            return None;
        }
    }
    Some((start, end))
}

/// Corte local rápido: `ffmpeg -ss … -i cheio [-t …] -c copy tmp` + rename
/// sobre o caminho final. Stream-copy, sem re-encode: segundos mesmo em GBs.
async fn ffmpeg_cut_local(
    ffmpeg: &Path,
    full_path: &str,
    start: Option<f64>,
    end: Option<f64>,
) -> Result<(), String> {
    // Temp preserva a extensão: o ffmpeg infere o muxer pelo nome de saída.
    let ext = Path::new(full_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let tmp_path = format!("{full_path}.cuttmp.{ext}");
    let mut args: Vec<String> = vec!["-y".to_owned()];
    if let Some(st) = start {
        args.push("-ss".to_owned());
        args.push(format!("{st}"));
    }
    args.push("-i".to_owned());
    args.push(full_path.to_owned());
    match (start, end) {
        (Some(st), Some(en)) => {
            args.push("-t".to_owned());
            args.push(format!("{}", en - st));
        }
        (None, Some(en)) => {
            args.push("-to".to_owned());
            args.push(format!("{en}"));
        }
        _ => {}
    }
    args.push("-c".to_owned());
    args.push("copy".to_owned());
    args.push(tmp_path.clone());

    let mut cmd = tokio::process::Command::new(ffmpeg);
    cmd.args(&args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd
        .output()
        .await
        .map_err(|e| format!("spawn ffmpeg p/ corte: {e}"))?;
    if !out.status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
        let msg = clean_error_message(&stderr);
        return Err(if msg.is_empty() {
            format!("ffmpeg encerrou com status {:?}", out.status.code())
        } else {
            msg
        });
    }
    // Assume o nome final com o trecho (remove o cheio antes p/ Windows).
    std::fs::remove_file(full_path).map_err(|e| format!("limpar arquivo cheio: {e}"))?;
    std::fs::rename(&tmp_path, full_path).map_err(|e| format!("finalizar corte: {e}"))?;
    Ok(())
}

/// Sufixos de artefatos temporários do yt-dlp/ffmpeg — nunca são entregáveis.
/// Usado para (a) não eleger lixo como `latest_downloaded_file` e
/// (b) limpar parciais no cancelamento definitivo.
fn is_temp_artifact_name(name: &str) -> bool {
    name.contains(".part")
        || name.ends_with(".ytdl")
        || name.ends_with(".temp")
        || name.ends_with(".tmp")
        || name.ends_with(".new")
        || name.contains(".cuttmp.")
        || name.ends_with(".cuttmp")
        || name.contains("-Frag")
}

/// Remove as flags de legenda do argv (`--write-subs`, `--write-auto-subs`,
/// `--sub-langs X`, `--sub-format X`, `--embed-subs`). Usado no retry
/// video-only após falha de legenda (GAP1).
fn strip_sub_flags(argv: Vec<String>) -> Vec<String> {
    let mut out = Vec::with_capacity(argv.len());
    let mut skip_next = false;
    for a in argv {
        if skip_next {
            skip_next = false;
            continue;
        }
        if a == "--sub-langs" || a == "--sub-format" {
            skip_next = true;
            continue;
        }
        if a == "--write-subs" || a == "--write-auto-subs" || a == "--embed-subs" {
            continue;
        }
        out.push(a);
    }
    out
}

/// Elegível ao retry sem legendas: pediu legendas, ainda não tentou, o
/// stderr cita legenda (não é falha do vídeo) e o processo saiu sozinho
/// (kill por pausa/cancel tem `code() == None` no unix).
fn should_retry_without_subs(
    params: &crate::ytdlp::args::DownloadParams,
    err_lower: &str,
    code: Option<i32>,
) -> bool {
    let asked = params.write_subs.unwrap_or(false) || params.write_auto_subs.unwrap_or(false);
    params.subs_fallback.is_none() && asked && err_lower.contains("subtitle") && code.is_some()
}

/// Apaga as variantes temporárias de um caminho-base (`base.part`,
/// `base.ytdl`, `base.cutmp.*`, fragmentos `-Frag*` etc). Nunca apaga o
/// arquivo final — exceto se o próprio base já for um artefato (ex.
/// `"x.mp4.part"` capturado no stdout). Retorna quantos arquivos removeu.
fn remove_temp_variants(base: &Path) -> u32 {
    let mut removed = 0u32;
    // O próprio base pode ser um artefato temporário.
    if let Some(name) = base.file_name().and_then(|s| s.to_str()) {
        if is_temp_artifact_name(name) && std::fs::remove_file(base).is_ok() {
            removed += 1;
        }
    }
    for suffix in [".part", ".ytdl", ".temp", ".tmp", ".new"] {
        let p = PathBuf::from(format!("{}{suffix}", base.to_string_lossy()));
        if std::fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    // `.cuttmp.*` e fragmentos `-Frag*` compartilham o prefixo do base.
    if let (Some(parent), Some(stem)) = (
        base.parent(),
        base.file_name().and_then(|s| s.to_str()),
    ) {
        if let Ok(entries) = std::fs::read_dir(parent) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with(stem)
                    && name.len() > stem.len()
                    && (name.contains(".cuttmp.") || name.contains("-Frag"))
                    && std::fs::remove_file(e.path()).is_ok()
                {
                    removed += 1;
                }
            }
        }
    }
    removed
}

/// `ytdlp_download` — spawna yt-dlp com argv canônico + ffmpeg se presente,
/// parseia stdout para progresso e arquivos gerados, aguarda o término do processo,
/// emite `yt-dlp-progress` events (compat Electron) + `binary-download`,
/// retorna caminho do arquivo baixado ou erro.
///
/// Recorte (`download_sections`): baixa o arquivo CHEIO pelo yt-dlp nativo
/// (rápido, progresso real, resume) e corta local com ffmpeg
/// (`-c copy`, segundos). NÃO repassa `--download-sections`: ele delegaria o
/// fetch ao ffmpeg remoto (1 conexão, sem cliente do yt-dlp → 403 e
/// lerdeza no YouTube, stdout mudo, sem resume).
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn ytdlp_download(
    app: AppHandle,
    options: Option<crate::ytdlp::args::DownloadParams>,
    params: Option<crate::ytdlp::args::DownloadParams>,
    payload: Option<crate::ytdlp::args::DownloadParams>,
) -> Result<String, String> {
    let params = options
        .or(params)
        .or(payload)
        .ok_or_else(|| "Nenhum parâmetro fornecido para download (esperado options, params ou payload)".to_string())?;
    eprintln!("[ytdlp_download] START id={} url={}", params.id, params.url);
    // Intenção de limpeza de uma sessão anterior com o mesmo id não pode
    // vazar para esta (retry reusa o id): o .part é necessário p/ resume.
    take_cleanup_intent(&params.id);

    // Resolve binário yt-dlp via binary.rs
    let ytdlp_bin = crate::ytdlp::binary::ytdlp_path(&app).map_err(|e| {
        eprintln!("[ytdlp_download] ERROR resolving yt-dlp binary: {:?}", e);
        format!("{:?}", e)
    })?;
    eprintln!("[ytdlp_download] yt-dlp binary: {}", ytdlp_bin.display());

    // Resolve binário ffmpeg opcional (se existir, repassa via --ffmpeg-location)
    let ffmpeg_bin = crate::ytdlp::binary::ffmpeg_path(&app)
        .ok()
        .filter(|p| p.is_file());
    if let Some(ref ff) = ffmpeg_bin {
        eprintln!("[ytdlp_download] ffmpeg binary found: {}", ff.display());
    } else {
        eprintln!("[ytdlp_download] ffmpeg binary not found, using system PATH fallback if available");
    }

    let output_dir = app.path().download_dir().unwrap_or_else(|_| PathBuf::from("/tmp"));
    std::fs::create_dir_all(&output_dir).ok();
    eprintln!("[ytdlp_download] output_dir: {}", output_dir.display());

    // Usa build_args canônico com ffmpeg
    let mut argv = crate::ytdlp::args::build_args(&params, &output_dir, ffmpeg_bin.as_deref());
    // Recorte: remove --download-sections (fetch remoto via ffmpeg = lento/403
    // e sem progresso). O corte acontece local após o download cheio.
    let wants_cut = params
        .download_sections
        .as_deref()
        .is_some_and(|s| !s.is_empty());
    let section_range: Option<(Option<f64>, Option<f64>)> = params
        .download_sections
        .as_deref()
        .and_then(parse_section_range);
    if wants_cut {
        if section_range.is_none() {
            eprintln!(
                "[ytdlp_download] WARN download_sections inválido ({:?}); entregando arquivo cheio",
                params.download_sections
            );
        }
        let mut stripped = Vec::with_capacity(argv.len());
        let mut skip_next = false;
        for a in argv {
            if skip_next {
                skip_next = false;
                continue;
            }
            if a == "--download-sections" {
                skip_next = true;
                continue;
            }
            stripped.push(a);
        }
        argv = stripped;
    }
    // Retry video-only (GAP1): 2ª execução após falha de legenda carrega
    // `subs_fallback` — remove as flags para salvar pelo menos o vídeo.
    if params.subs_fallback.is_some() {
        eprintln!("[ytdlp_download] retry sem legendas");
        argv = strip_sub_flags(argv);
    }
    // Runtime JS do sistema (se houver): sem ele a extração moderna do
    // YouTube degrada (formatos ausentes). Vai antes da URL posicional, mas
    // depois do `--` (S11): o separador fica colado na URL.
    {
        let js = crate::ytdlp::binary::js_runtime_args();
        if !js.is_empty() {
            let url_arg = argv.pop();
            let sep = if argv.last().is_some_and(|s| s == "--") {
                argv.pop()
            } else {
                None
            };
            argv.extend(js);
            if let Some(s) = sep {
                argv.push(s);
            }
            if let Some(u) = url_arg {
                argv.push(u);
            }
        }
    }
    eprintln!("[ytdlp_download] argv: {:?}", argv);

    // Spawn com pipes
    let mut cmd = tokio::process::Command::new(ytdlp_bin);
    cmd.args(&argv)
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut proc = cmd.spawn().map_err(|e| {
        eprintln!("[ytdlp_download] ERROR spawn: {}", e);
        format!("spawn yt-dlp: {e}")
    })?;

    eprintln!("[ytdlp_download] process spawned successfully");

    // Take stdout/stderr pipes BEFORE wrapping child
    let mut stdout = proc.stdout.take().expect("stdout pipe");
    let mut stderr = proc.stderr.take().expect("stderr pipe");

    let child_arc = std::sync::Arc::new(tokio::sync::Mutex::new(proc));
    register_cancel(params.id.clone(), child_arc.clone());
    eprintln!("[ytdlp_download] registered in cancel map");

    // Stdout channel for line processing
    let (stdout_tx, mut stdout_rx) = tokio::sync::mpsc::channel::<String>(128);

    // Stdout reader task: detém o stdout_tx exclusivamente para que quando o processo terminar
    // e der EOF no stdout, stdout_tx seja dropado e o canal mpsc feche sem deadlock!
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        let mut line_buf = String::new();
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    line_buf.push_str(&String::from_utf8_lossy(&buf[..n]));
                    while let Some(pos) = line_buf.find('\n') {
                        let line = line_buf.drain(..=pos).collect::<String>();
                        if stdout_tx.send(line).await.is_err() {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }
        if !line_buf.is_empty() {
            let _ = stdout_tx.send(line_buf).await;
        }
    });

    // Stderr reader (mantém últimos 4000 chars para diagnóstico)
    let stderr_collector = tokio::spawn(async move {
        let mut buf = [0u8; 1024];
        let mut stderr_buf = String::new();
        loop {
            match stderr.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    stderr_buf.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if stderr_buf.len() > 4000 {
                        stderr_buf = stderr_buf[stderr_buf.len() - 4000..].to_owned();
                    }
                }
                Err(_) => break,
            }
        }
        stderr_buf
    });

    // Process stdout lines, emit progress events and track destination file
    let download_id = params.id.clone();
    let mut captured_filepath: Option<String> = None;
    let mut subtitle_written = false;

    while let Some(line) = stdout_rx.recv().await {
        let trimmed = line.trim();
        if let Some(prog) = parse_progress(trimmed) {
            let progress_event = serde_json::json!({
                "id": download_id,
                "type": "progress",
                "percent": prog.percent,
                "speed": prog.speed.to_string(),
                "eta": prog.eta.to_string(),
                "downloaded": prog.downloaded,
                "total": prog.total,
            });
            let _ = app.emit("yt-dlp-progress", &progress_event);
            let _ = app.emit(
                "binary-download",
                serde_json::json!({
                    "stage": "progress",
                    "file": "yt-dlp",
                    "received": prog.downloaded,
                    "total": prog.total,
                    "percent": prog.percent as u8,
                    "speed": prog.speed,
                    "eta": prog.eta,
                }),
            );
        } else if let Some(dest) = parse_destination(trimmed) {
            eprintln!("[ytdlp_download] captured destination: {}", dest);
            remember_download_path(&download_id, &dest);
            captured_filepath = Some(dest);
        } else if let Some(merged) = parse_merge(trimmed) {
            eprintln!("[ytdlp_download] captured merged file: {}", merged);
            remember_download_path(&download_id, &merged);
            captured_filepath = Some(merged);
        } else if parse_subtitle_path(trimmed).is_some() {
            subtitle_written = true;
        } else if trimmed.contains("has already been downloaded") {
            if let Some(start) = trimmed.find("[download] ") {
                if let Some(end) = trimmed.find(" has already been downloaded") {
                    let path = trimmed[start + 11..end].trim().to_owned();
                    eprintln!("[ytdlp_download] captured already downloaded file: {}", path);
                    remember_download_path(&download_id, &path);
                    captured_filepath = Some(path);
                }
            }
        }
    }

    // Wait for the child process to finish completely
    let wait_res = {
        let mut child_guard = child_arc.lock().await;
        child_guard.wait().await
    };

    let stderr_output = stderr_collector.await.unwrap_or_default();
    let _ = unregister_cancel(&download_id);

    match wait_res {
        Ok(status) if status.success() => {
            eprintln!("[ytdlp_download] Process exited successfully with status 0");

            // Determina caminho do arquivo final:
            // 1. Tenta o arquivo capturado via stdout
            // 2. Se não existir, busca o arquivo mais recente em output_dir
            let final_path = captured_filepath
                .filter(|p| Path::new(p).exists())
                .or_else(|| latest_downloaded_file(&output_dir));

            // Recorte: o arquivo cheio já baixou (rápido, com progresso real);
            // corta local via ffmpeg e entrega só o trecho no caminho final.
            // O corte local é stream-copy (segundos); a UI mostra "processando".
            if wants_cut {
                match (final_path.clone(), section_range) {
                    (Some(path), Some((start, end))) => {
                        let _ = app.emit(
                            "yt-dlp-progress",
                            &serde_json::json!({ "id": download_id, "type": "processing" }),
                        );
                        let ffmpeg_prog = ffmpeg_bin
                            .clone()
                            .unwrap_or_else(|| PathBuf::from("ffmpeg"));
                        if let Err(cut_err) =
                            ffmpeg_cut_local(&ffmpeg_prog, &path, start, end).await
                        {
                            eprintln!("[ytdlp_download] Cut failed: {}", cut_err);
                            let error_event = serde_json::json!({
                                "id": download_id,
                                "type": "error",
                                "message": &cut_err,
                            });
                            let _ = app.emit("yt-dlp-progress", &error_event);
                            let _ = app.emit(
                                "binary-download",
                                serde_json::json!({
                                    "stage": "error",
                                    "file": "yt-dlp",
                                    "message": &cut_err,
                                }),
                            );
                            return Err(cut_err);
                        }
                    }
                    (Some(_), None) => {
                        eprintln!("[ytdlp_download] WARN corte ignorado (range inválido); entregando arquivo cheio");
                    }
                    (None, _) => {
                        eprintln!("[ytdlp_download] WARN recorte sem arquivo capturado");
                    }
                }
            }

            let size = final_path.as_ref().map(|p| {
                std::fs::metadata(p).ok().map(|m| m.len()).unwrap_or(0)
            }).unwrap_or(0);

            // Aviso de legendas (não é erro: o vídeo está íntegro):
            // - retry video-only (GAP1): a 1ª tentativa falhou nas legendas;
            // - recorte + sidecar (GAP2): o .srt cobre o vídeo inteiro, pois
            //   o corte local só atinge o vídeo (embutida não tem esse problema).
            let sub_warning: Option<String> =
                if let Some(reason) = params.subs_fallback.as_deref() {
                    Some(format!("Legendas indisponíveis ({reason}); vídeo salvo sem elas"))
                } else if wants_cut
                    && subtitle_written
                    && !params.embed_subs.unwrap_or(false)
                    && (params.write_subs.unwrap_or(false)
                        || params.write_auto_subs.unwrap_or(false))
                {
                    Some(
                        "Legendas laterais cobrem o vídeo completo (o recorte aplica-se só ao vídeo)"
                            .to_owned(),
                    )
                } else {
                    None
                };

            let complete_event = serde_json::json!({
                "id": download_id,
                "type": "complete",
                "filePath": final_path,
                "size": size,
                "subWarning": sub_warning,
            });
            let _ = app.emit("yt-dlp-progress", &complete_event);
            let _ = app.emit(
                "binary-download",
                serde_json::json!({
                    "stage": "done",
                    "file": "yt-dlp",
                    "filePath": final_path,
                    "size": size,
                }),
            );
            // Sucesso: nada a limpar depois; descarta o rastreio de parciais.
            let _ = forget_download_paths(&download_id);
            let _ = take_cleanup_intent(&download_id);

            Ok(final_path.unwrap_or_default())
        }
        Ok(status) => {
            let err_msg = if !stderr_output.trim().is_empty() {
                clean_error_message(&stderr_output)
            } else {
                format!("yt-dlp encerrou com status {:?}", status.code())
            };
            eprintln!("[ytdlp_download] Process failed: {}", err_msg);

            // GAP1: falha citando legenda com legendas pedidas = acessório
            // (ex. 429 transitório), não o vídeo. Uma única re-execução sem
            // as flags salva o vídeo e avisa no `complete`. Kill de pausa/
            // cancel sai sozinho (code None no unix) e nunca entra aqui.
            if should_retry_without_subs(&params, &err_msg.to_lowercase(), status.code()) {
                eprintln!("[ytdlp_download] subs falharam; repetindo sem legendas");
                let mut retry_params = params;
                retry_params.subs_fallback = Some(err_msg);
                return Box::pin(ytdlp_download(app.clone(), None, Some(retry_params), None)).await;
            }

            // Cancelamento definitivo: apaga os parciais desta sessão.
            // Pausa/erro comum: mantém o `.part` (resume no retry/resume).
            if take_cleanup_intent(&download_id) {
                if let Some(remembered) = forget_download_paths(&download_id) {
                    for rp in remembered {
                        remove_temp_variants(Path::new(&rp));
                    }
                } else if let Some(ref p) = captured_filepath {
                    remove_temp_variants(Path::new(p));
                }
            }
            let error_event = serde_json::json!({
                "id": download_id,
                "type": "error",
                "message": &err_msg,
            });
            let _ = app.emit("yt-dlp-progress", &error_event);
            let _ = app.emit(
                "binary-download",
                serde_json::json!({
                    "stage": "error",
                    "file": "yt-dlp",
                    "message": &err_msg,
                }),
            );

            Err(err_msg)
        }
        Err(e) => {
            let err_msg = format!("Erro ao aguardar processo: {e}");
            eprintln!("[ytdlp_download] Error waiting for process: {}", err_msg);
            if take_cleanup_intent(&download_id) {
                if let Some(remembered) = forget_download_paths(&download_id) {
                    for rp in remembered {
                        remove_temp_variants(Path::new(&rp));
                    }
                } else if let Some(ref p) = captured_filepath {
                    remove_temp_variants(Path::new(p));
                }
            }
            let error_event = serde_json::json!({
                "id": download_id,
                "type": "error",
                "message": &err_msg,
            });
            let _ = app.emit("yt-dlp-progress", &error_event);
            Err(err_msg)
        }
    }
}

/// Resposta do comando `execute` do plugin Kotlin.
/// O Kotlin resolve com chave camelCase (`filePath`); o alias garante a
/// desserialização — sem ele `file_path` vinha `None` e o download concluído
/// (evento `complete` já emitido) era sobrescrito por
/// "download concluído sem arquivo final".
#[cfg(target_os = "android")]
#[derive(Debug, serde::Deserialize)]
struct MobileExecuteResult {
    #[serde(default)]
    #[allow(dead_code)]
    out: String,
    #[serde(default, alias = "filePath")]
    file_path: Option<String>,
    // Tamanho vem no evento `complete` (usado pela UI); no `resolve` é só
    // conferência — mantém desserializado p/ detectar payload incompleto.
    #[serde(default)]
    #[allow(dead_code)]
    size: u64,
}

#[cfg(all(test, target_os = "android"))]
mod mobile_contract_tests {
    use super::MobileExecuteResult;

    /// Contrato FFI com `YtDlpPlugin.kt`: o `invoke.resolve` entrega chaves
    /// camelCase (`filePath`). Regressão de 2026-09-30: sem o alias, o campo
    /// vinha `None` e download concluído virava "sem arquivo final".
    #[test]
    fn execute_result_parses_kotlin_camel_case() {
        let raw = r#"{"filePath": "/dl/video.mp3", "size": 12345}"#;
        let r: MobileExecuteResult = serde_json::from_str(raw).expect("parse");
        assert_eq!(r.file_path.as_deref(), Some("/dl/video.mp3"));
        assert_eq!(r.size, 12345);
    }

    #[test]
    fn execute_result_tolerates_missing_fields() {
        let r: MobileExecuteResult = serde_json::from_str("{}").expect("parse");
        assert!(r.file_path.is_none());
    }
}

/// `ytdlp_download` no Android: monta o argv canônico do desktop
/// (`build_args`, mesma paridade de flags) e executa no yt-dlp embarcado
/// via plugin Kotlin. Progresso/conclusão chegam pelo evento
/// `yt-dlp-progress` emitido pelo Kotlin no formato do DownloadEngine.
///
/// Diferenças mobile (sem ffmpeg CLI local):
/// - sem `--progress-template` (o Kotlin parseia o formato padrão);
/// - sem `--ffmpeg-location` (a lib injeta o ffmpeg embarcado sozinha);
/// - `download_sections` repassado nativo (sem corte local pós-download).
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn ytdlp_download(
    app: AppHandle,
    options: Option<crate::ytdlp::args::DownloadParams>,
    params: Option<crate::ytdlp::args::DownloadParams>,
    payload: Option<crate::ytdlp::args::DownloadParams>,
) -> Result<String, String> {
    let params = options
        .or(params)
        .or(payload)
        .ok_or_else(|| "Nenhum parâmetro fornecido para download (esperado options, params ou payload)".to_string())?;
    eprintln!("[ytdlp_download:android] START id={} url={}", params.id, params.url);
    take_cleanup_intent(&params.id);

    let output_dir = crate::mobile_ytdlp::downloads_dir(&app).await?;
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    // Até 2 tentativas: a 2ª sem legendas se a 1ª falhar citando legenda
    // (GAP1 — mesmo contrato do desktop).
    // `--ppa` é removido no mobile (ver `strip_mobile_unsupported`): se o
    // usuário pediu filtros, avisa no `complete` via `warnFilters` em vez de
    // entregar o arquivo calado sem eles. Lê antes do move p/ `attempt_params`.
    let filters_dropped = params.normalize_audio.unwrap_or(false)
        || params.video_sharpen.as_deref().is_some_and(|s| !s.is_empty() && s != "none");
    let mut attempt_params = params;
    for attempt in 0..2 {
        let mut argv = crate::ytdlp::args::build_args(&attempt_params, &output_dir, None);
        strip_mobile_unsupported(&mut argv);
        eprintln!("[ytdlp_download:android] argv (tentativa {}): {:?}", attempt + 1, argv);

        let payload = serde_json::json!({
            "argv": argv,
            "processId": attempt_params.id,
            "warnFilters": filters_dropped,
            "title": attempt_params.title.as_deref().unwrap_or(""),
            "publicSubdir": attempt_params.mobile_public_subdir
                .as_deref()
                .unwrap_or("LinkFetcher"),
        });
        let res: Result<MobileExecuteResult, String> =
            crate::mobile_ytdlp::call_mobile(&app, "execute", &payload).await;
        match res {
            Ok(r) => {
                let _ = forget_download_paths(&attempt_params.id);
                let _ = take_cleanup_intent(&attempt_params.id);
                if let Some(fp) = r.file_path {
                    return Ok(fp);
                }
                return Err("download concluído sem arquivo final".into());
            }
            Err(e) => {
                let asked = attempt_params.write_subs.unwrap_or(false)
                    || attempt_params.write_auto_subs.unwrap_or(false);
                if attempt == 0
                    && attempt_params.subs_fallback.is_none()
                    && asked
                    && e.to_lowercase().contains("subtitle")
                {
                    eprintln!("[ytdlp_download:android] subs falharam; repetindo sem legendas");
                    attempt_params.subs_fallback = Some(e);
                    attempt_params.write_subs = Some(false);
                    attempt_params.write_auto_subs = Some(false);
                    attempt_params.embed_subs = Some(false);
                    continue;
                }
                if take_cleanup_intent(&attempt_params.id) {
                    let _ = forget_download_paths(&attempt_params.id);
                }
                return Err(e);
            }
        }
    }
    Err("download falhou após retry".into())
}

/// Remove do argv o que só faz sentido no desktop: template de progresso
/// custom (o Kotlin parseia o formato padrão do yt-dlp),
/// `--ffmpeg-location` (a lib injeta o ffmpeg embarcado automaticamente) e
/// `--ppa` (pós-processamento via ffmpeg CLI com filtros loudnorm/unsharp —
/// não confiável no ffmpeg embarcado do youtubedl-android; o download segue
/// sem o filtro em vez de falhar).
#[cfg(target_os = "android")]
fn strip_mobile_unsupported(argv: &mut Vec<String>) {
    let mut out = Vec::with_capacity(argv.len());
    let mut skip_next = false;
    for a in argv.drain(..) {
        if skip_next {
            skip_next = false;
            continue;
        }
        if a == "--progress-template" || a == "--ffmpeg-location" || a == "--ppa" {
            skip_next = true;
            continue;
        }
        if a == crate::ytdlp::args::PROGRESS_TEMPLATE {
            continue;
        }
        out.push(a);
    }
    *argv = out;
}

/// `ytdlp_cancel` — cancela um download ativo via CancelMap.
/// Aceita { id: String }, { options: { id: String } } ou string direta.
/// `cleanup=true` = cancelamento definitivo: a task apaga os `.part` ao
/// terminar. Pausa omite a flag e preserva o `.part` para resume.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn ytdlp_cancel(
    options: Option<serde_json::Value>,
    params: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
    id: Option<String>,
    cleanup: Option<bool>,
) -> Result<(), String> {
    // `cleanup` pode vir top-level ({id, cleanup}) ou aninhado ({options:{id, cleanup}}).
    let nested_cleanup = options
        .as_ref()
        .or(params.as_ref())
        .or(payload.as_ref())
        .and_then(|v| v.get("cleanup").and_then(|c| c.as_bool()))
        .unwrap_or(false);
    let want_cleanup = cleanup.unwrap_or(false) || nested_cleanup;
    let resolved_id = if let Some(s) = id {
        s
    } else if let Some(ref opts) = options.or(params).or(payload) {
        if let Some(s) = opts.as_str() {
            s.to_owned()
        } else if let Some(id_val) = opts.get("id").and_then(|v| v.as_str()) {
            id_val.to_owned()
        } else {
            return Err("ID de download inválido para cancelamento".into());
        }
    } else {
        return Err("Nenhum ID fornecido para cancelamento".into());
    };

    if want_cleanup {
        mark_cleanup_intent(&resolved_id);
    }
    if let Some(child_arc) = unregister_cancel(&resolved_id) {
        let mut child = child_arc.lock().await;
        let _ = child.kill().await;
        eprintln!("[ytdlp_cancel] Cancelled download id={}", resolved_id);
        Ok(())
    } else {
        Err("Nenhum download ativo com esse id".into())
    }
}

/// `ytdlp_cancel` no Android: mata o processo no yt-dlp embarcado (Kotlin).
/// `cleanup=true` pede ao Kotlin para apagar os `.part` da sessão.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn ytdlp_cancel(
    app: AppHandle,
    options: Option<serde_json::Value>,
    params: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
    id: Option<String>,
    cleanup: Option<bool>,
) -> Result<(), String> {
    let nested_cleanup = options
        .as_ref()
        .or(params.as_ref())
        .or(payload.as_ref())
        .and_then(|v| v.get("cleanup").and_then(|c| c.as_bool()))
        .unwrap_or(false);
    let want_cleanup = cleanup.unwrap_or(false) || nested_cleanup;
    let resolved_id = if let Some(s) = id {
        s
    } else if let Some(ref opts) = options.or(params).or(payload) {
        if let Some(s) = opts.as_str() {
            s.to_owned()
        } else if let Some(id_val) = opts.get("id").and_then(|v| v.as_str()) {
            id_val.to_owned()
        } else {
            return Err("ID de download inválido para cancelamento".into());
        }
    } else {
        return Err("Nenhum ID fornecido para cancelamento".into());
    };

    if want_cleanup {
        mark_cleanup_intent(&resolved_id);
    }
    let killed = crate::mobile_ytdlp::cancel_mobile(&app, &resolved_id, want_cleanup).await?;
    // Id inexistente/processo já morto não é erro: o estado final desejado
    // (nada rodando) já vale. Erro aqui viraria "failed" indevido no engine.
    if killed {
        eprintln!("[ytdlp_cancel:android] Cancelled download id={}", resolved_id);
    } else {
        eprintln!("[ytdlp_cancel:android] Nothing running for id={}", resolved_id);
    }
    Ok(())
}

/// `ytdlp_job_state` no Android: reconciliação pós-background. O `trigger()`
/// do Kotlin não enfileira — evento emitido com o WebView suspenso é
/// descartado e o `complete` nunca chega ao JS (item trava em `downloading`
/// com o arquivo já em disco). Retorna o JSON cru do Kotlin
/// (`{state: running|finished|unknown, ...}`); `unknown` = sem registro e o
/// engine NÃO age (seguro por padrão: nunca reinicia nada sozinho).
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn ytdlp_job_state(
    app: AppHandle,
    options: Option<serde_json::Value>,
    params: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
    id: Option<String>,
) -> Result<serde_json::Value, String> {
    let resolved_id = if let Some(s) = id {
        s
    } else if let Some(ref opts) = options.or(params).or(payload) {
        if let Some(s) = opts.as_str() {
            s.to_owned()
        } else if let Some(id_val) = opts.get("id").and_then(|v| v.as_str()) {
            id_val.to_owned()
        } else {
            return Err("Nenhum ID fornecido para job_state".into());
        }
    } else {
        return Err("Nenhum ID fornecido para job_state".into());
    };
    crate::mobile_ytdlp::job_state_mobile(&app, &resolved_id).await
}

/// `ytdlp_job_state` fora do Android: sem registro de jobs — o engine nem
/// chama (reconciliação só no mobile), então erro explícito em vez de silêncio.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn ytdlp_job_state() -> Result<serde_json::Value, String> {
    Err("job_state suportado só no Android".into())
}

/// `ytdlp_cleanup` — apaga artefatos temporários de um download
/// (`.part`, `.ytdl`, `.temp`, `.cuttmp.*`, fragmentos `-Frag*`).
/// Aceita `{ id }` (usa os destinos rastreados da sessão), `{ filePath }`
/// explícito, ou ambos. Só atua dentro da pasta de downloads — nunca apaga
/// o arquivo final nem nada fora dela. Falha de forma segura (idempotente).
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn ytdlp_cleanup(
    app: AppHandle,
    id: Option<String>,
    #[allow(non_snake_case)] filePath: Option<String>,
) -> Result<serde_json::Value, String> {
    if id.is_none() && filePath.is_none() {
        return Err("Nenhum id ou filePath fornecido para limpeza".into());
    }
    let downloads = app.path().download_dir().map_err(|e| format!("{e:?}"))?;
    let mut targets: Vec<PathBuf> = Vec::new();
    if let Some(fp) = filePath {
        let p = PathBuf::from(fp.trim().trim_matches(|c| c == '\'' || c == '"'));
        if p.parent() != Some(downloads.as_path()) {
            return Err("filePath fora da pasta de downloads".into());
        }
        targets.push(p);
    }
    if let Some(did) = id {
        // Consome eventual intenção pendente (processo já morto).
        let _ = take_cleanup_intent(&did);
        if let Some(remembered) = forget_download_paths(&did) {
            for rp in remembered {
                let p = PathBuf::from(rp);
                if p.parent() == Some(downloads.as_path()) && !targets.contains(&p) {
                    targets.push(p);
                }
            }
        }
    }
    let mut cleaned = 0u32;
    for t in &targets {
        cleaned += remove_temp_variants(t);
    }
    Ok(serde_json::json!({ "success": true, "cleaned": cleaned }))
}

/// `ytdlp_cleanup` no Android: mesma lógica, restrita à pasta do app.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn ytdlp_cleanup(
    app: AppHandle,
    id: Option<String>,
    #[allow(non_snake_case)] filePath: Option<String>,
) -> Result<serde_json::Value, String> {
    if id.is_none() && filePath.is_none() {
        return Err("Nenhum id ou filePath fornecido para limpeza".into());
    }
    let downloads = crate::mobile_ytdlp::downloads_dir(&app).await?;
    let mut targets: Vec<PathBuf> = Vec::new();
    if let Some(fp) = filePath {
        let p = PathBuf::from(fp.trim().trim_matches(|c| c == '\'' || c == '"'));
        if p.parent() != Some(downloads.as_path()) {
            return Err("filePath fora da pasta de downloads".into());
        }
        targets.push(p);
    }
    if let Some(did) = id {
        let _ = take_cleanup_intent(&did);
        if let Some(remembered) = forget_download_paths(&did) {
            for rp in remembered {
                let p = PathBuf::from(rp);
                if p.parent() == Some(downloads.as_path()) && !targets.contains(&p) {
                    targets.push(p);
                }
            }
        }
    }
    let mut cleaned = 0u32;
    for t in &targets {
        cleaned += remove_temp_variants(t);
    }
    Ok(serde_json::json!({ "success": true, "cleaned": cleaned }))
}

// --- Structs e helpers ---

#[derive(Debug, Clone, serde::Serialize)]
pub struct ParsedProgress {
    pub percent: f64,
    pub speed: f64,
    pub eta: f64,
    pub downloaded: u64,
    pub total: u64,
}

fn parse_speed_str(s: &str) -> f64 {
    let s = s.trim();
    if let Some(val) = s.strip_suffix("GiB/s") {
        val.trim().parse::<f64>().unwrap_or(0.0) * 1024.0 * 1024.0 * 1024.0
    } else if let Some(val) = s.strip_suffix("MiB/s") {
        val.trim().parse::<f64>().unwrap_or(0.0) * 1024.0 * 1024.0
    } else if let Some(val) = s.strip_suffix("KiB/s") {
        val.trim().parse::<f64>().unwrap_or(0.0) * 1024.0
    } else if let Some(val) = s.strip_suffix("B/s") {
        val.trim().parse::<f64>().unwrap_or(0.0)
    } else {
        0.0
    }
}

fn parse_eta_str(s: &str) -> f64 {
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() == 2 {
        let m = parts[0].parse::<f64>().unwrap_or(0.0);
        let sec = parts[1].parse::<f64>().unwrap_or(0.0);
        m * 60.0 + sec
    } else if parts.len() == 3 {
        let h = parts[0].parse::<f64>().unwrap_or(0.0);
        let m = parts[1].parse::<f64>().unwrap_or(0.0);
        let sec = parts[2].parse::<f64>().unwrap_or(0.0);
        h * 3600.0 + m * 60.0 + sec
    } else {
        0.0
    }
}

/// Parse progress templates: LF_PROG:... ou download:... ou genérico com |
pub fn parse_progress(line: &str) -> Option<ParsedProgress> {
    let payload = if let Some(rest) = line.strip_prefix("LF_PROG:") {
        rest
    } else if let Some(rest) = line.strip_prefix("download:LF_PROG:") {
        rest
    } else if let Some(rest) = line.strip_prefix("download:") {
        rest
    } else if line.contains('|') && (line.contains('%') || line.contains("MiB/s") || line.contains("KiB/s")) {
        line
    } else {
        return None;
    };

    let parts: Vec<&str> = payload.split('|').collect();
    if parts.is_empty() {
        return None;
    }

    let pct_str = parts[0].trim().trim_end_matches('%').trim();
    let percent = pct_str.parse::<f64>().unwrap_or(0.0);

    let speed = if parts.len() > 1 {
        let s = parts[1].trim();
        if s == "NA" || s == "Unknown" {
            0.0
        } else if let Ok(val) = s.parse::<f64>() {
            val
        } else {
            parse_speed_str(s)
        }
    } else {
        0.0
    };

    let eta = if parts.len() > 2 {
        let s = parts[2].trim();
        if s == "NA" || s == "Unknown" {
            0.0
        } else if let Ok(val) = s.parse::<f64>() {
            val
        } else {
            parse_eta_str(s)
        }
    } else {
        0.0
    };

    let downloaded = if parts.len() > 3 {
        parts[3].trim().parse::<u64>().unwrap_or(0)
    } else {
        0
    };

    let total = if parts.len() > 4 {
        parts[4].trim().parse::<u64>().unwrap_or(0)
    } else {
        0
    };

    Some(ParsedProgress {
        percent,
        speed,
        eta,
        downloaded,
        total,
    })
}

/// Linha `[info] Writing video subtitles to: /path` (GAP2: com recorte, o
/// sidecar cobre o vídeo inteiro — avisar, pois o corte só atinge o vídeo).
pub fn parse_subtitle_path(line: &str) -> Option<String> {
    if let Some(idx) = line.find("Writing video subtitles to: ") {
        return Some(line[idx + "Writing video subtitles to: ".len()..].trim().to_owned());
    }
    None
}

/// Linha `Destination: /path`.
pub fn parse_destination(line: &str) -> Option<String> {
    if let Some(idx) = line.find("Destination: ") {
        return Some(line[idx + "Destination: ".len()..].trim().to_owned());
    }
    None
}

/// Linha `Merging formats into "..."`.
pub fn parse_merge(line: &str) -> Option<String> {
    let p = "Merging formats into \"";
    if let Some(idx) = line.find(p) {
        let rest = &line[idx + p.len()..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_owned());
        }
    }
    None
}

/// Encontra o arquivo mais recente no diretório de downloads,
/// ignorando artefatos temporários (`.part`, `.ytdl`, `.cuttmp.*`, `-Frag*`).
pub fn latest_downloaded_file(output_dir: &Path) -> Option<String> {
    let entries = match std::fs::read_dir(output_dir) {
        Ok(r) => r.flatten().filter_map(|e| Some(e.path())).collect::<Vec<PathBuf>>(),
        Err(_) => return None,
    };
    let mut latest: Option<(SystemTime, PathBuf)> = None;
    for e in entries {
        if let Some(name) = e.file_name().and_then(|s| s.to_str()) {
            if is_temp_artifact_name(name) {
                continue;
            }
        }
        let m = match e.metadata() { Ok(m)=>m, Err(_)=>continue };
        if let Some(t) = m.modified().ok() {
            if latest.as_ref().map_or(true, |(lt,_)| t > *lt) {
                latest = Some((t, e));
            }
        }
    }
    latest.map(|(_,p)| p.to_string_lossy().into_owned())
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_error_drops_ffmpeg_progress_noise() {
        let stderr = "frame=  100 fps=112 q=-1.0 size= 1000KiB time=00:00:05.00 bitrate=1500kbits/s speed=1.8x\n\
            elapsed=0:00:05.00 frame=100 fps=112 q=-1.0\n\
            [info] downloading\n\
            ERROR: Postprocessing: Something broke badly\n";
        let msg = clean_error_message(stderr);
        assert!(!msg.contains("frame="), "{msg}");
        assert!(msg.contains("Something broke badly"), "{msg}");
    }

    #[test]
    fn clean_error_falls_back_when_only_noise() {
        let stderr = "frame= 1 fps=1 q=-1.0\nsize= 10KiB time=00:00:01.00\n";
        let msg = clean_error_message(stderr);
        assert!(!msg.is_empty());
    }

    #[test]
    fn clean_error_splits_cr_joined_ffmpeg_noise() {
        // ffmpeg com stderr em pipe separa updates de status com `\r`: sem
        // split, tudo vira uma mega-linha e a causa real se perde (ou o ruído
        // vaza inteiro como "mensagem de erro").
        let stderr = "frame=  100 fps=112 q=-1.0 size= 1000KiB time=00:00:05.00 bitrate=1500kbits/s speed=1.8x\r\
            frame=  200 fps=115 q=-1.0 size= 2000KiB time=00:00:10.00 bitrate=1600kbits/s speed=1.9x\r\
            [https @ 0x1] HTTP error 403 Forbidden\n\
            Error opening input files: Server returned 403 Forbidden (access denied)\n\
            ERROR: ffmpeg exited with code 8\n";
        let msg = clean_error_message(stderr);
        assert!(!msg.contains("frame="), "{msg}");
        assert!(!msg.contains("bitrate="), "{msg}");
        assert!(msg.contains("403 Forbidden"), "{msg}");
    }

    #[test]
    fn clean_error_all_noise_falls_back_to_short_segment() {
        let stderr = "frame= 1 fps=1 q=-1.0 size= 10KiB time=00:00:01.00 bitrate=9kbits/s speed=1x\rframe= 2 fps=1 q=-1.0 size= 20KiB time=00:00:02.00";
        let msg = clean_error_message(stderr);
        assert!(!msg.contains('\r'), "{msg}");
        assert!(msg.chars().count() <= 500, "{msg}");
    }

    #[test]
    fn parse_section_range_formats() {
        assert_eq!(
            parse_section_range("*01:00-02:00"),
            Some((Some(60.0), Some(120.0)))
        );
        assert_eq!(
            parse_section_range("*1:02:03-2:00:00"),
            Some((Some(3723.0), Some(7200.0)))
        );
        assert_eq!(parse_section_range("*01:00-"), Some((Some(60.0), None)));
        assert_eq!(parse_section_range("*-02:00"), Some((None, Some(120.0))));
        // Degenerados: sem range útil → None (entrega arquivo cheio)
        assert_eq!(parse_section_range("*00:00-00:00"), None);
        assert_eq!(parse_section_range("*02:00-01:00"), None);
        assert_eq!(parse_section_range(""), None);
        assert_eq!(parse_section_range("*abc-def"), None);
    }

    #[test]
    fn temp_artifact_names_detected() {
        for n in [
            "video.mp4.part",
            "video.mp4.part-Frag12",
            "video.mp4-Frag3.part",
            "video.mp4.ytdl",
            "video.mp4.temp",
            "video.mp4.tmp",
            "yt-dlp.new",
            "video.mp4.cuttmp.mp4",
        ] {
            assert!(is_temp_artifact_name(n), "{n}");
        }
        for n in [
            "video.mp4",
            "audio.mp3",
            "subs.pt.srt",
            "thumb.webp",
            "video (1).mp4",
            "infojson.info.json",
        ] {
            assert!(!is_temp_artifact_name(n), "{n}");
        }
    }

    fn unique_tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "linkfetcher-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn remove_temp_variants_keeps_final_and_siblings() {
        let dir = unique_tmp_dir("variants");
        let base = dir.join("video.mp4");
        std::fs::write(&base, b"final").unwrap();
        std::fs::write(dir.join("video.mp4.part"), b"p").unwrap();
        std::fs::write(dir.join("video.mp4.ytdl"), b"y").unwrap();
        std::fs::write(dir.join("video.mp4.cuttmp.mp4"), b"c").unwrap();
        std::fs::write(dir.join("video.mp4-Frag7.part"), b"f").unwrap();
        // Homônimo de outro download: intocado.
        std::fs::write(dir.join("video.mp4 (1)"), b"sibling").unwrap();

        let removed = remove_temp_variants(&base);
        assert_eq!(removed, 4);
        assert!(base.is_file());
        assert!(dir.join("video.mp4 (1)").is_file());
        assert!(!dir.join("video.mp4.part").exists());
        assert!(!dir.join("video.mp4.ytdl").exists());
        assert!(!dir.join("video.mp4.cuttmp.mp4").exists());
        assert!(!dir.join("video.mp4-Frag7.part").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn remove_temp_variants_handles_part_base() {
        let dir = unique_tmp_dir("partbase");
        let part = dir.join("video.mp4.part");
        std::fs::write(&part, b"p").unwrap();
        let removed = remove_temp_variants(&part);
        assert!(removed >= 1);
        assert!(!part.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn latest_ignores_part_files() {
        let dir = unique_tmp_dir("latest");
        let final_f = dir.join("show.mp4");
        std::fs::write(&final_f, b"v").unwrap();
        // .part mais novo que o final: não pode ser eleito.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("other.mp4.part"), b"p").unwrap();
        let got = latest_downloaded_file(&dir).unwrap();
        assert!(got.ends_with("show.mp4"), "{got}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cover_host_blocklist() {
        // Públicos passam.
        assert!(!cover_host_blocked("https://i.ytimg.com/vi/x/hqdefault.jpg"));
        assert!(!cover_host_blocked("https://cdn.example.com/a.png?w=100"));
        // Metadata, localhost, IP literal e IPv6 nunca passam.
        assert!(cover_host_blocked("http://169.254.169.254/latest/meta-data"));
        assert!(cover_host_blocked("https://169.254.169.254/x.jpg"));
        assert!(cover_host_blocked("http://127.0.0.1:8080/x.jpg"));
        assert!(cover_host_blocked("https://localhost/x.jpg"));
        assert!(cover_host_blocked("https://localhost./x.jpg"));
        assert!(cover_host_blocked("https://[::1]/x.jpg"));
        assert!(cover_host_blocked("https://user:pass@10.0.0.1/x.jpg"));
        // Esquema barrado à parte (só https passa): host público não é block.
        assert!(!cover_host_blocked("ftp://cdn.example.com/x.jpg"));
        assert!(cover_host_blocked("not-a-url"));
    }

    #[test]
    fn cover_ext_from_content_type() {
        assert_eq!(content_type_ext("image/jpeg"), Some("jpg"));
        assert_eq!(content_type_ext("image/jpeg; charset=binary"), Some("jpg"));
        assert_eq!(content_type_ext("IMAGE/PNG"), Some("png"));
        assert_eq!(content_type_ext("image/webp"), Some("webp"));
        assert_eq!(content_type_ext("image/gif"), Some("gif"));
        assert_eq!(content_type_ext("text/html"), None);
        assert_eq!(content_type_ext(""), None);
    }

    #[test]
    fn cover_ext_from_url_path() {
        assert_eq!(
            url_path_ext("https://i.ytimg.com/vi/x/hqdefault.jpg"),
            Some("jpg".to_owned())
        );
        assert_eq!(
            url_path_ext("https://cdn/a.PNG?w=100#frag"),
            Some("png".to_owned())
        );
        assert_eq!(
            url_path_ext("https://cdn/a.JPEG"),
            Some("jpg".to_owned())
        );
        assert_eq!(url_path_ext("https://cdn/noext"), None);
        assert_eq!(url_path_ext("https://cdn/a.toolongext"), None);
    }

    #[test]
    fn subtitle_path_parsing() {
        assert_eq!(
            parse_subtitle_path("[info] Writing video subtitles to: /dl/v.en.srt"),
            Some("/dl/v.en.srt".to_owned())
        );
        assert_eq!(parse_subtitle_path("[download] Destination: /dl/v.mp4"), None);
        assert_eq!(parse_subtitle_path(""), None);
    }

    #[test]
    fn sub_flags_stripped_keeping_rest() {
        let argv = vec![
            "--format".to_owned(),
            "best".to_owned(),
            "--write-subs".to_owned(),
            "--write-auto-subs".to_owned(),
            "--sub-langs".to_owned(),
            "en".to_owned(),
            "--sub-format".to_owned(),
            "srt".to_owned(),
            "--embed-subs".to_owned(),
            "--concurrent-fragments".to_owned(),
            "8".to_owned(),
            "https://x/y".to_owned(),
        ];
        assert_eq!(
            strip_sub_flags(argv),
            vec![
                "--format",
                "best",
                "--concurrent-fragments",
                "8",
                "https://x/y",
            ]
        );
    }

    #[test]
    fn subs_retry_eligibility() {
        use crate::ytdlp::args::DownloadParams;
        let with_subs = DownloadParams {
            write_subs: Some(true),
            ..Default::default()
        };
        // Falha citando legenda + saída natural + 1ª vez → elegível.
        assert!(should_retry_without_subs(
            &with_subs,
            "unable to download video subtitles for 'en': http error 429",
            Some(1),
        ));
        // Sem citar legenda (falha do vídeo) → não.
        assert!(!should_retry_without_subs(&with_subs, "http error 429", Some(1)));
        // Kill (sem código) → não.
        assert!(!should_retry_without_subs(
            &with_subs,
            "unable to download video subtitles for 'en'",
            None,
        ));
        // Sem legendas pedidas → não.
        assert!(!should_retry_without_subs(
            &DownloadParams::default(),
            "unable to download video subtitles for 'en'",
            Some(1),
        ));
        // Segunda vez (já com fallback) → não (evita loop).
        let second = DownloadParams {
            write_subs: Some(true),
            subs_fallback: Some("x".into()),
            ..Default::default()
        };
        assert!(!should_retry_without_subs(
            &second,
            "unable to download video subtitles for 'en'",
            Some(1),
        ));
    }
}
