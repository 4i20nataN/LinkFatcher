//! Builder canônico de argv do yt-dlp — porte literal de
//! `YtDlpSpawn.ts:78-177` (spec §6). `DownloadEngine.buildArgs` (divergente,
//! congelado) NÃO é usado aqui.
//!
//! Flags verificadas contra o binário real yt-dlp 2026.08.19 (`--help`):
//! todas existem, exceto `--fps-max`, que o código converte para
//! `--format-sort fps:N` (nunca passado literalmente).

use std::path::Path;

const DEFAULT_FORMAT: &str = "bestvideo+bestaudio/best";

/// Template de progresso — `YtDlpSpawn.ts:85`. O parser de `download.rs`
/// depende deste formato exato (`download:<pct>|<speed>|<eta>`).
pub const PROGRESS_TEMPLATE: &str =
    "download:LF_PROG:%(progress._percent_str)s|%(progress.speed)s|%(progress.eta)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s";

/// Parâmetros do comando `ytdlp_download` — mesmos campos aceitos pelo
/// handler `electron/main.cjs:437-467` incluindo `id` para tracking.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadParams {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub audio_only: Option<bool>,
    #[serde(default)]
    pub audio_format: Option<String>,
    #[serde(default)]
    pub audio_quality: Option<String>,
    #[serde(default)]
    pub write_subs: Option<bool>,
    #[serde(default)]
    pub write_auto_subs: Option<bool>,
    #[serde(default)]
    pub sub_langs: Option<String>,
    #[serde(default)]
    pub sub_format: Option<String>,
    #[serde(default)]
    pub embed_subs: Option<bool>,
    #[serde(default)]
    pub write_thumbnail: Option<bool>,
    #[serde(default)]
    pub embed_thumbnail: Option<bool>,
    #[serde(default)]
    pub embed_metadata: Option<bool>,
    #[serde(default)]
    pub merge_output_format: Option<String>,
    #[serde(default)]
    pub restrict_filenames: Option<bool>,
    #[serde(default)]
    pub no_overwrites: Option<bool>,
    #[serde(default)]
    pub keep_video: Option<bool>,
    #[serde(default)]
    pub video_only: Option<bool>,
    #[serde(default)]
    pub download_sections: Option<String>,
    #[serde(default)]
    pub sponsorblock_remove: Option<String>,
    #[serde(default)]
    pub fps_max: Option<f64>,
    #[serde(default)]
    pub custom_filename: Option<String>,
    #[serde(default)]
    pub cookies_from_browser: Option<String>,
    #[serde(default)]
    pub normalize_audio: Option<bool>,
    #[serde(default)]
    pub video_sharpen: Option<String>,
    #[serde(default)]
    pub video_codec: Option<String>,
    #[serde(default)]
    pub band_limit: Option<f64>,
    #[serde(default)]
    pub concurrent_fragments: Option<f64>,
    #[serde(default)]
    pub retries: Option<f64>,
}

fn is_true(v: &Option<bool>) -> bool {
    v.unwrap_or(false)
}

fn non_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().filter(|s| !s.is_empty())
}

