//! Resolução e auto-download de yt-dlp + ffmpeg.
//! Contrato: docs/reference/media-binaries.md (zero-config, SHA + rename atômico).
//!
//! Pins verificados em 2026-09-18 (Step 1 do plano):
//! - yt-dlp tag fixa `2026.08.19` (release imutável; verificado no SHA2-512SUMS).
//! - BtbN só publica a tag rolante `latest` → ffmpeg confere no checksums.sha256
//!   da hora (pins só de fallback; re-pin não trava mais release).

use std::path::{Path, PathBuf};
use sha2::Digest;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

const YTDLP_TAG: &str = "2026.08.19";
const FFMPEG_TAG: &str = "latest";
#[cfg(target_os = "windows")]
const FFMPEG_WIN_SHA256: &str =
    "3fb73caf23f562bffb1db4c1218c7f3a8c9e6346b55d95a7d5d223b8afab802d";
#[cfg(not(target_os = "windows"))]
const FFMPEG_LINUX_SHA256: &str =
    "073a09ba3e17535ef2233e655f3b3517268745ce42108dee97b00607b1d1a35e";

#[cfg(target_os = "windows")]
const YTDLP_ASSET: &str = "yt-dlp.exe";
#[cfg(not(target_os = "windows"))]
const YTDLP_ASSET: &str = "yt-dlp_linux";
#[cfg(target_os = "windows")]
const FFMPEG_ASSET: &str = "ffmpeg-n8.1-latest-win64-gpl-8.1.zip";
#[cfg(not(target_os = "windows"))]
const FFMPEG_ASSET: &str = "ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz";

#[cfg(target_os = "windows")]
const YTDLP_BIN: &str = "yt-dlp.exe";
#[cfg(not(target_os = "windows"))]
const YTDLP_BIN: &str = "yt-dlp";
#[cfg(target_os = "windows")]
const FFMPEG_BIN: &str = "ffmpeg.exe";
#[cfg(not(target_os = "windows"))]
const FFMPEG_BIN: &str = "ffmpeg";
#[cfg(target_os = "windows")]
const FFPROBE_BIN: &str = "ffprobe.exe";
#[cfg(not(target_os = "windows"))]
const FFPROBE_BIN: &str = "ffprobe";

// Tamanhos do release imutável yt-dlp 2026.08.19 (checagem de tamanho do reference).
#[cfg(target_os = "windows")]
const YTDLP_EXPECTED_SIZE: u64 = 17_840_399;
#[cfg(not(target_os = "windows"))]
const YTDLP_EXPECTED_SIZE: u64 = 40_446_224;

/// Teto anti-exaustão de disco durante o streaming (ffmpeg ~195 MB; folga 3x).
const MAX_BYTES: u64 = 600 * 1024 * 1024;

const ALLOWED_HOSTS: &[&str] = &[
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

#[derive(Clone, serde::Serialize)]
struct BinaryProgress {
    stage: &'static str, // "progress" | "done" | "error"
    file: &'static str,  // "yt-dlp" | "ffmpeg"
    received: u64,
    total: u64,
    percent: u8,
    note: Option<String>,
    error: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinStatus {
    pub ready: bool,
    pub missing: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binary_path: Option<String>,
}

pub fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("LINKFETCHER_BIN_DIR") {
        let dir = PathBuf::from(p);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(dir);
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("bin");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn env_override(name: &str) -> Option<PathBuf> {
    std::env::var(name).ok().map(PathBuf::from).filter(|p| p.is_file())
}

pub fn ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(p) = env_override("YTDLP_PATH") {
        return Ok(p);
    }
    Ok(bin_dir(app)?.join(YTDLP_BIN))
}

pub fn ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(p) = env_override("FFMPEG_PATH") {
        return Ok(p);
    }
    Ok(bin_dir(app)?.join(FFMPEG_BIN))
}

/// ffprobe precisa estar ao lado do ffmpeg: o yt-dlp o descobre no mesmo
/// diretório e o usa em SponsorBlock/capítulos/thumbnail (sem ele:
/// "Unable to determine video duration: ffprobe not found").
pub fn ffprobe_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(p) = env_override("FFPROBE_PATH") {
        return Ok(p);
    }
    Ok(bin_dir(app)?.join(FFPROBE_BIN))
}

