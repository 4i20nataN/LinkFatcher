import type { MediaInfo, PlatformId, MediaFormat, MediaType, SearchResult, PlaylistInfo, PlaylistItem } from '../../types';
import type { MediaProvider } from './MediaProvider';
import { probeUrlWithAdapter, probePlaylistWithAdapter } from '../ytdlp/YtDlpAdapter';
import { PLATFORM_REGISTRY, matchPlatformForUrl, type PlatformConfig } from './platformConfigs';
import { YtDlpProvider } from './YtDlpProvider';

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

// Direct File Provider (Images, Audio, Video files) - Genuinely unique logic
export class DirectFileProvider implements MediaProvider {
  id: PlatformId = 'generic';
  name = 'Arquivo Direto';
  domains = [
    /[./](webp|png|jpg|jpeg|gif|bmp|svg|mp3|wav|ogg|m4a|mp4|webm|mov|mkv|aac|flac)([?#/]|$)/i,
    /susercontent\.com/i,
    /unsplash\.com/i,
    /image/i,
    /^data:image/i
  ];

  canHandle(url: string): boolean {
    if (url.startsWith('data:')) return true;
    const hasExtension = /[./](webp|png|jpg|jpeg|gif|bmp|svg|mp3|wav|ogg|m4a|mp4|webm|mov|mkv|aac|flac)([?#/]|$)/i.test(url);
    const isImageHost = url.includes('down-br.img.susercontent.com') ||
                        url.includes('images.unsplash.com') ||
                        url.includes('picsum.photos') ||
                        url.includes('image') ||
                        url.includes('photo');
    return hasExtension || isImageHost;
  }

  async analyze(url: string): Promise<MediaInfo> {
    let filename = 'arquivo_midia';
    try {
      if (url.startsWith('data:')) {
        const mimeMatch = url.match(/^data:([^;]+);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const ext = mime.split('/')[1] || 'png';
        filename = `imagem_base64.${ext}`;
      } else {
        const parsed = new URL(url);
        const pathname = parsed.pathname;
        const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (lastSegment && lastSegment.includes('.')) {
          filename = decodeURIComponent(lastSegment.split('?')[0]);
        } else {
          filename = parsed.hostname;
        }
      }
    } catch (_) {}

    const title = `Download: ${filename}`;

    let type: 'image' | 'audio' | 'video' = 'image';
    let duration = 'Imagem';
    let resolution = 'Auto-detectada';
    let formats: MediaFormat[] = [];
    let codec = 'N/A';
    let thumbnailUrl = url;

    const isAudio = /[./](mp3|wav|ogg|m4a|aac|flac)([?#/]|$)/i.test(url);
    const isVideo = /[./](mp4|webm|mov|mkv)([?#/]|$)/i.test(url);
    const isImage = !isAudio && !isVideo || url.startsWith('data:image/');

    if (isImage) {
      type = 'image';
      duration = 'Imagem';
      resolution = 'Auto-detectada';
      codec = 'PNG / JPEG / WebP';
      thumbnailUrl = url;

      formats = [
        { id: 'dir_img_orig', ext: 'png', quality: 'Formato PNG', sizeEst: 'N/A', sizeBytes: 0, codec: 'png', type: 'image' },
        { id: 'dir_img_webp', ext: 'webp', quality: 'Formato WebP', sizeEst: 'N/A', sizeBytes: 0, codec: 'webp', type: 'image' },
        { id: 'dir_img_jpg', ext: 'jpg', quality: 'Formato JPEG', sizeEst: 'N/A', sizeBytes: 0, codec: 'jpeg', type: 'image' },
      ];

      try {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            resolution = `${img.naturalWidth}\u00d7${img.naturalHeight}`;
            resolve(null);
          };
          img.onerror = () => {
            resolution = '1200\u00d7800';
            resolve(null);
          };
          img.src = url;
        });
      } catch (e) {
        resolution = '1200\u00d7800';
      }
    } else if (isAudio) {
      type = 'audio';
      duration = '03:45';
      resolution = 'Áudio';
      codec = 'MP3 / WAV';
      thumbnailUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=60';

      formats = [
        { id: 'dir_aud_mp3', ext: 'mp3', quality: 'Qualidade MP3 (320kbps)', sizeEst: 'N/A', sizeBytes: 0, codec: 'mp3', type: 'audio' },
        { id: 'dir_aud_wav', ext: 'wav', quality: 'Qualidade Original (WAV)', sizeEst: 'N/A', sizeBytes: 0, codec: 'pcm', type: 'audio' },
      ];

      try {
        await new Promise((resolve) => {
          const audio = new Audio(url);
          audio.onloadedmetadata = () => {
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            resolve(null);
          };
          audio.onerror = () => {
            resolve(null);
          };
        });
      } catch (e) {}
    } else if (isVideo) {
      type = 'video';
      duration = '02:30';
      resolution = '1920x1080';
      codec = 'H.264 / AAC';
      thumbnailUrl = 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&auto=format&fit=crop&q=60';

      formats = [
        { id: 'dir_vid_mp4', ext: 'mp4', quality: 'HD Original (MP4)', sizeEst: 'N/A', sizeBytes: 0, codec: 'h264 / aac', type: 'video' },
        { id: 'dir_vid_webm', ext: 'webm', quality: 'HD Compresso (WebM)', sizeEst: 'N/A', sizeBytes: 0, codec: 'vp9', type: 'video' },
        { id: 'dir_vid_mp3', ext: 'mp3', quality: 'Apenas Áudio (MP3)', sizeEst: 'N/A', sizeBytes: 0, codec: 'mp3', type: 'audio' },
      ];

      try {
        await new Promise((resolve) => {
          const video = document.createElement('video');
          video.src = url;
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            const minutes = Math.floor(video.duration / 60);
            const seconds = Math.floor(video.duration % 60);
            duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (video.videoWidth && video.videoHeight) {
              resolution = `${video.videoWidth}x${video.videoHeight}`;
            }
            resolve(null);
          };
          video.onerror = () => {
            resolve(null);
          };
        });
      } catch (e) {}
    }

    let host = 'Arquivo Direto';
    try {
      const parsed = new URL(url);
      host = parsed.hostname.replace('www.', '');
    } catch (_) {}

    return {
      id: 'dir_' + rand(10000, 99999),
      title,
      author: host,
      channel: host,
      duration,
      durationSeconds: 0,
      resolution,
      sizeEst: formats[0]?.sizeEst || 'N/A',
      formats,
      codec,
      type,
      publishDate: 'Não especificado',
      views: undefined,
      platform: 'generic',
      originalUrl: url,
      thumbnailUrl,
      status: 'success'
    };
  }
}

// Fallback Provider for unmatched links - Genuinely unique logic
export class GenericProvider implements MediaProvider {
  id: PlatformId = 'generic';
  name = 'Link Web Genérico';
  domains = [/.*/];

  canHandle(_url: string): boolean {
    return true;
  }

  async analyze(url: string): Promise<MediaInfo> {
    const isImage = /[./](webp|png|jpg|jpeg|gif|bmp|svg|avif|tiff)([?#/]|$)/i.test(url)
      || url.toLowerCase().includes('image') || url.toLowerCase().includes('photo')
      || url.toLowerCase().includes('pic') || url.startsWith('data:image/');

    // Skip yt-dlp for direct image URLs — it doesn't handle them
    if (!isImage) {
      try {
        const metadata = await probeWithYtdlp(url);
        return buildMediaInfoFromProbe(metadata, url, 'generic');
      } catch { /* fall through to fallback */ }
    }

    const domains = ['youtube', 'tiktok', 'instagram', 'facebook', 'x', 'reddit', 'soundcloud', 'spotify', 'twitch', 'pinterest', 'threads', 'vimeo'];
    let matchedId: PlatformId = 'generic';
    for (const dom of domains) {
      if (url.toLowerCase().includes(dom)) {
        matchedId = dom as PlatformId;
        break;
      }
    }

    const isAudio = !isImage && /[./](mp3|wav|ogg|m4a|aac|flac)([?#/]|$)/i.test(url) || url.toLowerCase().includes('audio') || url.toLowerCase().includes('sound');
    const isVideo = !isImage && !isAudio && /[./](mp4|webm|mov|mkv)([?#/]|$)/i.test(url) || url.toLowerCase().includes('video') || url.toLowerCase().includes('movie') || url.toLowerCase().includes('clip');

    let type: 'image' | 'audio' | 'video' = 'video';
    let duration = '02:30';
    let resolution = '1920x1080';
    let codec = 'H.264 / AAC';
    let thumbnailUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=60';
    let formats: MediaFormat[] = [];

    if (isImage) {
      type = 'image';
      duration = 'Imagem';
      resolution = 'Detectando...';
      codec = 'Imagem';
      thumbnailUrl = url.startsWith('data:') ? url : '';

      // Detect real resolution via Image element
      try {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            resolution = `${img.naturalWidth}\u00d7${img.naturalHeight}`;
            // Use actual image as thumbnail if we got it
            if (!thumbnailUrl) thumbnailUrl = url;
            resolve();
          };
          img.onerror = () => {
            resolution = 'Resolução desconhecida';
            if (!thumbnailUrl) thumbnailUrl = url;
            resolve();
          };
          img.src = url;
        });
      } catch {
        resolution = 'Resolução desconhecida';
        thumbnailUrl = url;
      }

      formats = [
        { id: 'gen_i_png', ext: 'png', quality: 'Formato PNG', sizeEst: 'N/A', sizeBytes: 0, codec: 'png', type: 'image' },
        { id: 'gen_i_webp', ext: 'webp', quality: 'Formato WebP', sizeEst: 'N/A', sizeBytes: 0, codec: 'webp', type: 'image' },
        { id: 'gen_i_jpg', ext: 'jpg', quality: 'Formato JPEG', sizeEst: 'N/A', sizeBytes: 0, codec: 'jpeg', type: 'image' }
      ];
    } else if (isAudio) {
      type = 'audio';
      duration = '03:45';
      resolution = 'Áudio';
      codec = 'MP3 / WAV';
      thumbnailUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=60';
      formats = [
        { id: 'gen_a_mp3', ext: 'mp3', quality: 'Qualidade MP3 (320kbps)', sizeEst: 'N/A', sizeBytes: 0, codec: 'mp3', type: 'audio' },
        { id: 'gen_a_wav', ext: 'wav', quality: 'Qualidade Original (WAV)', sizeEst: 'N/A', sizeBytes: 0, codec: 'pcm', type: 'audio' }
      ];
    } else {
      type = 'video';
      duration = '02:30';
      resolution = '1920x1080';
      codec = 'H.264 / AAC';
      thumbnailUrl = 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&auto=format&fit=crop&q=60';
      formats = [
        { id: 'gen_v_hd', ext: 'mp4', quality: 'HD Original', sizeEst: 'N/A', sizeBytes: 0, codec: 'h264 / aac', type: 'video' },
        { id: 'gen_a_mp3', ext: 'mp3', quality: 'Áudio MP3 (320kbps)', sizeEst: 'N/A', sizeBytes: 0, codec: 'mp3', type: 'audio' }
      ];
    }

    let host = 'Servidor Web';
    try {
      if (url.startsWith('data:')) {
        host = 'Data URI';
      } else {
        const parsed = new URL(url);
        host = parsed.hostname.replace('www.', '');
      }
    } catch (_) {}

    return {
      id: 'gen_' + rand(10000, 99999),
      title: `Conteúdo extraído automaticamente de ${host}`,
      author: host,
      channel: host,
      duration,
      durationSeconds: 0,
      resolution,
      sizeEst: formats[0]?.sizeEst || 'N/A',
      formats,
      codec,
      type,
      publishDate: 'Não especificado',
      views: undefined,
      platform: matchedId,
      originalUrl: url,
      thumbnailUrl,
      status: 'success'
    };
  }
}

// Registry Manager - Now uses data-driven architecture
export class ProviderRegistry {
  private static providers: MediaProvider[] = [
    new DirectFileProvider(),
    new YtDlpProvider(PLATFORM_REGISTRY.filter(p => p.id !== 'generic')),
  ];

  private static fallback = new GenericProvider();

  static register(provider: MediaProvider) {
    this.providers.push(provider);
  }

  static getProviderForUrl(url: string): MediaProvider {
    for (const p of this.providers) {
      if (p.canHandle(url)) {
        return p;
      }
    }
    return this.fallback;
  }

  static getPlatformConfig(id: PlatformId) {
    const configs: Record<PlatformId, { name: string; icon: string; color: string; domains: string[] }> = {
      youtube: { name: 'YouTube', icon: 'Youtube', color: 'bg-red-600 text-white', domains: ['youtube.com', 'youtu.be'] },
      tiktok: { name: 'TikTok', icon: 'Tv', color: 'bg-neutral-900 text-white border border-neutral-700', domains: ['tiktok.com'] },
      instagram: { name: 'Instagram', icon: 'Instagram', color: 'bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 text-white', domains: ['instagram.com'] },
      facebook: { name: 'Facebook', icon: 'Facebook', color: 'bg-blue-600 text-white', domains: ['facebook.com'] },
      x: { name: 'X / Twitter', icon: 'Twitter', color: 'bg-black text-white border border-neutral-800', domains: ['x.com', 'twitter.com'] },
      reddit: { name: 'Reddit', icon: 'MessageSquare', color: 'bg-orange-600 text-white', domains: ['reddit.com'] },
      soundcloud: { name: 'SoundCloud', icon: 'Music', color: 'bg-orange-500 text-white', domains: ['soundcloud.com'] },
      spotify: { name: 'Spotify', icon: 'Disc', color: 'bg-emerald-500 text-black', domains: ['spotify.com'] },
      twitch: { name: 'Twitch', icon: 'Twitch', color: 'bg-purple-600 text-white', domains: ['twitch.tv'] },
      pinterest: { name: 'Pinterest', icon: 'Image', color: 'bg-red-700 text-white', domains: ['pinterest.com'] },
      threads: { name: 'Threads', icon: 'Hash', color: 'bg-zinc-900 text-white', domains: ['threads.net'] },
      vimeo: { name: 'Vimeo', icon: 'Video', color: 'bg-sky-500 text-white', domains: ['vimeo.com'] },
      generic: { name: 'Web Link / File', icon: 'Globe', color: 'bg-zinc-600 text-white', domains: [] }
    };
    return configs[id] || configs.generic;
  }
}

// Generate high quality mock search results for YouTube
export function mockSearchYouTube(query: string): SearchResult[] {
  const topics = [
    { title: 'Como dominar Clean Architecture no Flutter em 2026', author: 'Código Limpo Tech', image: '1507679799987-c73779587ccf' },
    { title: 'Synthwave Relaxante - Estudo e Concentração Profunda', author: 'Cosmic Sounds', image: '1550751827-4bd374c3f58b' },
    { title: 'Dicas Práticas de Figma para Engenheiros de Software', author: 'Figma BR Master', image: '1581291518633-83b4ebd1d83e' },
    { title: 'Nothing Phone (2a) - Por que esse design chama tanto a atenção?', author: 'Tech Reviews BR', image: '1546054454-aa26e2b734c7' },
    { title: 'Som de Chuva e Trovões na Floresta Tropical (10 Horas)', author: 'Natureza Relaxante', image: '1470071459604-3b5ec3a7fe05' },
    { title: 'React 19 + TypeScript + Tailwind CSS: O Futuro do Front-End', author: 'RocketCode BR', image: '1517694712202-14dd9538aa97' }
  ];

  // If query is empty, return defaults. Otherwise, customize titles using the query
  return topics.map((t, idx) => {
    const finalTitle = query
      ? `${query.charAt(0).toUpperCase() + query.slice(1)}: ${t.title.split(' - ')[0]}`
      : t.title;

    const secs = rand(120, 2700);
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;

    return {
      id: `yt_search_${idx}_${rand(100, 999)}`,
      title: finalTitle,
      url: `https://youtube.com/watch?v=mockId${idx}ab`,
      thumbnail: `https://images.unsplash.com/photo-${t.image}?w=400&auto=format&fit=crop&q=60`,
      duration: secs,
      duration_string: `${mins}:${remaining.toString().padStart(2, '0')}`,
      view_count: rand(12000, 5400000),
      uploader: t.author,
      description: `${t.title} - ${t.author}`,
    };
  });
}

/**
 * Probe a playlist URL and return structured PlaylistInfo with items.
 * Used by LinkAnalyzer to display playlist preview before download.
 */
export async function probePlaylistFull(
  url: string,
  options?: { proxy?: string }
): Promise<PlaylistInfo> {
  const result = await probePlaylistWithAdapter({ url, ...options });

  // Detect platform from URL using provider registry
  const provider = ProviderRegistry.getProviderForUrl(url);
  const platform = (provider as any).platform as PlatformId || 'generic';

  const items: PlaylistItem[] = (result.entries || []).map((entry, idx) => ({
    id: (entry.id as string) || `pl_${idx}`,
    title: (entry.title as string) || `Item ${idx + 1}`,
    url: (entry.url as string) || (entry.webpage_url as string) || url,
    thumbnailUrl: (entry.thumbnail as string) || '',
    duration: (entry.duration as number) || undefined,
    index: (entry.playlist_index as number) || idx + 1,
  }));

  return {
    id: `playlist_${Date.now()}`,
    title: result.title || 'Playlist',
    description: undefined,
    thumbnailUrl: items[0]?.thumbnailUrl || '',
    itemCount: result.playlist_count || items.length,
    totalDuration: items.reduce((sum, item) => sum + (item.duration || 0), 0) || undefined,
    platform,
    url,
    items,
  };
}
