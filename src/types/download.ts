import type { PlatformId } from './platform';
import type { MediaFormat } from './media';

export interface DownloadItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  platform: PlatformId;
  format: MediaFormat;
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
  downloadSections?: string;
  videoOnly?: boolean;
  sponsorblockRemove?: string;
  fpsMax?: number;
  bandLimit?: number;
  customFilename?: string;
  videoFormat?: string;
  videoCodec?: string;
  normalizeAudio?: boolean;
  videoSharpen?: 'none' | 'light' | 'normal' | 'strong';
  imageSource?: 'user-link' | 'thumbnail';
  sizeTotal: number;
  sizeDownloaded: number;
  progress: number;
  durationSeconds?: number; // duração total da mídia (p/ estimar % em recortes)
  speed: number;
  eta: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  /** Transiente (não é estado): ffmpeg cortando em silêncio após o download. */
  processing?: boolean;
  /** Transiente: última atividade do yt-dlp sem % (fragmento/retry/aviso).
      Limpa no próximo progresso/conclusão; nunca persiste. */
  activity?: string;
  addedAt: string;
  finishedAt?: string;
  url: string;
  error?: string;
  /** Aviso não-fatal (ex. vídeo salvo sem legendas, sidecar fora do corte). */
  subWarning?: string;
  filePath?: string;
  finalArgs?: string[];
}