/// `ytdlp_status` — `{ready, missing, binaryPath}` (superconjunto do contrato do
/// overlay `{ready}`, do reference `{ready, missing}` e do spec `{ready, binaryPath}`).
#[tauri::command]
pub async fn ytdlp_status(app: AppHandle) -> Result<BinStatus, String> {
    let ytdlp = ytdlp_path(&app)?;
    let ffmpeg = ffmpeg_path(&app)?;
    let ffprobe = ffprobe_path(&app)?;
    let mut missing = Vec::new();
    if !ytdlp.is_file() {
        missing.push("yt-dlp".to_owned());
    }
    if !ffmpeg.is_file() {
        missing.push("ffmpeg".to_owned());
    }
    if !ffprobe.is_file() {
        missing.push("ffprobe".to_owned());
    }
    Ok(BinStatus {
        ready: missing.is_empty(),
        missing,
        binary_path: Some(ytdlp.to_string_lossy().into_owned()),
    })
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("LinkFetcher-setup")
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let host_ok = attempt.url().host_str().is_some_and(|h| {
                ALLOWED_HOSTS
                    .iter()
                    .any(|a| h == *a || h.ends_with(&format!(".{a}")))
            });
            if host_ok && attempt.previous().len() < 10 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

fn emit_progress(
    app: &AppHandle,
    stage: &'static str,
    file: &'static str,
    received: u64,
    total: u64,
    note: Option<&str>,
    error: Option<String>,
) {
    let percent = if total > 0 {
        (received as u128 * 100 / total as u128).min(100) as u8
    } else {
        0
    };
    let _ = app.emit(
        "binary-download",
        BinaryProgress {
            stage,
            file,
            received,
            total,
            percent,
            note: note.map(|s| s.to_owned()),
            error,
        },
    );
}

/// Download com progresso via evento `binary-download`; grava em `.part`.
/// Se `hasher` for Some, alimenta o SHA-256 incremental por chunk (evita
/// reler o arquivo inteiro depois só para conferir integridade).
/// Retoma (HTTP Range) de `.part` parcial: o hash existente é recalculado
/// do prefixo em disco antes de continuar, então o digest final cobre o
/// arquivo inteiro. Servidor sem Range → recomeça do zero (hash zerado).
async fn download_streamed(
    client: &reqwest::Client,
    app: &AppHandle,
    file: &'static str,
    url: &str,
    part: &Path,
    mut hasher: Option<&mut sha2::Sha256>,
) -> Result<u64, String> {
    // Prefixo já baixado (tentativa anterior interrompida).
    let mut resume_from: u64 = 0;
    if part.is_file() {
        resume_from = std::fs::metadata(part).map(|m| m.len()).unwrap_or(0);
        if resume_from > 0 {
            if let Some(h) = hasher.as_deref_mut() {
                let mut f = std::fs::File::open(part).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut *h).map_err(|e| e.to_string())?;
            }
        }
    }
    let mut req = client.get(url);
    if resume_from > 0 {
        req = req.header("Range", format!("bytes={resume_from}-"));
    }
    let mut resp = req.send().await.map_err(|e| format!("download {file}: {e}"))?;
    // 416 = o .part já está completo; 200 com Range = servidor ignorou → recomeça.
    if resp.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        return Ok(resume_from);
    }
    if !resp.status().is_success() {
        return Err(format!("download {file}: HTTP {}", resp.status()));
    }
    let resumed = resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let (received_start, open_resume) = if resumed {
        (resume_from, true)
    } else {
        if resume_from > 0 {
            // Servidor ignorou o Range: descarta prefixo e zera o hash.
            let _ = std::fs::remove_file(part);
            if let Some(h) = hasher.as_deref_mut() {
                *h = sha2::Sha256::new();
            }
        }
        (0, false)
    };
    let total = resp.content_length().unwrap_or(0) + if resumed { resume_from } else { 0 };
    if total > MAX_BYTES {
        return Err(format!("download {file}: {total} bytes acima do limite"));
    }
    let mut open_opts = tokio::fs::OpenOptions::new();
    open_opts.create(true).write(true);
    if open_resume {
        open_opts.append(true);
    } else {
        open_opts.truncate(true);
    }
    let mut out = open_opts.open(part).await.map_err(|e| e.to_string())?;
    let mut received: u64 = received_start;
    let mut last_percent: u8 = u8::MAX;
    emit_progress(app, "progress", file, received, total, None, None);
    loop {
        match resp.chunk().await.map_err(|e| format!("download {file}: {e}"))? {
            Some(bytes) => {
                received += bytes.len() as u64;
                if received > MAX_BYTES {
                    drop(out);
                    let _ = std::fs::remove_file(part);
                    return Err(format!("download {file}: acima do limite"));
                }
                if let Some(h) = hasher.as_deref_mut() {
                    h.update(&bytes);
                }
                out.write_all(&bytes)
                    .await
                    .map_err(|e| e.to_string())?;
                let percent = if total > 0 {
                    (received as u128 * 100 / total as u128).min(100) as u8
                } else {
                    0
                };
                if percent != last_percent {
                    last_percent = percent;
                    emit_progress(app, "progress", file, received, total, None, None);
                }
            }
            None => break,
        }
    }
    out.flush().await.map_err(|e| e.to_string())?;
    drop(out);
    Ok(received)
}

