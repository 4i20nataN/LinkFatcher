import type { PlatformId } from './platform';

export interface FavoriteItem {
  id: string;
  title: string;
  url: string;
  platform: PlatformId;
  thumbnailUrl: string;
  dateAdded: string;
  notes?: string;
}

export interface DownloadLaterItem {
  id: string;
  title: string;
  url: string;
  platform: PlatformId;
  thumbnailUrl: string;
  dateAdded: string;
}