/// `String(n)` do TS: inteiro sem casa decimal.
fn fmt_num(n: f64) -> String {
    if n.fract() == 0.0 && n.is_finite() {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

fn is_digit(b: u8) -> bool {
    b.is_ascii_digit()
}

/// Substitui `d{1,2}:d{2}:d{2}` por `$1h$2m$3s` (todas as ocorrências,
/// como o `/g` de `sanitizeFilename`).
fn replace_hms(input: &str) -> String {
    let b = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < b.len() {
        let mut matched: Option<(usize, String)> = None;
        // Tenta o grupo inicial com 2 dígitos e depois com 1 (greedy + backtrack).
        for first_len in [2, 1] {
            if i + first_len + 6 > b.len() {
                continue;
            }
            let d1 = &b[i..i + first_len];
            if !d1.iter().all(|c| is_digit(*c)) {
                continue;
            }
            if b[i + first_len] != b':' {
                continue;
            }
            let d2 = &b[i + first_len + 1..i + first_len + 3];
            if !d2.iter().all(|c| is_digit(*c)) {
                continue;
            }
            if b[i + first_len + 3] != b':' {
                continue;
            }
            let d3 = &b[i + first_len + 4..i + first_len + 6];
            if !d3.iter().all(|c| is_digit(*c)) {
                continue;
            }
            let len = first_len + 6;
            matched = Some((
                len,
                format!(
                    "{}h{}m{}s",
                    &input[i..i + first_len],
                    &input[i + first_len + 1..i + first_len + 3],
                    &input[i + first_len + 4..i + first_len + 6]
                ),
            ));
            break;
        }
        if let Some((len, rep)) = matched {
            out.push_str(&rep);
            i += len;
        } else {
            out.push(b[i] as char);
            i += 1;
        }
    }
    out
}

/// Substitui `d{1,2}:d{2}` por `$1m$2s` (roda DEPOIS do hms, como no TS).
fn replace_ms(input: &str) -> String {
    let b = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < b.len() {
        let mut matched: Option<(usize, String)> = None;
        for first_len in [2, 1] {
            if i + first_len + 3 > b.len() {
                continue;
            }
            let d1 = &b[i..i + first_len];
            if !d1.iter().all(|c| is_digit(*c)) {
                continue;
            }
            if b[i + first_len] != b':' {
                continue;
            }
            let d2 = &b[i + first_len + 1..i + first_len + 3];
            if !d2.iter().all(|c| is_digit(*c)) {
                continue;
            }
            matched = Some((
                first_len + 3,
                format!(
                    "{}m{}s",
                    &input[i..i + first_len],
                    &input[i + first_len + 1..i + first_len + 3]
                ),
            ));
            break;
        }
        if let Some((len, rep)) = matched {
            out.push_str(&rep);
            i += len;
        } else {
            out.push(b[i] as char);
            i += 1;
        }
    }
    out
}

/// Substitui `d{1,4}/d{1,2}/d{1,4}` por `$1-$2-$3`.
fn replace_date(input: &str) -> String {
    let b = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < b.len() {
        let mut matched: Option<(usize, String)> = None;
        for l1 in (1..=4).rev() {
            for l2 in [2, 1] {
                for l3 in (1..=4).rev() {
                    let total = l1 + 1 + l2 + 1 + l3;
                    if i + total > b.len() {
                        continue;
                    }
                    let g1 = &b[i..i + l1];
                    let g2 = &b[i + l1 + 1..i + l1 + 1 + l2];
                    let g3 = &b[i + l1 + 1 + l2 + 1..i + total];
                    if !g1.iter().all(|c| is_digit(*c))
                        || !g2.iter().all(|c| is_digit(*c))
                        || !g3.iter().all(|c| is_digit(*c))
                    {
                        continue;
                    }
                    if b[i + l1] != b'/' || b[i + l1 + 1 + l2] != b'/' {
                        continue;
                    }
                    matched = Some((
                        total,
                        format!(
                            "{}-{}-{}",
                            &input[i..i + l1],
                            &input[i + l1 + 1..i + l1 + 1 + l2],
                            &input[i + l1 + 1 + l2 + 1..i + total]
                        ),
                    ));
                    break;
                }
                if matched.is_some() {
                    break;
                }
            }
            if matched.is_some() {
                break;
            }
        }
        if let Some((len, rep)) = matched {
            out.push_str(&rep);
            i += len;
        } else {
            out.push(b[i] as char);
            i += 1;
        }
    }
    out
}

/// Porte de `sanitizeFilename` (`YtDlpSpawn.ts:18-31`).
pub fn sanitize_filename(name: &str, strict: bool) -> String {
    let mut s = replace_hms(name);
    s = replace_ms(&s);
    s = replace_date(&s);
    s = s
        .chars()
        .map(|c| match c {
            ':' | '\\' | '|' | '*' | '?' | '<' | '>' | '"' => '_',
            '/' => '-',
            _ => c,
        })
        .collect();
    // A 4ª regra do TS (`/\\/g → _`) já foi absorvida acima.
    if strict {
        let mut t: String = s
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        // `/_+/g → _` + trim de `_` nas bordas.
        let mut u = String::with_capacity(t.len());
        let mut prev_underscore = false;
        for c in t.chars() {
            if c == '_' {
                if !prev_underscore {
                    u.push('_');
                }
                prev_underscore = true;
            } else {
                u.push(c);
                prev_underscore = false;
            }
        }
        t = u.trim_matches('_').to_owned();
        return t;
    }
    s
}

/// Transform `videoOnly` (`YtDlpSpawn.ts:90-97`): remove faixas de áudio do
/// seletor na mesma ordem das 4 substituições + fallback `bv*`.
fn video_only_format(format: &str) -> String {
    let mut f = format.to_owned();
    // `\+ba\[ext=\w+\]` → ''
    loop {
        let Some(start) = f.find("+ba[ext=") else {
            break;
        };
        let rest = &f[start + "+ba[ext=".len()..];
        let word_len = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
            .map(|c| c.len_utf8())
            .sum::<usize>();
        if rest[word_len..].starts_with(']') {
            f.replace_range(start..start + "+ba[ext=".len() + word_len + 1, "");
        } else {
            break;
        }
    }
    f = f.replace("+ba", "");
    f = f.replace("/ba", "");
    f = f.replace("/b", "");
    let f = f.trim_end_matches('/').to_owned();
    if f.is_empty() {
        "bv*".to_owned()
    } else {
        f
    }
}

/// Injeta `[fps<=N]` nos seletores de vídeo (`bv*[...]` e `bestvideo` puro).
/// Os fallbacks (`/b`, `/best`) ficam intactos para degradar preservando a
/// resolução. Roda DEPOIS de `video_only_format`. Aspas dentro dos colchetes
/// (ex. `vcodec~="^(avc|h264)"`) são respeitadas no balanceamento.
fn inject_fps_filter(format: &str, fps: f64) -> String {
    let tag = format!("[fps<={}]", fmt_num(fps));
    let mut out = String::with_capacity(format.len() + 16);
    let b = format.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if format[i..].starts_with("bv*") {
            out.push_str("bv*");
            i += 3;
            let mut end = i;
            while end < b.len() && b[end] == b'[' {
                let mut depth = 0;
                let mut in_quotes = false;
                let mut j = end;
                while j < b.len() {
                    let c = b[j];
                    if c == b'"' {
                        in_quotes = !in_quotes;
                    }
                    if !in_quotes {
                        if c == b'[' {
                            depth += 1;
                        } else if c == b']' {
                            depth -= 1;
                            if depth == 0 {
                                j += 1;
                                break;
                            }
                        }
                    }
                    j += 1;
                }
                end = j;
            }
            out.push_str(&format[i..end]);
            out.push_str(&tag);
            i = end;
            continue;
        }
        if format[i..].starts_with("bestvideo") {
            let after = i + "bestvideo".len();
            if after >= b.len() || b[after] != b'[' {
                out.push_str("bestvideo");
                out.push_str(&tag);
                i = after;
                continue;
            }
        }
        out.push(b[i] as char);
        i += 1;
    }
    out
}

/// Monta o argv — ordem idêntica a `YtDlpSpawn.ts:78-177`.
pub fn build_args(
    params: &DownloadParams,
    output_dir: &Path,
    ffmpeg: Option<&Path>,
) -> Vec<String> {
    let mut args = vec![
        "--no-playlist".to_owned(),
        "--no-warnings".to_owned(),
        "--no-mtime".to_owned(),
        "--windows-filenames".to_owned(),
        "--progress".to_owned(),
        "--newline".to_owned(),
        "--progress-template".to_owned(),
        PROGRESS_TEMPLATE.to_owned(),
    ];

    let mut final_format = non_empty(&params.format)
        .unwrap_or(DEFAULT_FORMAT)
        .to_owned();
    if is_true(&params.video_only) {
        final_format = video_only_format(&final_format);
    }
    // Teto rígido de FPS no seletor (não sort): a resolução mantém prioridade.
    // Fallbacks (/b, /best) ficam sem o filtro para degradar com resolução.
    if !is_true(&params.audio_only) {
        if let Some(fps) = params.fps_max {
            if fps > 0.0 {
                final_format = inject_fps_filter(&final_format, fps);
            }
        }
    }
    args.push("--format".to_owned());
    args.push(final_format);

    if is_true(&params.audio_only) {
        args.push("--extract-audio".to_owned());
        if let Some(f) = non_empty(&params.audio_format) {
            args.push("--audio-format".to_owned());
            args.push(f.to_owned());
        }
        if let Some(q) = non_empty(&params.audio_quality) {
            args.push("--audio-quality".to_owned());
            args.push(q.to_owned());
        }
    }

    if let Some(m) = non_empty(&params.merge_output_format) {
        if !is_true(&params.audio_only) {
            args.push("--merge-output-format".to_owned());
            args.push(m.to_owned());
        }
    }

    if is_true(&params.write_subs) {
        args.push("--write-subs".to_owned());
    }
    if is_true(&params.write_auto_subs) {
        args.push("--write-auto-subs".to_owned());
    }
    if let Some(l) = non_empty(&params.sub_langs) {
        args.push("--sub-langs".to_owned());
        args.push(l.to_owned());
    }
    if let Some(f) = non_empty(&params.sub_format) {
        args.push("--sub-format".to_owned());
        args.push(f.to_owned());
    }
    if is_true(&params.embed_subs) {
        args.push("--embed-subs".to_owned());
    }

    if is_true(&params.write_thumbnail) {
        args.push("--write-thumbnail".to_owned());
    }
    if is_true(&params.embed_thumbnail) {
        args.push("--embed-thumbnail".to_owned());
    }
    if is_true(&params.embed_metadata) {
        args.push("--embed-metadata".to_owned());
    }

    if is_true(&params.restrict_filenames) {
        args.push("--restrict-filenames".to_owned());
    }
    if is_true(&params.no_overwrites) {
        args.push("--no-overwrites".to_owned());
    }
    if is_true(&params.keep_video) {
        args.push("--keep-video".to_owned());
    }

    if let Some(s) = non_empty(&params.download_sections) {
        args.push("--download-sections".to_owned());
        args.push(s.to_owned());
    }
    if let Some(s) = non_empty(&params.sponsorblock_remove) {
        args.push("--sponsorblock-remove".to_owned());
        args.push(s.to_owned());
    }
    if let Some(b) = params.band_limit {
        if b > 0.0 {
            args.push("--limit-rate".to_owned());
            args.push(format!("{}K", fmt_num(b)));
        }
    }
    if let Some(n) = params.concurrent_fragments {
        if n > 1.0 {
            args.push("--concurrent-fragments".to_owned());
            args.push(fmt_num(n));
        }
    }
    if let Some(r) = params.retries {
        if r > 0.0 {
            args.push("--extractor-retries".to_owned());
            args.push(fmt_num(r));
        }
    }
    if let Some(c) = non_empty(&params.cookies_from_browser) {
        args.push("--cookies-from-browser".to_owned());
        args.push(c.to_owned());
    }
    if let Some(v) = non_empty(&params.video_codec) {
        args.push("--format-sort".to_owned());
        args.push(format!("vcodec:{v}"));
    }

    // Áudio compatível no merge: webm exige opus/vorbis e o sort padrão prefere
    // m4a — sem isso o merge quebra. flv já prefere aac/m4a por padrão.
    // (video-only empatam no aext; sem opus disponível, mantém a ordem padrão.)
    if !is_true(&params.audio_only) {
        if let Some(m) = non_empty(&params.merge_output_format) {
            if m == "webm" {
                args.push("--format-sort".to_owned());
                args.push("aext:opus".to_owned());
            }
        }
    }

    let mut ppa: Vec<String> = Vec::new();
    if is_true(&params.normalize_audio) {
        ppa.push("-af".to_owned());
        ppa.push("loudnorm=I=-16:TP=-1.5:LRA=11".to_owned());
    }
    match non_empty(&params.video_sharpen) {
        Some("light") => {
            ppa.push("-vf".to_owned());
            ppa.push("unsharp=3:3:0.5".to_owned());
        }
        Some("normal") => {
            ppa.push("-vf".to_owned());
            ppa.push("unsharp=5:5:1.0".to_owned());
        }
        Some("strong") => {
            ppa.push("-vf".to_owned());
            ppa.push("unsharp=7:7:1.5".to_owned());
        }
        _ => {}
    }
    if !ppa.is_empty() {
        args.push("--ppa".to_owned());
        args.push(format!("ffmpeg:{}", ppa.join(" ")));
    }

    let safe_name = non_empty(&params.custom_filename)
        .map(|n| sanitize_filename(n, is_true(&params.restrict_filenames)))
        .unwrap_or_default();
    let template = if safe_name.is_empty() {
        output_dir.join("%(title)s.%(ext)s")
    } else {
        output_dir.join(format!("{safe_name}.%(ext)s"))
    };
    args.push("-o".to_owned());
    args.push(template.to_string_lossy().into_owned());

    if let Some(ff) = ffmpeg {
        args.push("--ffmpeg-location".to_owned());
        args.push(ff.to_string_lossy().into_owned());
    }

    args.push(params.url.clone());
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dir() -> PathBuf {
        PathBuf::from("/dl")
    }

    fn head(args: &[String]) -> Vec<String> {
        args[..8].to_vec()
    }

    #[test]
    fn minimal_matches_spawn_defaults() {
        let p = DownloadParams {
            url: "https://x/y".into(),
            ..Default::default()
        };
        let a = build_args(&p, &dir(), None);
        assert_eq!(
            head(&a),
            vec![
                "--no-playlist",
                "--no-warnings",
                "--no-mtime",
                "--windows-filenames",
                "--progress",
                "--newline",
                "--progress-template",
                PROGRESS_TEMPLATE,
            ]
        );
        assert_eq!(
            &a[8..],
            &[
                "--format",
                "bestvideo+bestaudio/best",
                "-o",
                "/dl/%(title)s.%(ext)s",
                "https://x/y",
            ]
        );
    }

    #[test]
    fn audio_only_with_format_and_quality() {
        let p = DownloadParams {
            url: "https://x/y".into(),
            audio_only: Some(true),
            audio_format: Some("mp3".into()),
            audio_quality: Some("320K".into()),
            ..Default::default()
        };
        let a = build_args(&p, &dir(), Some(Path::new("/bin/ffmpeg")));
        assert!(a.windows(2).any(|w| w == ["--extract-audio", "--audio-format"]));
        assert!(a.windows(2).any(|w| w == ["--audio-format", "mp3"]));
        assert!(a.windows(2).any(|w| w == ["--audio-quality", "320K"]));
        assert!(a.windows(2).any(|w| w == ["--ffmpeg-location", "/bin/ffmpeg"]));
        assert!(!a.iter().any(|x| x == "--merge-output-format"));
    }

    #[test]
    fn video_only_strips_audio_tracks() {
        let p = DownloadParams {
            url: "https://x/y".into(),
            format: Some("bv*[height<=1080]+ba[ext=m4a]/b".into()),
            video_only: Some(true),
            ..Default::default()
        };
        let a = build_args(&p, &dir(), None);
        let f = a
            .windows(2)
            .find(|w| w[0] == "--format")
            .map(|w| w[1].clone())
            .unwrap();
        assert_eq!(f, "bv*[height<=1080]");
    }

    #[test]
    fn full_options_matrix() {
        let p = DownloadParams {
            url: "https://x/y".into(),
            fps_max: Some(60.0),
            write_subs: Some(true),
            sub_langs: Some("pt,en".into()),
            embed_thumbnail: Some(true),
            download_sections: Some("*01:00-02:00".into()),
            sponsorblock_remove: Some("sponsor".into()),
            band_limit: Some(500.0),
            concurrent_fragments: Some(4.0),
            retries: Some(3.0),
            cookies_from_browser: Some("chrome".into()),
            video_codec: Some("avc1".into()),
            ..Default::default()
        };
        let a = build_args(&p, &dir(), None);
        let joined = a.join("\u{1f}");
        for expected in [
            "--format\u{1f}bestvideo[fps<=60]+bestaudio/best",
            "--write-subs",
            "--sub-langs\u{1f}pt,en",
            "--embed-thumbnail",
            "--download-sections\u{1f}*01:00-02:00",
            "--sponsorblock-remove\u{1f}sponsor",
            "--limit-rate\u{1f}500K",
            "--concurrent-fragments\u{1f}4",
            "--extractor-retries\u{1f}3",
            "--cookies-from-browser\u{1f}chrome",
            "--format-sort\u{1f}vcodec:avc1",
        ] {
            assert!(joined.contains(expected), "faltando: {expected}");
        }
    }

    #[test]
    fn merge_prefers_compatible_audio_ext() {
        let p = DownloadParams {
            url: "https://x/y".into(),
            merge_output_format: Some("webm".into()),
            ..Default::default()
        };
        let a = build_args(&p, &dir(), None);
        let joined = a.join("\u{1f}");
        assert!(joined.contains("--format-sort\u{1f}aext:opus"), "{joined}");
        let p2 = DownloadParams {
            url: "https://x/y".into(),
            merge_output_format: Some("mp4".into()),
            ..Default::default()
        };
        let a2 = build_args(&p2, &dir(), None);
        assert!(!a2.iter().any(|x| x.starts_with("aext:")), "{joined}");
    }

    #[test]
    fn fps_filter_keeps_resolution_priority() {
        // Preset 1080p + codec com aspas + fps 30.
        let f = inject_fps_filter(
            "bv*[vcodec~=\"^(avc|h264)\"][height<=1080]+ba/b[height<=1080]",
            30.0,
        );
        assert_eq!(
            f,
            "bv*[vcodec~=\"^(avc|h264)\"][height<=1080][fps<=30]+ba/b[height<=1080]"
        );
        // 'best' (Melhor) filtra só o ramo bestvideo; fallback intacto.
        assert_eq!(
            inject_fps_filter("bestvideo+bestaudio/best", 60.0),
            "bestvideo[fps<=60]+bestaudio/best"
        );
    }

    #[test]
    fn sanitize_custom_filename_and_ppa() {
        let p = DownloadParams {
            url: "https://x/y".into(),
            custom_filename: Some("Show 12:30:45 / Final?".into()),
            normalize_audio: Some(true),
            video_sharpen: Some("normal".into()),
            ..Default::default()
        };
        let a = build_args(&p, &dir(), None);
        let o = a
            .windows(2)
            .find(|w| w[0] == "-o")
            .map(|w| w[1].clone())
            .unwrap();
        // "12:30:45" → "12h30m45s"; "/" → "-"; "?" → "_".
        assert_eq!(o, "/dl/Show 12h30m45s - Final_.%(ext)s");
        let ppa = a
            .windows(2)
            .find(|w| w[0] == "--ppa")
            .map(|w| w[1].clone())
            .unwrap();
        assert_eq!(
            ppa,
            "ffmpeg:-af loudnorm=I=-16:TP=-1.5:LRA=11 -vf unsharp=5:5:1.0"
        );
    }
}