fn sha512_file(path: &Path) -> Result<String, String> {
    use sha2::Digest;
    let mut hasher = sha2::Sha512::new();
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    std::io::copy(&mut f, &mut hasher).map_err(|e| e.to_string())?;
    Ok(hex::encode(hasher.finalize()))
}

/// Extrai o hash do asset de um arquivo de somas estilo GNU (`<hex> [*]<nome>`).
fn parse_sums(text: &str, asset: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let mut it = line.split_whitespace();
        let hash = it.next()?;
        let name = it.next()?.trim_start_matches('*');
        if name == asset || name.ends_with(&format!("/{asset}")) {
            Some(hash.to_owned())
        } else {
            None
        }
    })
}

/// SHA pinado: fallback se o checksums publicado não vier. Pode envelhecer
/// (tag rolante) — o caminho primário é sempre a lista da hora.
#[cfg(target_os = "windows")]
fn pinned_ffmpeg_sha() -> &'static str {
    FFMPEG_WIN_SHA256
}

/// SHA pinado: fallback se o checksums publicado não vier. Pode envelhecer
/// (tag rolante) — o caminho primário é sempre a lista da hora.
#[cfg(not(target_os = "windows"))]
fn pinned_ffmpeg_sha() -> &'static str {
    FFMPEG_LINUX_SHA256
}

#[cfg(unix)]
fn make_executable(p: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(p)
        .map_err(|e| e.to_string())?
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(p, perms).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(unix))]
fn make_executable(_p: &Path) -> Result<(), String> {
    Ok(())
}

async fn smoke(bin: &Path, file: &str) -> Result<(), String> {
    // ffmpeg/ffprobe documentam `-version`; yt-dlp documenta `--version`.
    let flag = if file == "ffmpeg" || file == "ffprobe" {
        "-version"
    } else {
        "--version"
    };
    let out = tokio::process::Command::new(bin)
        .arg(flag)
        .output()
        .await
        .map_err(|e| format!("smoke {file}: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "smoke {file}: {}",
            String::from_utf8_lossy(&out.stderr)
        ))
    }
}

