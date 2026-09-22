/**
 * FormatOptions — shared type for download format configuration.
 * Extracted from FormatSelector to avoid circular imports and enable
 * type-only imports without loading the full component chunk.
 */

export interface FormatOptions {
  format?: string;
  audioOnly: boolean;
  audioFormat: string;
  audioQuality: string;
  writeSubs: boolean;
  writeAutoSubs: boolean;
  subLangs: string;
  subFormat: string;
  embedSubs: boolean;
  writeThumbnail: boolean;
  embedThumbnail: boolean;
  embedMetadata: boolean;
  concurrentFragments?: number;
  retries?: number;
  restrictFilenames?: boolean;
  noOverwrites?: boolean;
  keepVideo?: boolean;
  videoOnly?: boolean;
  downloadSections?: string;
  sponsorblockRemove?: string;
  fpsMax?: number;
  bandLimit?: number; // KB/s, 0 = unlimited
  videoCodec?: string; // '', 'h264', 'h265', 'vp9', 'av01'
  videoFormat?: string; // 'mp4', 'mkv', 'webm', 'flv' (ts/avi/mov removidos: falham no merge com codecs padrão av1/opus)
  customFilename?: string;
  descFormat?: 'txt' | 'md' | 'none';
  normalizeAudio?: boolean;
  videoSharpen?: 'none' | 'light' | 'normal' | 'strong';
}
