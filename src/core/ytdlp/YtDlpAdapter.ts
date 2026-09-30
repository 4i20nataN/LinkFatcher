import type { ProbeOptions, SearchOptions, SearchResult } from '../../types';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electron?.invoke;
}

async function callElectron<T>(channel: string, payload?: unknown): Promise<T> {
  if (isElectron()) {
    return window.electron.invoke(channel, payload) as Promise<T>;
  }
  throw new Error('Electron bridge unavailable');
}

async function callTauri<T>(command: string, payload?: unknown): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  // Tauri resolve cada parâmetro do comando pela CHAVE do objeto: todos os
  // nossos comandos recebem um único parâmetro chamado `options`, então o
  // payload vai aninhado. Sem payload (ex. status) não envia nada.
  const args = payload === undefined ? undefined : { options: payload };
  return invoke<T>(command, args as Record<string, unknown>);
}

/**
 * Comandos Tauri rejeitam com a string crua (`Result<_, String>`), não com
 * `Error` — `err.message` seria `undefined` e a UI mostraria só o genérico.
 */
export function adapterErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err) return err;
  if (err instanceof Error && err.message) return err.message;
  const m = (err as { message?: unknown })?.message;
  if (typeof m === 'string' && m) return m;
  return fallback;
}

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export { isAndroid };

export const YtDlpAdapter = {
  async probe(url: string, options?: any) {
    if (isTauri()) {
      // No Android os comandos Rust (`ytdlp_probe`, ...) encaminham ao
      // yt-dlp embarcado via plugin Kotlin — mesmo transporte do desktop.
      return callTauri('ytdlp_probe', { url, ...options });
    }
    if (isElectron()) {
      return (window as any).electron.invoke('yt-dlp-probe', { url, ...options });
    }
    throw new Error('No transport available (requires app)');
  },

  async search(query: string, platform = 'youtube', maxResults = 10, options?: any) {
    if (isTauri()) {
      return callTauri('ytdlp_search', { query, platform, maxResults, ...options });
    }
    if (isElectron()) {
      return (window as any).electron.invoke('yt-dlp-search', { query, platform, maxResults, ...options });
    }
    throw new Error('No transport available (requires app)');
  },

  async download(params: any) {
    if (isTauri()) {
      return callTauri('ytdlp_download', params);
    }
    if (isElectron()) {
      return (window as any).electron.invoke('yt-dlp-download', params);
    }
    throw new Error('No transport available (requires app)');
  },

  async cancel(id: string) {
    if (isTauri()) {
      return callTauri('ytdlp_cancel', { id });
    }
    if (isElectron()) {
      return (window as any).electron.invoke('yt-dlp-cancel', id);
    }
    throw new Error('No transport available (requires app)');
  },
};

// Cache em memória do dump-json por URL: re-analisar o mesmo link (retry,
// voltar de tela, clipboard) não paga outra extração — no yt-dlp embarcado
// do Android cada probe custa segundos em aparelho fraco. TTL curto: o
// catálogo muda, mas não em minutos.
const PROBE_CACHE_TTL_MS = 10 * 60 * 1000;
// Teto de RAM: cada dump-json tem ~1MB; 10 entradas ≈ 10MB no pior caso.
const PROBE_CACHE_MAX = 10;
const probeCache = new Map<string, { at: number; data: any }>();

function probeCacheKey(options: ProbeOptions): string {
  return `${options.url}::${options.proxy ?? ''}`;
}

export async function probeUrlWithAdapter(options: ProbeOptions): Promise<any> {
  const key = probeCacheKey(options);
  const hit = probeCache.get(key);
  if (hit && Date.now() - hit.at < PROBE_CACHE_TTL_MS) {
    return hit.data;
  }
  probeCache.delete(key);
  let data: any;
  if (isTauri()) {
    data = await callTauri<any>('ytdlp_probe', options);
  } else if (isElectron()) {
    // Electron: use IPC bridge (via shim no Tauri/dev)
    data = await callElectron<any>('yt-dlp-probe', options);
  } else {
    throw new Error('No transport available (requires app)');
  }
  probeCache.set(key, { at: Date.now(), data });
  if (probeCache.size > PROBE_CACHE_MAX) {
    const oldest = probeCache.keys().next().value;
    if (oldest !== undefined) probeCache.delete(oldest);
  }
  return data;
}

export async function probePlaylistWithAdapter(options: { url: string; proxy?: string }): Promise<any> {
  if (isTauri()) {
    return callTauri<any>('ytdlp_probe_playlist', options);
  }
  if (isElectron()) {
    return callElectron<any>('yt-dlp-probe-playlist', options);
  }
  throw new Error('No transport available (requires app)');
}

export async function searchVideosWithAdapter(options: SearchOptions): Promise<SearchResult[]> {
  if (isTauri()) {
    return callTauri<SearchResult[]>('ytdlp_search', options);
  }
  // Electron: use IPC bridge
  if (isElectron()) {
    return callElectron<SearchResult[]>('yt-dlp-search', options);
  }
  throw new Error('No transport available (requires app)');
}

export async function getYtDlpStatusWithAdapter(): Promise<{ ready: boolean; binaryPath?: string; version?: string }> {
  if (isTauri()) {
    return callTauri<{ ready: boolean; binaryPath?: string; version?: string }>('ytdlp_status');
  }
  // Electron: use IPC bridge
  if (isElectron()) {
    return callElectron<{ ready: boolean; binaryPath?: string }>('yt-dlp-status');
  }
  return { ready: false };
}