async fn ensure_ytdlp(client: &reqwest::Client, app: &AppHandle) -> Result<PathBuf, String> {
    let dest = ytdlp_path(app)?;
    // Cache válido: smoke passa → sem rede na segunda abertura.
    if dest.is_file() {
        if smoke(&dest, "yt-dlp").await.is_ok() {
            emit_progress(app, "done", "yt-dlp", 1, 1, None, None);
            return Ok(dest);
        }
        let _ = std::fs::remove_file(&dest);
    }
    let url = format!(
        "https://github.com/yt-dlp/yt-dlp/releases/download/{YTDLP_TAG}/{YTDLP_ASSET}"
    );
    let part = dest.with_extension("part");
    let fail = |e: String| {
        let _ = std::fs::remove_file(&part);
        e
    };
    let received = download_streamed(client, app, "yt-dlp", &url, &part, None)
        .await
        .map_err(fail)?;
    if received != YTDLP_EXPECTED_SIZE {
        return Err(fail(format!(
            "yt-dlp: tamanho {received} != esperado {YTDLP_EXPECTED_SIZE}"
        )));
    }
    // SHA-512 contra o SHA2-512SUMS do próprio release (disciplina do reference).
    emit_progress(app, "progress", "yt-dlp", received, received, Some("Verificando integridade do yt-dlp…"), None);
    let sums_url = format!(
        "https://github.com/yt-dlp/yt-dlp/releases/download/{YTDLP_TAG}/SHA2-512SUMS"
    );
    let sums = client
        .get(&sums_url)
        .send()
        .await
        .map_err(|e| fail(format!("yt-dlp sums: {e}")))?
        .text()
        .await
        .map_err(|e| fail(format!("yt-dlp sums: {e}")))?;
    let expected = parse_sums(&sums, YTDLP_ASSET)
        .ok_or_else(|| fail(format!("yt-dlp: {YTDLP_ASSET} ausente no SHA2-512SUMS")))?;
    let actual = sha512_file(&part).map_err(fail)?;
    if actual != expected.to_lowercase() {
        return Err(fail("yt-dlp: SHA-512 não confere".into()));
    }
    std::fs::rename(&part, &dest).map_err(|e| e.to_string())?;
    make_executable(&dest)?;
    emit_progress(app, "progress", "yt-dlp", received, received, Some("Testando yt-dlp…"), None);
    smoke(&dest, "yt-dlp").await?;
    let total = dest.metadata().map_err(|e| e.to_string())?.len();
    emit_progress(app, "done", "yt-dlp", total, total, None, None);
    Ok(dest)
}

#[cfg(target_os = "windows")]
fn install_ffmpeg(
    part: &Path,
    ffmpeg_dest: &Path,
    ffprobe_dest: &Path,
    _app: &AppHandle,
    _total: u64,
) -> Result<(), String> {
    let file = std::fs::File::open(part).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut got_ffmpeg = false;
    let mut got_probe = false;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let dest = if name.ends_with("bin/ffmpeg.exe") {
            got_ffmpeg = true;
            Some(ffmpeg_dest)
        } else if name.ends_with("bin/ffprobe.exe") {
            got_probe = true;
            Some(ffprobe_dest)
        } else {
            None
        };
        if let Some(d) = dest {
            let mut out = std::fs::File::create(d).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
        if got_ffmpeg && got_probe {
            break;
        }
    }
    if !got_ffmpeg {
        return Err("ffmpeg.exe não encontrado no zip".into());
    }
    if !got_probe {
        return Err("ffprobe.exe não encontrado no zip".into());
    }
    Ok(())
}

/// Reader que conta bytes e emite progresso (fase de extração, onde o
/// percentual do download já está em 100%).
struct ProgressReader<R> {
    inner: R,
    app: AppHandle,
    total: u64,
    read: u64,
    last_percent: u8,
}

impl<R: std::io::Read> std::io::Read for ProgressReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.read += n as u64;
        let percent = if self.total > 0 {
            (self.read as u128 * 100 / self.total as u128).min(100) as u8
        } else {
            0
        };
        if percent != self.last_percent {
            self.last_percent = percent;
            emit_progress(
                &self.app,
                "progress",
                "ffmpeg",
                self.read,
                self.total,
                Some("Extraindo ffmpeg…"),
                None,
            );
        }
        Ok(n)
    }
}

