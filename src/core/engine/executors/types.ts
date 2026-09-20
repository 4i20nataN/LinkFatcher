import type { DownloadItem } from '../../../types';

export interface DownloadExecutor {
  start(item: DownloadItem): Promise<void>;
  cancel(id: string): void;
  destroy(): void;
}
