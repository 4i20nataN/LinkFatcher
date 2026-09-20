import type { PlatformId } from './platform';

export type MediaType = 'video' | 'audio' | 'image';

export interface MediaFormat {
  id: string;
  ext: string;
  quality: string;
  sizeEst: string;
  sizeBytes: number;
  codec: string;
  type: MediaType;
  fps?: number; // fps do formato quando o probe informa (usado p/ prever teto de FPS)
}

export interface MediaInfo {
  id: string;
  title: string;
  author: string;
  channel: string;
  duration: string; // e.g. "04:15"
  durationSeconds: number; // e.g. 255
  resolution?: string;
  sizeEst: string;
  formats: MediaFormat[];
  codec: string;
  type: MediaType;
  publishDate?: string;
  views?: string;
  platform: PlatformId;
  originalUrl: string;
  thumbnailUrl: string;
  description?: string;
  status: 'idle' | 'analyzing' | 'success' | 'failed';
  error?: string;
}
