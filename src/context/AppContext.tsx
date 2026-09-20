/**
 * AppContext - Backward-compatible facade.
 * Combines all focused contexts into a single useApp() hook.
 * New components should use specific hooks: useSettings, useNavigation, etc.
 */

import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';
import { NavigationProvider, useNavigation } from './NavigationContext';
import { FavoritesProvider, useFavorites } from './FavoritesContext';
import { DownloadsProvider, useDownloads } from './DownloadsContext';
import { DownloadLaterProvider, useDownloadLater } from './DownloadLaterContext';
import { DownloadEngine } from '../core/engine/DownloadEngine';
import { StorageService } from '../core/storage/Storage';
import type { FavoriteItem, DownloadLaterItem, AppSettings, DownloadItem } from '../types';

// Backward-compatible interface (same as before)
interface AppContextType {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  favorites: FavoriteItem[];
  toggleFavorite: (item: Omit<FavoriteItem, 'dateAdded'>) => boolean;
  updateFavoriteNotes: (id: string, notes: string) => void;
  isFavorite: (url: string) => boolean;
  downloadLater: DownloadLaterItem[];
  addToDownloadLater: (item: Omit<DownloadLaterItem, 'dateAdded'>) => boolean;
  removeFromDownloadLater: (url: string) => void;
  isDownloadLater: (url: string) => boolean;
  downloads: DownloadItem[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedUrl: string;
  setSelectedUrl: (url: string) => void;
  clearAllData: () => void;
}

// Combined hook that provides the same interface as before
export const useApp = (): AppContextType => {
  const { settings, updateSettings } = useSettings();
  const { activeTab, setActiveTab, selectedUrl, setSelectedUrl } = useNavigation();
  const { favorites, toggleFavorite, updateFavoriteNotes, isFavorite } = useFavorites();
  const { downloads } = useDownloads();
  const { downloadLater, addToDownloadLater, removeFromDownloadLater, isDownloadLater } = useDownloadLater();

  const clearAllData = React.useCallback(() => {
    StorageService.clearAllData();
    DownloadEngine.clearHistory();
    window.location.reload();
  }, []);

  return {
    settings,
    updateSettings,
    favorites,
    toggleFavorite,
    updateFavoriteNotes,
    isFavorite,
    downloadLater,
    addToDownloadLater,
    removeFromDownloadLater,
    isDownloadLater,
    downloads,
    activeTab,
    setActiveTab,
    selectedUrl,
    setSelectedUrl,
    clearAllData,
  };
};

// Provider that wraps all context providers
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SettingsProvider>
      <NavigationProvider>
        <FavoritesProvider>
          <DownloadsProvider>
            <DownloadLaterProvider>
              {children}
            </DownloadLaterProvider>
          </DownloadsProvider>
        </FavoritesProvider>
      </NavigationProvider>
    </SettingsProvider>
  );
};

// Sync settings with Download Engine
export const SettingsSync: React.FC = () => {
  const { settings } = useSettings();

  React.useEffect(() => {
    DownloadEngine.setSettings(settings);
  }, [settings]);

  return null;
};

// Re-export focused hooks for new components
export { useSettings } from './SettingsContext';
export { useNavigation } from './NavigationContext';
export { useFavorites } from './FavoritesContext';
export { useDownloads, useDownloadCount } from './DownloadsContext';
export { useDownloadLater } from './DownloadLaterContext';