impl<R: std::io::BufRead> std::io::BufRead for ProgressReader<R> {
    fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
        self.inner.fill_buf()
    }

    fn consume(&mut self, amt: usize) {
        self.inner.consume(amt)
    }
}

#[cfg(not(target_os = "windows"))]
fn install_ffmpeg(
    part: &Path,
    ffmpeg_dest: &Path,
    ffprobe_dest: &Path,
    app: &AppHandle,
    total: u64,
) -> Result<(), String> {
    // Stream direto xz → tar (xz2/liblzma em C + sem .tar temporário de
    // ~500 MB): menos ~1 GB de IO em disco e decode multix mais rápido.
    // Progresso real pelos bytes de entrada lidos.
    let src = match std::fs::File::open(part) {
        Ok(f) => f,
        Err(e) => return Err(e.to_string()),
    };
    let reader = ProgressReader {
        inner: std::io::BufReader::new(src),
        app: app.clone(),
        total,
        read: 0,
        last_percent: u8::MAX,
    };
    let decoder = xz2::read::XzDecoder::new(reader);
    let mut archive = tar::Archive::new(decoder);
    let mut got_ffmpeg = false;
    let mut got_probe = false;
    let entries = match archive.entries() {
        Ok(e) => e,
        Err(e) => return Err(e.to_string()),
    };
    for entry in entries {
        let mut entry = match entry {
            Ok(e) => e,
            Err(e) => return Err(e.to_string()),
        };
        let name = match entry.path() {
            Ok(p) => p.to_string_lossy().into_owned(),
            Err(e) => return Err(e.to_string()),
        };
        let dest = if name.ends_with("bin/ffmpeg") {
            got_ffmpeg = true;
            Some(ffmpeg_dest)
        } else if name.ends_with("bin/ffprobe") {
            got_probe = true;
            Some(ffprobe_dest)
        } else {
            None
        };
        if let Some(d) = dest {
            if let Err(e) = entry.unpack(d) {
                return Err(e.to_string());
            }
        }
        if got_ffmpeg && got_probe {
            break;
        }
    }
    if !got_ffmpeg {
        return Err("bin/ffmpeg não encontrado no tar.xz".into());
    }
    if !got_probe {
        return Err("bin/ffprobe não encontrado no tar.xz".into());
    }
    Ok(())
}

