const DEFAULT_FORMAT = 'bestvideo+bestaudio/best';

/**
 * Injeta `[fps<=N]` nos seletores de vídeo (`bv*[...]` e `bestvideo` puro).
 * Espelho de `inject_fps_filter` (Rust args.rs): fallbacks intactos,
 * aspas dentro dos colchetes respeitadas.
 */
function injectFpsFilter(format: string, fps: number): string {
  const tag = `[fps<=${fps}]`;
  let out = '';
  let i = 0;
  while (i < format.length) {
    if (format.startsWith('bv*', i)) {
      out += 'bv*';
      i += 3;
      let end = i;
      while (format[end] === '[') {
        let depth = 0;
        let inQuotes = false;
        let j = end;
        while (j < format.length) {
          const c = format[j];
          if (c === '"') inQuotes = !inQuotes;
          if (!inQuotes) {
            if (c === '[') depth++;
            else if (c === ']') {
              depth--;
              if (depth === 0) { j++; break; }
            }
          }
          j++;
        }
        end = j;
      }
      out += format.slice(i, end) + tag;
      i = end;
      continue;
    }
    if (format.startsWith('bestvideo', i)) {
      const after = i + 'bestvideo'.length;
      if (format[after] !== '[') {
        out += 'bestvideo' + tag;
        i = after;
        continue;
      }
    }
    out += format[i];
    i++;
  }
  return out;
}

/**
 * Build the yt-dlp args array from a DownloadItem — mirrors spawnDownload logic
 * exactly so the preview matches the real command. Pure function, zero Node deps.
 */
export function buildArgsPreview(item: {
  url: string;
  formatString?: string;
  audioOnly?: boolean;
  audioFormat?: string;
  audioQuality?: string;
  writeSubs?: boolean;
  writeAutoSubs?: boolean;
  subLangs?: string;
  subFormat?: string;
  embedSubs?: boolean;
  writeThumbnail?: boolean;
  embedThumbnail?: boolean;
  embedMetadata?: boolean;
  mergeOutputFormat?: string;
  restrictFilenames?: boolean;
  noOverwrites?: boolean;
  keepVideo?: boolean;
  concurrentFragments?: number;
  retries?: number;
  customFilename?: string;
  videoOnly?: boolean;
  downloadSections?: string;
  sponsorblockRemove?: string;
  fpsMax?: number;
  bandLimit?: number;
  normalizeAudio?: boolean;
  videoSharpen?: 'none' | 'light' | 'normal' | 'strong';
  videoCodec?: string;
}): string[] {
  const args: string[] = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--progress',
    '--no-mtime',
    '--windows-filenames',
    '--progress-template',
    'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
  ];

  let finalFormat = item.formatString || DEFAULT_FORMAT;

  if (item.videoOnly) {
    finalFormat = finalFormat
      .replace(/\+ba\[ext=\w+\]/g, '')
      .replace(/\+ba/g, '')
      .replace(/\/ba/g, '')
      .replace(/\/b/g, '')
      .replace(/\/+$/, '') || 'bv*';
  }

  // Teto rígido de FPS no seletor (não sort): a resolução mantém prioridade.
  if (!item.audioOnly && item.fpsMax && item.fpsMax > 0) {
    finalFormat = injectFpsFilter(finalFormat, item.fpsMax);
  }

  args.push('--format', finalFormat);

  if (item.audioOnly) {
    args.push('--extract-audio');
    if (item.audioFormat) args.push('--audio-format', item.audioFormat);
    if (item.audioQuality) args.push('--audio-quality', item.audioQuality);
  }

  if (item.mergeOutputFormat && !item.audioOnly) args.push('--merge-output-format', item.mergeOutputFormat);

  if (item.writeSubs) args.push('--write-subs');
  if (item.writeAutoSubs) args.push('--write-auto-subs');
  if (item.subLangs) args.push('--sub-langs', item.subLangs);
  if (item.subFormat) args.push('--sub-format', item.subFormat);
  if (item.embedSubs) args.push('--embed-subs');

  if (item.writeThumbnail) args.push('--write-thumbnail');
  if (item.embedThumbnail) args.push('--embed-thumbnail');
  if (item.embedMetadata) args.push('--embed-metadata');

  if (item.restrictFilenames) args.push('--restrict-filenames');
  if (item.noOverwrites) args.push('--no-overwrites');
  if (item.keepVideo) args.push('--keep-video');

  if (item.downloadSections) args.push('--download-sections', item.downloadSections);
  if (item.sponsorblockRemove) args.push('--sponsorblock-remove', item.sponsorblockRemove);

  if (item.bandLimit && item.bandLimit > 0) args.push('--limit-rate', `${item.bandLimit}K`);

  if (item.concurrentFragments && item.concurrentFragments > 1) {
    args.push('--concurrent-fragments', String(item.concurrentFragments));
  }

  if (item.retries && item.retries > 0) args.push('--extractor-retries', String(item.retries));

  if (item.videoCodec) args.push('--format-sort', `vcodec:${item.videoCodec}`);

  // Áudio compatível no merge: webm exige opus/vorbis e o sort padrão prefere m4a.
  if (!item.audioOnly && item.mergeOutputFormat === 'webm') {
    args.push('--format-sort', 'aext:opus');
  }

  const ffmpegPpaArgs: string[] = [];
  if (item.normalizeAudio) ffmpegPpaArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
  if (item.videoSharpen && item.videoSharpen !== 'none') {
    const sharpMap = { light: '3:3:0.5', normal: '5:5:1.0', strong: '7:7:1.5' };
    ffmpegPpaArgs.push('-vf', `unsharp=${sharpMap[item.videoSharpen]}`);
  }
  if (ffmpegPpaArgs.length > 0) args.push('--ppa', `ffmpeg:${ffmpegPpaArgs.join(' ')}`);

  const sanitizeFilename = (name: string, strict = false): string => {
    let s = name;
    s = s.replace(/(\d{1,2}):(\d{2}):(\d{2})/g, '$1h$2m$3s');
    s = s.replace(/(\d{1,2}):(\d{2})/g, '$1m$2s');
    s = s.replace(/(\d{1,4})\/(\d{1,2})\/(\d{1,4})/g, '$1-$2-$3');
    s = s.replace(/[:\\|*?<>"]/g, '_');
    s = s.replace(/\//g, '-');
    s = s.replace(/\\/g, '_');
    if (strict) {
      s = s.replace(/[^a-zA-Z0-9_.\-]/g, '_');
      s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
    }
    return s;
  };

  const safeName = item.customFilename
    ? sanitizeFilename(item.customFilename, item.restrictFilenames)
    : '';
  const outputTemplate = safeName ? `${safeName}.%(ext)s` : '%(title)s.%(ext)s';
  args.push('-o', outputTemplate);

  args.push(item.url);
  return args;
}
