/**
 * DownloadsContext - Active downloads state.
 * Consumed by 2 components (DownloadManager, Sidebar).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { DownloadItem } from '../types';
import { DownloadEngine } from '../core/engine/DownloadEngine';

interface DownloadsContextType {
  downloads: DownloadItem[];
}

const DownloadsContext = createContext<DownloadsContextType | undefined>(undefined);

export const DownloadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  useEffect(() => {
    const handleUpdate = (items: DownloadItem[]) => {
      setDownloads(items);
    };
    DownloadEngine.addListener(handleUpdate);
    return () => {
      DownloadEngine.removeListener(handleUpdate);
    };
  }, []);

  const value = useMemo(() => ({
    downloads,
  }), [downloads]);

  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
};

export const useDownloads = () => {
  const context = useContext(DownloadsContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadsProvider');
  }
  return context;
};

/**
 * Contador barato p/ badges: reassina o engine e só propaga quando a
 * CONTAGEM muda — não re-renderiza a cada tick de progresso (4x/s).
 */
export const useDownloadCount = (statuses: string[]): number => {
  const key = statuses.join(',');
  const [count, setCount] = useState(() =>
    DownloadEngine.getItems().filter(i => statuses.includes(i.status)).length
  );

  useEffect(() => {
    const wanted = key.split(',');
    const update = (items: DownloadItem[]) => {
      const c = items.filter(i => wanted.includes(i.status)).length;
      setCount(prev => (prev === c ? prev : c));
    };
    DownloadEngine.addListener(update);
    return () => {
      DownloadEngine.removeListener(update);
    };
  }, [key]);

  return count;
};
