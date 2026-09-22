import { FavoriteItem, DownloadLaterItem, AppSettings } from '../../types';

export class StorageService {
  // --- FAVORITES ---
  static getFavorites(): FavoriteItem[] {
    try {
      const data = localStorage.getItem('universal_downloader_favorites');
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  }

  static saveFavorites(favs: FavoriteItem[]) {
    localStorage.setItem('universal_downloader_favorites', JSON.stringify(favs));
  }

  static toggleFavorite(fav: Omit<FavoriteItem, 'dateAdded'>): boolean {
    const list = this.getFavorites();
    const index = list.findIndex(f => f.url === fav.url);
    let isAdded = false;

    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.unshift({
        ...fav,
        dateAdded: new Date().toISOString()
      });
      isAdded = true;
    }
    this.saveFavorites(list);
    return isAdded;
  }

  static isFavorite(url: string): boolean {
    const list = this.getFavorites();
    return list.some(f => f.url === url);
  }

  static updateFavoriteNotes(id: string, notes: string) {
    const list = this.getFavorites();
    const item = list.find(f => f.id === id);
    if (item) {
      item.notes = notes;
      this.saveFavorites(list);
    }
  }

  // --- DOWNLOAD LATER ---
  static getDownloadLater(): DownloadLaterItem[] {
    try {
      const data = localStorage.getItem('universal_downloader_later');
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  }

  static saveDownloadLater(list: DownloadLaterItem[]) {
    localStorage.setItem('universal_downloader_later', JSON.stringify(list));
  }

  static addToDownloadLater(item: Omit<DownloadLaterItem, 'dateAdded'>): boolean {
    const list = this.getDownloadLater();
    const exists = list.some(l => l.url === item.url);
    if (exists) return false;

    list.unshift({
      ...item,
      dateAdded: new Date().toISOString()
    });
    this.saveDownloadLater(list);
    return true;
  }

  static removeFromDownloadLater(url: string) {
    const list = this.getDownloadLater();
    const filtered = list.filter(l => l.url !== url);
    this.saveDownloadLater(filtered);
  }

  static isDownloadLater(url: string): boolean {
    return this.getDownloadLater().some(l => l.url === url);
  }

  // --- SETTINGS CONFIGS ---
  static getSettings(): AppSettings {
    try {
      const data = localStorage.getItem('universal_downloader_settings');
      if (data) return JSON.parse(data);
    } catch (_) {
      // ignore
    }
    return {
      themeMode: 'dark',
      accentColor: 'indigo',
      iconStyle: 'lucide-mono',
      language: 'pt',
      defaultDir: '',
      bandLimit: 0,
      maxConcurrent: 3,
      autoDownload: true,
      notifications: true,
      updates: false,
      colorfulIcons: false,
      clipboardEnabled: true,
      clipboardMonitoringEnabled: false,
      clipboardFirstRunDone: false,
    };
  }

  static saveSettings(settings: AppSettings) {
    localStorage.setItem('universal_downloader_settings', JSON.stringify(settings));
  }

  // --- EXPORT / IMPORT CONFIGS ---
  static exportConfig(): string {
    const data = {
      settings: this.getSettings(),
      favorites: this.getFavorites(),
      later: this.getDownloadLater()
    };
    return JSON.stringify(data, null, 2);
  }

  static importConfig(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.settings) {
        this.saveSettings(parsed.settings);
      }
      if (parsed.favorites) {
        this.saveFavorites(parsed.favorites);
      }
      if (parsed.later) {
        this.saveDownloadLater(parsed.later);
      }
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  }

  // --- CLEAR CACHE & STORAGE ---
  static clearCache() {
    localStorage.removeItem('universal_downloader_later');
  }

  static clearAllData() {
    localStorage.removeItem('universal_downloader_settings');
    localStorage.removeItem('universal_downloader_favorites');
    localStorage.removeItem('universal_downloader_later');
    localStorage.removeItem('universal_downloader_items');
  }

  // --- LIGHTWEIGHT BACKUP (links only) ---
  static exportLinksBackup(): string {
    const favorites = this.getFavorites();
    const later = this.getDownloadLater();
    
    // Get download history (finished items only with URLs)
    let downloads: { url: string; title: string; platform: string }[] = [];
    try {
      const stored = localStorage.getItem('universal_downloader_items');
      if (stored) {
        const items = JSON.parse(stored);
        downloads = items
          .filter((i: any) => i.url && i.status !== 'queued')
          .map((i: any) => ({
            url: i.url,
            title: i.title || '',
            platform: i.platform || 'generic'
          }));
      }
    } catch (_) {}

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      favorites: favorites.map(f => ({ url: f.url, title: f.title, platform: f.platform })),
      downloads: downloads,
      downloadLater: later.map(l => ({ url: l.url, title: l.title, platform: l.platform }))
    };
    return JSON.stringify(data, null, 2);
  }

  static importLinksBackup(jsonStr: string): { imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;

    try {
      const data = JSON.parse(jsonStr);
      
      // Import favorites
      if (Array.isArray(data.favorites)) {
        const currentFavs = this.getFavorites();
        const existingUrls = new Set(currentFavs.map(f => f.url));
        
        for (const item of data.favorites) {
          if (item.url && !existingUrls.has(item.url)) {
            this.toggleFavorite({
              id: crypto.randomUUID(),
              title: item.title || 'Imported',
              url: item.url,
              platform: item.platform || 'generic',
              thumbnailUrl: ''
            });
            imported++;
          }
        }
      }

      // Import download later
      if (Array.isArray(data.downloadLater)) {
        for (const item of data.downloadLater) {
          if (item.url) {
            this.addToDownloadLater({
              id: crypto.randomUUID(),
              title: item.title || 'Imported',
              url: item.url,
              platform: item.platform || 'generic',
              thumbnailUrl: ''
            });
            imported++;
          }
        }
      }

      // Import downloads to history
      if (Array.isArray(data.downloads)) {
        try {
          const stored = localStorage.getItem('universal_downloader_items');
          const existingItems: any[] = stored ? JSON.parse(stored) : [];
          const existingUrls = new Set(existingItems.map((i: any) => i.url));

          for (const item of data.downloads) {
            if (item.url && !existingUrls.has(item.url)) {
              existingItems.push({
                id: crypto.randomUUID(),
                title: item.title || 'Imported',
                url: item.url,
                platform: item.platform || 'generic',
                status: 'completed',
                addedAt: new Date().toISOString(),
                format: { id: '', ext: '', quality: '', sizeEst: '', sizeBytes: 0, codec: '', type: 'video' },
                sizeTotal: 0,
                sizeDownloaded: 0,
                progress: 100,
                speed: 0,
                eta: 0,
                thumbnailUrl: ''
              });
              imported++;
            }
          }
          localStorage.setItem('universal_downloader_items', JSON.stringify(existingItems));
        } catch (e) {
          errors.push('Failed to import download history');
        }
      }
    } catch (e) {
      errors.push('Invalid JSON format');
    }

    return { imported, errors };
  }
}
