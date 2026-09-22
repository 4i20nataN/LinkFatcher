import { DownloadItem, MediaInfo, MediaFormat, AppSettings } from '../../types';
import type { FormatOptions } from '../../features/downloads/FormatOptions';

type EngineListener = (items: DownloadItem[]) => void;

// Quality label → height string for yt-dlp
function extractQualityHeight(qualityLabel: string): string {  if (qualityLabel.includes('2160') || qualityLabel.includes('4K')) return '2160';
  if (qualityLabel.includes('1440')) return '1440';
  if (qualityLabel.includes('1080')) return '1080';
  if (qualityLabel.includes('720')) return '720';
  if (qualityLabel.includes('480')) return '480';
  if (qualityLabel.includes('360')) return '360';
  if (qualityLabel.includes('240')) return '240';
  return '1080'; // safe default
}

// 429 = YouTube limitou o ritmo do IP (transitório): orienta espera em vez
// de retry imediato em loop. Puro UI, sem tocar no argv canônico.
function withRateLimitHint(msg: string, lang: string): string {
  if (/429|too many requests/i.test(msg) && !/429.*aguarde|wait.*429/i.test(msg)) {
    return lang === 'en'
      ? `${msg} · YouTube rate-limited this IP (429): wait a few minutes and retry`
      : `${msg} · YouTube limitou o ritmo (429): aguarde alguns minutos e tente de novo`;
  }
  return msg;
}

// Platforms that support real yt-dlp extraction
const YT_DLP_PLATFORMS = new Set([
  'youtube', 'tiktok', 'instagram', 'facebook', 'x', 'reddit', 'soundcloud', 'twitch', 'vimeo'
]);

class DownloadEngineClass {
  private items: DownloadItem[] = [];
  private listeners: Set<EngineListener> = new Set();

  // Map download id → cancel function
  private cancelFns = new Map<string, () => void>();
  // Throttle de renders: último notify de progresso por download (ms)
  private lastProgressNotify = new Map<string, number>();

