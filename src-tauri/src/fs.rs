//! utilitários de filesystem e download para o Tauri.
//! Todos os comandos Tauri estão aqui para evitar conflitos de namespace
//! com o macro `generate_handler!`.

use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::SystemTime;
use tokio::process::Child;
use tokio::io::AsyncReadExt;

use tauri::{AppHandle, Manager, Emitter};

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

/// Inicializar mapa via `tauri::State` (opcional, LazyLock já inicializa).
#[allow(dead_code)]
pub fn init_cancel_map(_state: std::sync::Mutex<CancelMap>) {
    // já inicializado via LazyLock; mantido para compat
}

/// Retorna o diretório de downloads do SO. Paridade `main.cjs:203`.
#[tauri::command]
pub fn fs_get_downloads_path(app: AppHandle) -> Result<String, String> {
    let p = app.path().download_dir().map_err(|e| format!("{:?}", e))?;
    Ok(p.to_string_lossy().into_owned())
}

/// `shell:openPath` — abre arquivo ou pasta no gerenciador de arquivos do SO.
/// Paridade `main.cjs:205-230`.
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

/// `shell:selectFolder` — abre diálogo para selecionar pasta.
/// Paridade `main.cjs:357-368`.
#[tauri::command]
pub async fn fs_select_folder(app: AppHandle, default_path: Option<String>) -> Result<Option<String>, String> {
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

/// `save-description` — salva arquivo de texto na pasta de downloads.
/// Paridade `main.cjs:335-355`.
#[tauri::command]
pub async fn fs_save_description(
    app: AppHandle,
    filename: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let downloads = app.path().download_dir().map_err(|e| format!("{:?}", e))?;
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

/// `fs:stat` — retorna tamanho do arquivo.
/// Paridade `main.cjs:235-242`.
#[tauri::command]
pub async fn fs_stat(file_path: String) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(file_path.trim().trim_matches(|c| c == '\'' || c == '"'));
    match std::fs::metadata(&path) {
        Ok(meta) => Ok(serde_json::json!({ "size": meta.len() })),
        Err(_) => Ok(serde_json::json!({ "size": 0 })),
    }
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

/// `ytdlp_download` — spawna yt-dlp com argv canônico + ffmpeg se presente,
/// parseia stdout para progresso e arquivos gerados, aguarda o término do processo,
/// emite `yt-dlp-progress` events (compat Electron) + `binary-download`,
/// retorna caminho do arquivo baixado ou erro.
///
/// Recorte (`download_sections`): baixa o arquivo CHEIO pelo yt-dlp nativo
/// (rápido, progresso real, resume, cookies) e corta local com ffmpeg
/// (`-c copy`, segundos). NÃO repassa `--download-sections`: ele delegaria o
/// fetch ao ffmpeg remoto (1 conexão, sem cliente/cookies do yt-dlp → 403 e
/// lerdeza no YouTube, stdout mudo, sem resume).
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
            captured_filepath = Some(dest);
        } else if let Some(merged) = parse_merge(trimmed) {
            eprintln!("[ytdlp_download] captured merged file: {}", merged);
            captured_filepath = Some(merged);
        } else if trimmed.contains("has already been downloaded") {
            if let Some(start) = trimmed.find("[download] ") {
                if let Some(end) = trimmed.find(" has already been downloaded") {
                    let path = trimmed[start + 11..end].trim().to_owned();
                    eprintln!("[ytdlp_download] captured already downloaded file: {}", path);
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

            let complete_event = serde_json::json!({
                "id": download_id,
                "type": "complete",
                "filePath": final_path,
                "size": size,
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

            Ok(final_path.unwrap_or_default())
        }
        Ok(status) => {
            let err_msg = if !stderr_output.trim().is_empty() {
                clean_error_message(&stderr_output)
            } else {
                format!("yt-dlp encerrou com status {:?}", status.code())
            };
            eprintln!("[ytdlp_download] Process failed: {}", err_msg);

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

/// `ytdlp_cancel` — cancela um download ativo via CancelMap.
/// Aceita { id: String }, { options: { id: String } } ou string direta.
#[tauri::command]
pub async fn ytdlp_cancel(
    options: Option<serde_json::Value>,
    params: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
    id: Option<String>,
) -> Result<(), String> {
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

    if let Some(child_arc) = unregister_cancel(&resolved_id) {
        let mut child = child_arc.lock().await;
        let _ = child.kill().await;
        eprintln!("[ytdlp_cancel] Cancelled download id={}", resolved_id);
        Ok(())
    } else {
        Err("Nenhum download ativo com esse id".into())
    }
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

/// Encontra o arquivo mais recente no diretório de downloads.
pub fn latest_downloaded_file(output_dir: &Path) -> Option<String> {
    let entries = match std::fs::read_dir(output_dir) {
        Ok(r) => r.flatten().filter_map(|e| Some(e.path())).collect::<Vec<PathBuf>>(),
        Err(_) => return None,
    };
    let _ext: [&str; 12] = ["mp4", "webm", "mkv", "mp3", "m4a", "wav", "ogg", "jpg", "jpeg", "png", "gif", "webp"];
    let mut latest: Option<(SystemTime, PathBuf)> = None;
    for e in entries {
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
}
