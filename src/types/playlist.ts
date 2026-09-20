import type { PlatformId } from './platform';

export interface PlaylistItem {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  duration?: number;
  index: number;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  itemCount: number;
  totalDuration?: number;
  platform: PlatformId;
  url: string;
  items: PlaylistItem[];
}