  private settings: AppSettings = {
    themeMode: 'dark',
    accentColor: 'emerald',
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

  constructor() {
    this.loadState();
  }

  setSettings(newSettings: AppSettings) {
    this.settings = newSettings;
    this.processQueue();
  }

  private loadState() {
    try {
      const stored = localStorage.getItem('universal_downloader_items');
      if (stored) {
        const parsed: DownloadItem[] = JSON.parse(stored);
        this.items = parsed.map(item => {
          // `processing` é transiente (fase do ffmpeg) — nunca sobrevive reload.
          // Reset in-progress downloads to queued on reload
          if (item.status === 'downloading') {
            return { ...item, status: 'paused', speed: 0, eta: 0, processing: false };
          }
          return { ...item, processing: false };
        });
      }
    } catch (e) {
      console.error('Error loading engine state', e);
      this.items = [];
    }
  }

  // Android WebView localStorage is capped at ~5MB — keep only the most recent
  // finished entries so a long history doesn't blow the quota. Active items
  // (queued/downloading/paused) are never trimmed.
  private static readonly MAX_PERSISTED_FINISHED = 300;

  // Progresso notifica até 4x/s: JSON.stringify + localStorage na main thread
  // a cada tick derruba o scroll no WebKitGTK por software. Persiste no máx.
  // 1x/2s durante atividade; transições de estado forçam persistência.
  private static readonly PERSIST_THROTTLE_MS = 2000;
  private lastPersistedAt = 0;

  private saveState(force = false) {
    const now = Date.now();
    if (!force && now - this.lastPersistedAt < DownloadEngineClass.PERSIST_THROTTLE_MS) return;
    this.lastPersistedAt = now;
    try {
      const active = this.items.filter(i => ['queued', 'downloading', 'paused'].includes(i.status));
      const finished = this.items.filter(i => !['queued', 'downloading', 'paused'].includes(i.status));
      const trimmedFinished = finished.slice(0, DownloadEngineClass.MAX_PERSISTED_FINISHED);
      const toPersist = [...active, ...trimmedFinished];
      localStorage.setItem('universal_downloader_items', JSON.stringify(toPersist));
    } catch (e) {
      console.error('Error saving engine state', e);
    }
  }

  getItems(): DownloadItem[] {
    return [...this.items];
  }

  addListener(listener: EngineListener) {
    this.listeners.add(listener);
    listener(this.getItems());
  }

  removeListener(listener: EngineListener) {
    this.listeners.delete(listener);
  }

  private notify(persist = true) {
    const current = this.getItems();
    this.listeners.forEach(l => l(current));
    this.saveState(persist);
  }

  addDownload(media: MediaInfo, format: MediaFormat, formatOptions?: FormatOptions | null) {
    // Repetidos permitidos: sufixo (1), (2)... no nome para não sobrescrever
    // o arquivo no disco (o yt-dlp sobrescreveria silenciosamente) nem colocar
    // dois processos ao vivo brigando pelo mesmo .part/saída (→ Errno 2).
    // A chave é url + container de saída + base do nome: qualidades diferentes
    // do mesmo container resolvem para o mesmo caminho no disco.
    const outContainerOf = (audioOnly?: boolean, audioFormat?: string, mergeFmt?: string, ext?: string) =>
      audioOnly ? (audioFormat || 'mp3') : (mergeFmt || ext || '');
    const familyBaseOf = (name?: string) =>
      ((name && name.trim()) || '%(title)s').replace(/ \(\d+\)$/, '');
    const newContainer = outContainerOf(
      formatOptions?.audioOnly, formatOptions?.audioFormat,
      formatOptions?.videoFormat, format.ext,
    );
    const newBase = familyBaseOf(formatOptions?.customFilename);
    const sameCount = this.items.filter(item =>
      item.url === media.originalUrl
      && outContainerOf(item.audioOnly, item.audioFormat, item.mergeOutputFormat, item.format.ext) === newContainer
      && familyBaseOf(item.customFilename) === newBase
    ).length;
    let customFilename = formatOptions?.customFilename;
    if (sameCount > 0) {
      customFilename = `${newBase} (${sameCount})`;
    }

    const defaultSizeByType: Record<string, number> = {
      video: 25 * 1024 * 1024,
      audio: 6 * 1024 * 1024,
      image: 2 * 1024 * 1024,
    };

    // Use probe size if available; real file size will be updated via OS-native
    // stat after download + FFmpeg merge completes (see complete handlers below).
    const sizeTotal = format.sizeBytes > 0 ? format.sizeBytes : 0;

    const newItem: DownloadItem = {
      id: `dl_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      title: media.title,
      thumbnailUrl: media.thumbnailUrl,
      platform: media.platform,
      format,
      formatString: formatOptions?.audioOnly ? 'bestaudio/best' : formatOptions?.format,
      audioOnly: formatOptions?.audioOnly,
      audioFormat: formatOptions?.audioFormat,
      audioQuality: formatOptions?.audioQuality,
      writeSubs: formatOptions?.writeSubs,
      writeAutoSubs: formatOptions?.writeAutoSubs,
      subLangs: formatOptions?.subLangs,
      subFormat: formatOptions?.subFormat,
      embedSubs: formatOptions?.embedSubs,
      writeThumbnail: formatOptions?.writeThumbnail,
      embedThumbnail: formatOptions?.embedThumbnail,
      embedMetadata: formatOptions?.embedMetadata,
      mergeOutputFormat: formatOptions?.videoFormat || undefined,
      concurrentFragments: formatOptions?.concurrentFragments,
      retries: formatOptions?.retries,
      restrictFilenames: formatOptions?.restrictFilenames,
      noOverwrites: formatOptions?.noOverwrites,
      keepVideo: formatOptions?.keepVideo,
      videoOnly: formatOptions?.videoOnly,
      downloadSections: formatOptions?.downloadSections,
      sponsorblockRemove: formatOptions?.sponsorblockRemove,
      fpsMax: formatOptions?.fpsMax,
      bandLimit: formatOptions?.bandLimit,
      videoCodec: formatOptions?.videoCodec,
      customFilename,
      normalizeAudio: formatOptions?.normalizeAudio,
      videoSharpen: formatOptions?.videoSharpen,
      imageSource: (format.type === 'image' && /\.(jpe?g|png|gif|webp|bmp|tiff?|svg|heic|avif)(\?|$)/i.test(media.originalUrl))
        ? 'user-link'
        : undefined,
      sizeTotal,
      sizeDownloaded: 0,
      progress: 0,
      durationSeconds: media.durationSeconds > 0 ? media.durationSeconds : undefined,
      speed: 0,
      eta: 0,
      status: 'queued',
      addedAt: new Date().toISOString(),
      url: media.originalUrl,
    };

    this.items.unshift(newItem);
    this.notify();
    this.processQueue();
  }

  pauseDownload(id: string) {
    const item = this.items.find(i => i.id === id);
    if (!item || item.status !== 'downloading') return;

    // Cancel any active download function
    const cancelFn = this.cancelFns.get(id);
    if (cancelFn) {
      cancelFn();
      this.cancelFns.delete(id);
    }

    item.status = 'paused';
    item.speed = 0;
    item.eta = 0;
    item.processing = false;
    this.notify();
  }

  resumeDownload(id: string) {
    const item = this.items.find(i => i.id === id);
    if (!item || item.status !== 'paused') return;

    item.status = 'queued';
    item.processing = false;
    this.notify();
    this.processQueue();
  }

  // Limpeza post-mortem de parciais (.part/.ytdl/.cuttmp/-Frag*). O backend
  // só apaga artefatos temporários dentro da pasta de downloads — o arquivo
  // final nunca é tocado, então é seguro chamar para qualquer status.
  private fireCleanup(id: string, filePath?: string) {
    import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('ytdlp_cleanup', { id, filePath }).catch(() => {})
    ).catch(() => {});
  }

  cancelDownload(id: string) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    // Cancel any active download function
    const cancelFn = this.cancelFns.get(id);
    if (cancelFn) {
      cancelFn();
      this.cancelFns.delete(id);
    }

    item.status = 'cancelled';
    item.speed = 0;
    item.eta = 0;
    item.processing = false;
    this.notify();
  }

  removeDownload(id: string) {
    const item = this.items.find(i => i.id === id);
    this.items = this.items.filter(i => i.id !== id);
    // Item fora da lista não tem mais resume: apaga parciais órfãos.
    // Só temporários (.part etc.) — o final de `completed` é preservado.
    if (item && item.status !== 'downloading') {
      this.fireCleanup(item.id, item.filePath);
    }
    this.notify();
  }

  clearCompleted() {
    const removed = this.items.filter(i => ['completed', 'failed', 'cancelled'].includes(i.status));
    this.items = this.items.filter(i => !['completed', 'failed', 'cancelled'].includes(i.status));
    for (const item of removed) {
      this.fireCleanup(item.id, item.filePath);
    }
    this.notify();
  }

  retryDownload(id: string) {
    const item = this.items.find(i => i.id === id);
    if (!item || !['failed', 'cancelled'].includes(item.status)) return;

    // Regenera com o preset anterior: todos os campos de opção do item são
    // reaproveitados no argv (nada se perde). Zera os contadores p/ não exibir
    // bytes obsoletos enquanto o yt-dlp retoma o .part.
    item.status = 'queued';
    item.progress = 0;
    item.speed = 0;
    item.eta = 0;
    item.sizeDownloaded = 0;
    item.processing = false;
    item.error = undefined;
    this.notify();
    this.processQueue();
  }

  pauseAll() {
    this.items
      .filter(i => i.status === 'downloading')
      .forEach(i => this.pauseDownload(i.id));
  }

  resumeAll() {
    this.items
      .filter(i => i.status === 'paused')
      .forEach(i => this.resumeDownload(i.id));
  }

  cancelAll() {
    this.items
      .filter(i => ['queued', 'downloading'].includes(i.status))
      .forEach(i => this.cancelDownload(i.id));
  }

  private processQueue() {
    const activeCount = this.items.filter(i => i.status === 'downloading').length;
    const maxConcurrent = this.settings.maxConcurrent || 3;

    if (activeCount >= maxConcurrent) return;

    const queued = this.items
      .filter(i => i.status === 'queued')
      .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());

    const slotsAvailable = maxConcurrent - activeCount;
    const toStart = queued.slice(0, slotsAvailable);

    for (const item of toStart) {
      this.startDownload(item);
    }
  }

  private async startDownload(item: DownloadItem) {
    item.status = 'downloading';
    this.notify();

    // Desktop Tauri é o único transporte (web/mobile removidos).
    const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    if (!isTauri) {
      item.status = 'failed';
      item.error = 'Download disponível apenas no app desktop';
      this.notify();
      return;
    }
    await this.startTauriDownload(item);
  }
  private async startTauriDownload(item: DownloadItem) {
    const { adapterErrorMessage } = await import('../ytdlp/YtDlpAdapter');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      // Get default download dir
      let outputDir = this.settings.defaultDir || '';
      if (!outputDir) {
        try {
          outputDir = await invoke('fs_get_downloads_path');
        } catch {
          outputDir = '';
        }
      }

      // Prepare params for ytdlp_download (uses DownloadParams from args.rs)
      const params = {
        id: item.id,
        url: item.url,
        format: item.formatString,
        audioOnly: item.audioOnly,
        audioFormat: item.audioFormat,
        audioQuality: item.audioQuality,
        writeSubs: item.writeSubs,
        writeAutoSubs: item.writeAutoSubs,
        subLangs: item.subLangs,
        subFormat: item.subFormat,
        embedSubs: item.embedSubs,
        writeThumbnail: item.writeThumbnail,
        embedThumbnail: item.embedThumbnail,
        embedMetadata: item.embedMetadata,
        mergeOutputFormat: item.mergeOutputFormat,
        restrictFilenames: item.restrictFilenames,
        concurrentFragments: item.concurrentFragments,
        retries: item.retries,
        keepVideo: item.keepVideo,
        videoOnly: item.videoOnly,
        downloadSections: item.downloadSections,
        sponsorblockRemove: item.sponsorblockRemove,
        fpsMax: item.fpsMax,
        customFilename: item.customFilename,
        videoCodec: item.videoCodec,
        normalizeAudio: item.normalizeAudio,
        videoSharpen: item.videoSharpen,
        bandLimit: item.bandLimit,
        noOverwrites: item.noOverwrites,
        outputDir,
      };

      // Listen for yt-dlp-progress events (compat Electron).
      // Um listener por download, filtrado por id; `finish` é idempotente e
      // sempre chamado no fim (conclusão/erro/invoke) para não vazar.
      const unlisten = await listen('yt-dlp-progress', (event) => {
        const data = event.payload as any;
        if (data.id !== item.id) return;

        if (data.type === 'progress') {
          item.progress = typeof data.percent === 'number' ? data.percent : (parseFloat(data.percent) || 0);
          // Velocidade do yt-dlp é instantânea por intervalo — oscila muito.
          // EMA (α=0.4) estabiliza o número sem mascarar queda real (0 entra direto).
          const rawSpeed = parseFloat(data.speed) || 0;
          item.speed = rawSpeed <= 0 || item.speed <= 0 ? rawSpeed : item.speed + 0.4 * (rawSpeed - item.speed);
          item.eta = parseFloat(data.eta) || 0;
          if (data.downloaded && data.downloaded > 0) {
            item.sizeDownloaded = data.downloaded;
          }
          if (data.total && data.total > 0) {
            item.sizeTotal = data.total;
          }
          // Progresso chega várias vezes por segundo: re-render no máximo 4x/s.
          // Valores continuam atualizados; estados finais passam direto.
          const now = Date.now();
          if (now - (this.lastProgressNotify.get(item.id) ?? 0) >= 250) {
            this.lastProgressNotify.set(item.id, now);
            this.notify(false);
          }
        } else if (data.type === 'processing') {
          // Stdout fechou mas o processo segue (ffmpeg cortando em silêncio):
          // mantém `downloading` e sinaliza a fase p/ UI honesta.
          if (item.status === 'downloading') {
            item.processing = true;
            item.speed = 0;
            item.eta = 0;
            this.notify();
          }
        } else if (data.type === 'complete') {
          // Conclusão tardia (ex. corte local após cancel) não ressuscita.
          if (item.status === 'paused' || item.status === 'cancelled') {
            finish();
            return;
          }
          item.status = 'completed';
          item.progress = 100;
          item.processing = false;
          if (data.filePath) item.filePath = data.filePath;
          if (data.size && data.size > 0) {
            item.sizeTotal = data.size;
            item.sizeDownloaded = data.size;
          }
          item.finishedAt = new Date().toISOString();
          this.cancelFns.delete(item.id);
          this.lastProgressNotify.delete(item.id);
          finish();
          this.notify();
        } else if (data.type === 'error') {
          // Pausa/cancelamento matam o processo de propósito: o erro tardio
          // do kill não pode sobrescrever a intenção do usuário.
          if (item.status === 'paused' || item.status === 'cancelled') {
            finish();
            return;
          }
          item.status = 'failed';
          item.processing = false;
          item.error = withRateLimitHint(data.message || 'Download failed', this.settings.language);
          this.cancelFns.delete(item.id);
          this.lastProgressNotify.delete(item.id);
          finish();
          this.notify();
        }
      });

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { unlisten(); } catch { /* unlisten idempotente */ }
      };

      // Store unlisten and kill hook for cancel/pause. O status já foi
      // ajustado pelo chamador: `cancelled` = definitivo (apaga .part),
      // `paused` = preserva o .part para resume.
      this.cancelFns.set(item.id, () => {
        finish();
        this.lastProgressNotify.delete(item.id);
        const args = item.status === 'cancelled'
          ? { id: item.id, cleanup: true }
          : { id: item.id };
        invoke('ytdlp_cancel', args).catch(() => {});
      });

      // Start download
      const resultPath = await invoke<string>('ytdlp_download', { options: params });
      finish();
      if (resultPath && item.status === 'downloading') {
        item.status = 'completed';
        item.progress = 100;
        item.processing = false;
        item.filePath = resultPath;
        item.finishedAt = new Date().toISOString();
        this.cancelFns.delete(item.id);
        this.notify();
      }
    } catch (error: any) {
      // O kill de pausa/cancelamento rejeita o invoke de propósito: a intenção
      // do usuário prevalece — nunca converter em "failed".
      if (item.status === 'paused' || item.status === 'cancelled') {
        item.processing = false;
        this.cancelFns.delete(item.id);
        this.lastProgressNotify.delete(item.id);
        this.notify();
        return;
      }
      item.status = 'failed';
      item.processing = false;
      item.error = withRateLimitHint(adapterErrorMessage(error, 'Download failed'), this.settings.language);
      this.cancelFns.delete(item.id);
      this.lastProgressNotify.delete(item.id);
      this.notify();
    }
  }

  // Reordena por id (não por índice): a UI filtra a lista, então o índice
  // visível não corresponde ao array interno — índice movia o item errado.
  moveQueuedItem(id: string, delta: -1 | 1): void {
    const queued = this.items.filter(i => i.status === 'queued');
    const from = queued.findIndex(i => i.id === id);
    if (from < 0) return;
    const to = from + delta;
    if (to < 0 || to >= queued.length) return;

    const [moved] = queued.splice(from, 1);
    queued.splice(to, 0, moved);

    // Rebuild items array keeping non-queued items in place
    const nonQueued = this.items.filter(i => i.status !== 'queued');
    this.items = [...queued, ...nonQueued];
    this.notify();
  }

  clearHistory(): void {
    const removed = this.items.filter(i => !['queued', 'downloading', 'paused'].includes(i.status));
    this.items = this.items.filter(i => ['queued', 'downloading', 'paused'].includes(i.status));
    for (const item of removed) {
      this.fireCleanup(item.id, item.filePath);
    }
    this.notify();
  }

  // Progress helpers
  getOverallProgress(): { total: number; downloaded: number; percentage: number } {
    const active = this.items.filter(i => ['queued', 'downloading', 'paused'].includes(i.status));
    const total = active.reduce((sum, i) => sum + (i.sizeTotal || 0), 0);
    const downloaded = active.reduce((sum, i) => sum + (i.sizeDownloaded || 0), 0);
    return {
      total,
      downloaded,
      percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
    };
  }

  getActiveDownloads(): DownloadItem[] {
    return this.items.filter(i => i.status === 'downloading');
  }

  getQueuedDownloads(): DownloadItem[] {
    return this.items.filter(i => i.status === 'queued');
  }

  getCompletedDownloads(): DownloadItem[] {
    return this.items.filter(i => i.status === 'completed');
  }

  getFailedDownloads(): DownloadItem[] {
    return this.items.filter(i => i.status === 'failed');
  }

  getCancelledDownloads(): DownloadItem[] {
    return this.items.filter(i => i.status === 'cancelled');
  }

  getPausedDownloads(): DownloadItem[] {
    return this.items.filter(i => i.status === 'paused');
  }
}

// Singleton export
export const DownloadEngine = new DownloadEngineClass();
export default DownloadEngine;