async fn ensure_ffmpeg(client: &reqwest::Client, app: &AppHandle) -> Result<PathBuf, String> {
    let dest = ffmpeg_path(app)?;
    let probe_dest = ffprobe_path(app)?;
    if dest.is_file() && probe_dest.is_file() {
        if smoke(&dest, "ffmpeg").await.is_ok() && smoke(&probe_dest, "ffprobe").await.is_ok() {
            let total = dest.metadata().map_err(|e| e.to_string())?.len();
            emit_progress(app, "done", "ffmpeg", total, total, None, None);
            return Ok(dest);
        }
        let _ = std::fs::remove_file(&dest);
        let _ = std::fs::remove_file(&probe_dest);
    }
    let url = format!(
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/{FFMPEG_TAG}/{FFMPEG_ASSET}"
    );
    let part = dest.with_extension("part");
    let fail = |e: String| {
        let _ = std::fs::remove_file(&part);
        e
    };
    // Tag `latest` é rolante: integridade via SHA-256 pinado (sem tamanho exato).
    // O hash é alimentado durante o download — sem reler os ~150 MB depois.
    let mut hasher = sha2::Sha256::new();
    let received = download_streamed(client, app, "ffmpeg", &url, &part, Some(&mut hasher))
        .await
        .map_err(fail)?;
    emit_progress(app, "progress", "ffmpeg", received, received, Some("Verificando integridade do ffmpeg…"), None);
    // Tag `latest` é rolante: confere contra o checksums.sha256 publicado na
    // hora (mesma disciplina do SHA2-512SUMS do yt-dlp); pinado só de fallback
    // se a lista não vier — pin nunca mais trava release nova.
    let sums_url = format!(
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/{FFMPEG_TAG}/checksums.sha256"
    );
    let expected_sha: String = match client.get(&sums_url).send().await {
        Ok(resp) => match resp.text().await {
            Ok(text) => parse_sums(&text, FFMPEG_ASSET)
                .unwrap_or_else(|| pinned_ffmpeg_sha().to_owned()),
            Err(_) => pinned_ffmpeg_sha().to_owned(),
        },
        Err(_) => pinned_ffmpeg_sha().to_owned(),
    };
    let actual = hex::encode(hasher.finalize());
    if actual != expected_sha.to_lowercase() {
        return Err(fail("ffmpeg: SHA-256 não confere".into()));
    }
    // Extrai para temp + rename atômico pós-hash, como no reference.
    let tmp = dest.with_extension("new");
    let probe_tmp = probe_dest.with_extension("new");
    emit_progress(app, "progress", "ffmpeg", received, received, Some("Extraindo ffmpeg…"), None);
    install_ffmpeg(&part, &tmp, &probe_tmp, app, received).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(&probe_tmp);
        fail(e)
    })?;
    let _ = std::fs::remove_file(&part);
    make_executable(&tmp)?;
    make_executable(&probe_tmp)?;
    emit_progress(app, "progress", "ffmpeg", received, received, Some("Testando ffmpeg…"), None);
    smoke(&tmp, "ffmpeg").await.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(&probe_tmp);
        e
    })?;
    smoke(&probe_tmp, "ffprobe").await.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(&probe_tmp);
        e
    })?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    std::fs::rename(&probe_tmp, &probe_dest).map_err(|e| e.to_string())?;
    let total = dest.metadata().map_err(|e| e.to_string())?.len();
    emit_progress(app, "done", "ffmpeg", total, total, None, None);
    Ok(dest)
}

async fn ensure_binaries(app: &AppHandle) -> Result<(), String> {
    let client = build_client()?;
    // Sequencial: yt-dlp primeiro (pequeno, libera probe rápido), ffmpeg depois.
    ensure_ytdlp(&client, app).await?;
    ensure_ffmpeg(&client, app).await?;
    Ok(())
}

/// Trava anti-duplo: cliques repetidos / remontes colapsam numa única execução.
static ENSURE_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Dispara `ensure_binaries` em background e retorna na hora.
/// Progresso/erro chegam pelo evento `binary-download`. Usado pelo overlay.
#[tauri::command]
pub async fn ytdlp_ensure_binaries(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if ENSURE_RUNNING.swap(true, std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        if let Err(e) = ensure_binaries(&handle).await {
            let _ = handle.emit(
                "binary-download",
                BinaryProgress {
                    stage: "error",
                    file: "",
                    received: 0,
                    total: 0,
                    percent: 0,
                    note: None,
                    error: Some(e),
                },
            );
        }
        ENSURE_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sums_btbn_format() {
        let text = "469a44b4d951eae7e6f6b61858e948104d541a631322ef26efc5e17b3a521062  ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz\n\
            3fb73caf23f562bffb1db4c1218c7f3a8c9e6346b55d95a7d5d223b8afab802d *ffmpeg-n8.1-latest-win64-gpl-8.1.zip\n";
        assert_eq!(
            parse_sums(text, "ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz"),
            Some("469a44b4d951eae7e6f6b61858e948104d541a631322ef26efc5e17b3a521062".to_owned())
        );
        assert_eq!(
            parse_sums(text, "ffmpeg-n8.1-latest-win64-gpl-8.1.zip"),
            Some("3fb73caf23f562bffb1db4c1218c7f3a8c9e6346b55d95a7d5d223b8afab802d".to_owned())
        );
        assert_eq!(parse_sums(text, "inexistente.tar.xz"), None);
    }
}
