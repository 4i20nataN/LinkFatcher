/**
 * DownloadsContext - Active downloads state.
 * Consumed by 2 components (DownloadManager, Sidebar).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DownloadItem } from '../types';
import { DownloadEngine } from '../core/engine/DownloadEngine';
import { StorageService } from '../core/storage/Storage';
import { isAndroid } from '../core/ytdlp/YtDlpAdapter';

interface DownloadsContextType {
  downloads: DownloadItem[];
}

const DownloadsContext = createContext<DownloadsContextType | undefined>(undefined);

export const DownloadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  // Ids já vistos: evita notificar itens concluídos antes do boot (histórico
  // restaurado) e duplicar aviso no mesmo item.
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const handleUpdate = (items: DownloadItem[]) => {
      setDownloads(items);
      if (seenIds.current === null) {
        seenIds.current = new Set(items.map(i => i.id));
        return;
      }
      const settings = StorageService.getSettings();
      if (settings.notifications === false) {
        for (const i of items) seenIds.current.add(i.id);
        return;
      }
      // No Android o Kotlin emite notificações nativas (progresso + conclusão
      // + falha): o caminho JS duplicaria o aviso — desktop apenas.
      if (isAndroid()) {
        for (const i of items) seenIds.current.add(i.id);
        return;
      }
      const en = settings.language === 'en';
      for (const item of items) {
        if (seenIds.current.has(item.id)) continue;
        seenIds.current.add(item.id);
        if (item.status === 'completed') {
          import('../native/notify').then(({ sendDownloadNotification }) =>
            sendDownloadNotification(
              en ? 'Download complete' : 'Download concluído',
              item.title,
            ).catch(() => {})
          ).catch(() => {});
        } else if (item.status === 'failed') {
          import('../native/notify').then(({ sendDownloadNotification }) =>
            sendDownloadNotification(
              en ? 'Download failed' : 'Falha no download',
              item.title,
            ).catch(() => {})
          ).catch(() => {});
        }
      }
    };
    DownloadEngine.addListener(handleUpdate);
    // Volta ao foreground: reconcilia downloads cujo `complete` se perdeu
    // com o WebView suspenso (travariam em `downloading` com arquivo em
    // disco). Fire-and-forget; o engine filtra (só Android, só stale).
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        DownloadEngine.reconcileStuck().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      DownloadEngine.removeListener(handleUpdate);
      document.removeEventListener('visibilitychange', onVisible);
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
