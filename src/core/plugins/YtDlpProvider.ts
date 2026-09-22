import type { MediaInfo, PlatformId, MediaType } from '../../types';
import type { MediaProvider } from './MediaProvider';
import { probeUrlWithAdapter } from '../ytdlp/YtDlpAdapter';
import type { PlatformConfig } from './platformConfigs';
import { matchPlatformForUrl } from './platformConfigs';

// Helper to generate a random number within a range
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function probeWithYtdlp(url: string, options?: { proxy?: string }): Promise<Record<string, unknown>> {
  return probeUrlWithAdapter({ url, ...options });
}

function resolveFormatSize(f: Record<string, unknown>, totalDuration: number): { sizeEst: string; sizeBytes: number } {
  const raw = (f.filesize as number) || 0;
  const approx = (f.filesize_approx as number) || 0;
  let bytes = raw || approx;

  // Fallback: compute from total bitrate (tbr, in kbps) * duration
  if (!bytes && totalDuration > 0) {
    const tbr = (f.tbr as number) || 0;
    if (tbr > 0) {
      bytes = Math.round((tbr * 1000 / 8) * totalDuration);
    }
  }

  if (bytes > 0) {
    const mb = bytes / 1024 / 1024;
    return {
      sizeEst: mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`,
      sizeBytes: bytes,
    };
  }
  return { sizeEst: 'N/A', sizeBytes: 0 };
}

function buildMediaInfoFromProbe(metadata: Record<string, unknown>, url: string, platform: PlatformId): MediaInfo {
  const totalDuration = (metadata.duration as number) || 0;
  const formats = (metadata.formats as Array<Record<string, unknown>> | undefined)
    ?.filter((f) => {
      const ext = ((f.ext as string) || '').toLowerCase();
      const formatNote = ((f.format_note as string) || '').toLowerCase();
      const vcodec = (f.vcodec as string) || 'none';
      const acodec = (f.acodec as string) || 'none';
      // Exclude storyboards (YouTube's scrubber-preview thumbnail sprites, ext
      // "mhtml") and any other format that carries neither video nor audio —
      // these aren't real downloadable media, but nothing filtered them out
      // before, so a storyboard entry sorting first in the array (formats[0]
      // is used as the default selection) would make the app try to download
      // it instead of the actual video.
      if (ext === 'mhtml' || formatNote === 'storyboard') return false;
      if (vcodec === 'none' && acodec === 'none') return false;
      return true;
    })
    .map((f) => {
    const { sizeEst, sizeBytes } = resolveFormatSize(f, totalDuration);
    return {
      id: (f.format_id as string) || 'unknown',
      ext: (f.ext as string) || 'mp4',
      quality: (f.resolution as string) || (f.format_note as string) || (f.ext as string) || 'unknown',
      sizeEst,
      sizeBytes,
      codec: `${f.vcodec || ''} / ${f.acodec || ''}`.trim(),
      fps: typeof f.fps === 'number' ? (f.fps as number) : undefined,
      type: (f.vcodec && f.vcodec !== 'none') ? 'video' as const : 'audio' as const
    };
  }) || [];

  return {
    id: (metadata.id as string) || `probe_${rand(10000, 99999)}`,
    title: (metadata.title as string) || 'Unknown Title',
    author: (metadata.uploader as string) || (metadata.channel as string) || 'Unknown',
    channel: (metadata.uploader as string) || (metadata.channel as string) || 'Unknown',
    duration: (metadata.duration_string as string) || '0:00',
    durationSeconds: totalDuration,
    resolution: (metadata.resolution as string) || 'Original',
    sizeEst: formats.length > 0 ? formats[0].sizeEst : 'N/A',
    formats,
    codec: formats.length > 0 ? formats[0].codec : (metadata.vcodec as string) || 'N/A',
    type: (() => {
      const extractor = (metadata.extractor_type as string || '').toLowerCase();
      const rawFormats = (metadata.formats as any[]) || [];
      const hasVideo = rawFormats.some((f: any) => f.vcodec && f.vcodec !== 'none');
      if (hasVideo || ['youtube', 'tiktok', 'twitter', 'twitch', 'vimeo', 'facebook', 'instagram', 'dailymotion'].includes(extractor)) return 'video' as const;
      if (extractor.includes('audio') || extractor === 'soundcloud') return 'audio' as const;
      return 'video' as const;
    })() as MediaType,
    publishDate: metadata.upload_date as string | undefined,
    views: (metadata.view_count as number)?.toLocaleString(),
    platform,
    originalUrl: url,
    thumbnailUrl: (metadata.thumbnail as string) || '',
    description: (metadata.description as string) || undefined,
    status: 'success'
  };
}

export class YtDlpProvider implements MediaProvider {
  id: PlatformId = 'generic';
  name = 'YtDLP Provider';
  domains: RegExp[] = [];

  constructor(private registry: PlatformConfig[]) {}

  canHandle(url: string): boolean {
    const platform = matchPlatformForUrl(url);
    return platform !== null && platform.id !== 'generic';
  }

  async analyze(url: string): Promise<MediaInfo> {
    const platform = matchPlatformForUrl(url);
    if (!platform) throw new Error('No matching platform found');

    const metadata = await probeWithYtdlp(url);
    return buildMediaInfoFromProbe(metadata, url, platform.id);
  }
}
