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
  addedAt: string;
  finishedAt?: string;
  url: string;
  error?: string;
  filePath?: string;
  finalArgs?: string[];
}

export interface DownloadOptions {
  url: string;
  outputPath?: string;
  filename?: string;
  // Format options
  format?: string;
  audioOnly?: boolean;
  audioFormat?: 'mp3' | 'aac' | 'flac' | 'm4a' | 'opus' | 'wav';
  audioQuality?: string;
  mergeOutputFormat?: string;
  // Subtitle options
  writeSubs?: boolean;
  writeAutoSubs?: boolean;
  subLangs?: string;
  subFormat?: string;
  embedSubs?: boolean;
  // Thumbnail options
  writeThumbnail?: boolean;
  embedThumbnail?: boolean;
  // Metadata options
  embedMetadata?: boolean;
  // Advanced options
  outputTemplate?: string;
  restrictFilenames?: boolean;
  noOverwrites?: boolean;
  keepVideo?: boolean;
  // Trim/cut
  downloadSections?: string; // e.g. "*01:30-05:00"
  // Video only (no audio track)
  videoOnly?: boolean;
  // SponsorBlock
  sponsorblockRemove?: string; // e.g. "all" or comma-separated categories
  // FPS limit
  fpsMax?: number;
  // Auth options
  proxy?: string;
  ffmpegLocation?: string;
  // Rate limiting
  bandLimit?: number; // KB/s, 0 = unlimited
  // Post-processors
  normalizeAudio?: boolean;
  videoSharpen?: 'none' | 'light' | 'normal' | 'strong';
  // Advanced download
  concurrentFragments?: number;
  retries?: number;
  customFilename?: string;
  videoFormat?: string;
  videoCodec?: string;
}
