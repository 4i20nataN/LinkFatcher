/**
 * DownloadLaterContext - Download later queue management.
 * Consumed by 2 components (DownloadLaterView, LinkAnalyzer).
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { DownloadLaterItem } from '../types';
import { StorageService } from '../core/storage/Storage';

interface DownloadLaterContextType {
  downloadLater: DownloadLaterItem[];
  addToDownloadLater: (item: Omit<DownloadLaterItem, 'dateAdded'>) => boolean;
  removeFromDownloadLater: (url: string) => void;
  isDownloadLater: (url: string) => boolean;
}

const DownloadLaterContext = createContext<DownloadLaterContextType | undefined>(undefined);

export const DownloadLaterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadLater, setDownloadLater] = useState<DownloadLaterItem[]>(StorageService.getDownloadLater());

  const addToDownloadLater = useCallback((item: Omit<DownloadLaterItem, 'dateAdded'>): boolean => {
    const added = StorageService.addToDownloadLater(item);
    if (added) {
      setDownloadLater(StorageService.getDownloadLater());
    }
    return added;
  }, []);

  const removeFromDownloadLater = useCallback((url: string) => {
    StorageService.removeFromDownloadLater(url);
    setDownloadLater(StorageService.getDownloadLater());
  }, []);

  const isDownloadLater = useCallback((url: string) => {
    return downloadLater.some(l => l.url === url);
  }, [downloadLater]);

  const value = useMemo(() => ({
    downloadLater,
    addToDownloadLater,
    removeFromDownloadLater,
    isDownloadLater,
  }), [downloadLater, addToDownloadLater, removeFromDownloadLater, isDownloadLater]);

  return (
    <DownloadLaterContext.Provider value={value}>
      {children}
    </DownloadLaterContext.Provider>
  );
};

export const useDownloadLater = () => {
  const context = useContext(DownloadLaterContext);
  if (!context) {
    throw new Error('useDownloadLater must be used within a DownloadLaterProvider');
  }
  return context;
};
