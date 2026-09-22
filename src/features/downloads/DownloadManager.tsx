import React, { useState, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DownloadItem, AppSettings } from '../../types';
import { DownloadEngine } from '../../core/engine/DownloadEngine';
import { buildArgsPreview } from '../../core/ytdlp/buildArgsPreview';
import { 
  Play, Pause, X, Trash2, FolderOpen, Share2, RotateCcw, 
  ArrowUp, ArrowDown, ListOrdered, CheckCircle2, AlertTriangle, 
  Clock, TrendingUp, HelpCircle, ShieldCheck, ChevronRight,
  Subtitles, Scissors, Shield, Tag, Code
} from 'lucide-react';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { AnimatedToast } from '../../animation/AnimatedToast';
import { AnimatedModal } from '../../animation/AnimatedModal';
import { TabIndicator, LayoutGroup } from '../../animation/TabIndicator';
import { slideUp, slideExitLeft, scaleIn, fadeIn, transitions } from '../../animation/variants';
import { useTranslation } from '../../core/i18n';
import { 
  getAccentBgClass, getAccentTextClass, getAccentBorderClass 
} from '../../components/ThemeWrapper';
import { ProviderRegistry } from '../../core/plugins/Providers';
import { PlatformBadge } from '../../components/PlatformBadge';
import { isPlaylistUrl } from '../../core/ytdlp/playlistUtils';

// Helper to format bytes to human readable sizes
const formatBytes = (bytes: number, decimals = 1) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Helper to format speed
const formatSpeed = (bytesPerSec: number) => {
  if (bytesPerSec <= 0) return '0 KB/s';
  return `${formatBytes(bytesPerSec)}/s`;
};

// Helper to format ETA. O backend entrega segundos fracionados (ex.
// 46.5571…s do `%(progress.eta)s`); arredonda antes de exibir.
const formatEta = (seconds: number) => {  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds <= 0) return '--';
  const total = Math.round(seconds);
  if (total >= 3600) {
    const hrs = Math.floor(total / 3600);
    const mins = Math.ceil((total % 3600) / 60);
    return `${hrs}h ${mins}m`;
  }
  if (total >= 60) {
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}m ${secs}s`;
  }
  return `${total}s`;
};

// Pure helper — sem side effects, pode ficar fora do componente.
// Playlist via isPlaylistUrl (parse real de parâmetro), não substring.
const getMediaType = (item: DownloadItem): string => {
  if (item.audioOnly) return 'audio';
  if (item.format.type === 'audio') return 'audio';
  if (item.format.type === 'image') return 'image';
  if (isPlaylistUrl(item.url)) return 'playlist';
  return 'video';
};

// Recorte (download_sections): o backend baixa o arquivo CHEIO pelo yt-dlp
// nativo (progresso real, resume) e corta local com ffmpeg (`-c copy`) ao
// final — delegar `--download-sections` ao yt-dlp faria o fetch via ffmpeg
// remoto (lento/403 no YouTube, stdout mudo, sem resume). Efeito colateral
// honesto: o total exibido é o do vídeo completo; o trecho é extraído no
// fim (fase `processing`). Por isso a linha de tamanho identifica o total
// como original quando há `downloadSections`.

export const DownloadManager: React.FC = () => {
  const { settings, downloads } = useApp();
  const { t } = useTranslation(settings);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'audio' | 'video' | 'image' | 'playlist'>('all');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [commandPreview, setCommandPreview] = useState<DownloadItem | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2000);
  }, []);

  // Bulk queue operations
  const handlePauseAll = () => {
    downloads.forEach(d => {
      if (d.status === 'downloading') {
        DownloadEngine.pauseDownload(d.id);
      }
    });
    showToast(settings.language === 'en' ? 'All active downloads paused' : 'Todos os downloads ativos foram pausados');
  };

  const handleResumeAll = () => {
    downloads.forEach(d => {
      if (['paused', 'failed', 'cancelled'].includes(d.status)) {
        DownloadEngine.resumeDownload(d.id);
      }
    });
    showToast(settings.language === 'en' ? 'Download queue resumed' : 'Fila de downloads retomada');
  };

  const handleCancelAll = () => {
    downloads.forEach(d => {
      if (['queued', 'downloading', 'paused'].includes(d.status)) {
        DownloadEngine.cancelDownload(d.id);
      }
    });
    showToast(settings.language === 'en' ? 'Download queue cancelled' : 'Fila de downloads cancelada');
  };

  const handleClearStatusFilters = () => {
    setStatusFilters(new Set());
  };

  // Reordering helpers — por id: o índice visível é da lista filtrada e não
  // corresponde ao array interno do engine (só-queued).
  const handleMoveUp = (id: string) => {
    DownloadEngine.moveQueuedItem(id, -1);
  };

  const handleMoveDown = (id: string) => {
    DownloadEngine.moveQueuedItem(id, 1);
  };

  // Toggle status filter (multi-select OR)
  const toggleStatus = (status: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleShare = async (item: DownloadItem) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, url: item.url });
      } catch (err: any) {
        // AbortError = user dismissed the native share sheet, not a real failure
        if (err?.name !== 'AbortError') {
          showToast(settings.language === 'en' ? 'Failed to share link.' : 'Falha ao compartilhar link.');
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(item.url);
      showToast(settings.language === 'en' ? 'Original link copied for sharing!' : 'Link original copiado para compartilhamento!');
    } catch (_) {
      showToast(settings.language === 'en' ? 'Failed to copy link.' : 'Falha ao copiar link.');
    }
  };

  const handleOpenFolder = async (item: DownloadItem) => {
    if (!window.electron?.invoke) return;
    const target = item.filePath || settings.defaultDir || await window.electron.invoke('shell:getDownloadsPath');
    if (target) {
      window.electron.invoke('shell:openPath', target).catch(() => {
        showToast(settings.language === 'en' ? 'Failed to open folder' : 'Falha ao abrir pasta');
      });
    }
  };

  // Calculate global summary states
  const activeDownloads = useMemo(() => downloads.filter(d => d.status === 'downloading'), [downloads]);
  const totalSpeed = useMemo(() => activeDownloads.reduce((sum, d) => sum + d.speed, 0), [activeDownloads]);
  
  const downloadingOrQueued = useMemo(() => downloads.filter(d => ['downloading', 'queued'].includes(d.status)), [downloads]);
  const overallProgress = downloadingOrQueued.length > 0 
    ? Math.floor(downloadingOrQueued.reduce((sum, d) => sum + d.progress, 0) / downloadingOrQueued.length)
    : 0;

  // Filter list: media type (AND) + status (OR)
  const filteredDownloads = useMemo(() => downloads.filter(item => {
    // Media type filter (AND)
    if (mediaFilter !== 'all') {
      if (getMediaType(item) !== mediaFilter) return false;
    }
    // Status filter (OR) — if none active, show all
    if (statusFilters.size > 0) {
      if (!statusFilters.has(item.status)) return false;
    }
    return true;
  }), [downloads, mediaFilter, statusFilters]);

  // Ordem real da fila (só-queued): base p/ habilitar as setas de reordenar.
  const queuedIds = useMemo(() => downloads.filter(d => d.status === 'queued').map(d => d.id), [downloads]);

  return (
    <LayoutGroup>
    <div className="max-w-4xl mx-auto space-y-6 py-2 md:py-6 px-4 relative">
      {/* Toast alert popup */}
      <AnimatedList>
        {toastMsg && (
          <AnimatedCard
            variant={scaleIn}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-50 px-4 py-3 rounded-xl lf-surface border lf-border-strong text-xs font-semibold text-white shadow-2xl flex items-center gap-2.5"
          >
            {settings.iconStyle === 'emoji' ? <span>✅</span> : <ShieldCheck size={16} className={getAccentTextClass(settings)} />}
            {toastMsg}
          </AnimatedCard>
        )}
      </AnimatedList>

      {/* Header Info */}
      <div className="text-center md:text-left space-y-2">
        <h2 className="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight">
          {t('downloadsTitle')}
        </h2>
        <p className="lf-text-secondary text-sm md:text-base">
          {t('downloadsSubtitle')}
        </p>
      </div>

      {/* Global Progress Dashboard Stats */}
      {downloadingOrQueued.length > 0 && (
        <AnimatedCard
          variant={fadeIn}
          className="p-5 rounded-2xl glass-card shadow-lg grid grid-cols-1 md:grid-cols-3 gap-6 items-center"
        >
          {/* Progress circle info */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
              <svg className="absolute w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="none" />
                <circle 
                  cx="32" 
                  cy="32" 
                  r="28" 
                  stroke="var(--color-primary)" 
                  strokeWidth="4" 
                  fill="none" 
                  strokeDasharray={175} 
                  strokeDashoffset={175 - (175 * overallProgress) / 100}
                  /* Sem transition: atualiza 4x/s e interpolar em loop repinta sem parar */
                />
              </svg>
              <span className="font-display font-bold text-sm text-white">{overallProgress}%</span>
            </div>
            <div>
              <span className="text-[10px] lf-text-muted font-mono uppercase block">{t('generalProgress')}</span>
              <span className="text-sm font-bold text-white block mt-0.5">
                {settings.language === 'en' ? 'Downloading' : 'Baixando'} {downloadingOrQueued.length} {downloadingOrQueued.length === 1 ? (settings.language === 'en' ? 'item' : 'mídia') : (settings.language === 'en' ? 'items' : 'mídias')}
              </span>
            </div>
          </div>

          {/* Speed stats */}
          <div className="flex items-center gap-3.5 border-y md:border-y-0 md:border-x lf-border py-4 md:py-0 md:px-6">
            <div className={`p-2 rounded-xl lf-surface ${getAccentTextClass(settings)} shrink-0`}>
              {/* Sem bounce: animação infinita decorativa repinta sem parar */}
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="text-[10px] lf-text-muted font-mono uppercase block">{t('activeSpeed')}</span>
              <span className="text-base font-bold text-white block mt-0.5">{formatSpeed(totalSpeed)}</span>
            </div>
          </div>

          {/* Bulk actions tools */}
          <div className="flex flex-wrap gap-2 justify-start md:justify-end">
            <button 
              onClick={handlePauseAll}
              className="px-3 py-1.5 rounded-lg lf-surface-raised hover:bg-zinc-700 border border-zinc-700/40 text-[10px] font-bold lf-text-secondary hover:text-white transition-colors"
            >
              {settings.language === 'en' ? 'Pause All' : 'Pausar Todos'}
            </button>
            <button 
              onClick={handleResumeAll}
              className="px-3 py-1.5 rounded-lg lf-surface-raised hover:bg-zinc-700 border border-zinc-700/40 text-[10px] font-bold lf-text-secondary hover:text-white transition-colors"
            >
              {settings.language === 'en' ? 'Resume All' : 'Retomar Todos'}
            </button>
            <button 
              onClick={handleCancelAll}
              className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/30 border border-red-900/20 text-[10px] font-bold text-red-300 hover:text-red-200 transition-colors"
            >
              {settings.language === 'en' ? 'Cancel All' : 'Cancelar Todos'}
            </button>
          </div>
          </AnimatedCard>
      )}

      {/* Media Type Tabs + Status Chips */}
      <div className="space-y-2">
        {/* Row 1: Media type tabs (underline style, full width) */}
        <div className="flex items-center gap-1 border-b lf-border">
          {[
            { id: 'all', label: settings.language === 'en' ? 'All' : 'Todos', icon: null },
            { id: 'audio', label: 'Audio', icon: '🔊' },
            { id: 'video', label: 'Video', icon: '🎞️' },
            { id: 'image', label: 'Imagem', icon: '🖼️' },
            { id: 'playlist', label: 'Playlists', icon: '📋' },
          ].map((tab) => {
            const isActive = mediaFilter === tab.id;
            const count = tab.id === 'all'
              ? downloads.length
              : downloads.filter(d => getMediaType(d) === tab.id).length;
            return (
              <button
                key={tab.id}
                onClick={() => setMediaFilter(tab.id as any)}
                className={`
                  flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all relative
                  ${isActive ? getAccentTextClass(settings) : 'lf-text-muted hover:text-zinc-300'}
                `}
              >
                <span>{tab.icon && `${tab.icon} `}{tab.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${isActive ? 'bg-white/15' : 'bg-white/5 lf-text-muted'}`}>
                    {count}
                  </span>
                )}
                {isActive && (
                  <TabIndicator
                    layoutId="active-media-tab"
                    className={`absolute bottom-0 left-0 right-0 h-0.5 ${getAccentBgClass(settings).split(' ')[0]}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Row 2: Status filter chips (discrete) */}
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs lf-text-muted font-medium mr-1">
            {settings.language === 'en' ? 'Status:' : 'Filtros:'}
          </span>
          {[
            { id: 'downloading', label: settings.language === 'en' ? 'Downloading' : 'Baixando', icon: settings.iconStyle === 'emoji' ? <span className="text-sm">📊</span> : <TrendingUp size={13} className={getAccentTextClass(settings)} /> },
            { id: 'queued', label: settings.language === 'en' ? 'Queued' : 'Fila', icon: settings.iconStyle === 'emoji' ? <span className="text-sm">⏳</span> : <Clock size={13} className={getAccentTextClass(settings)} /> },
            { id: 'completed', label: settings.language === 'en' ? 'Done' : 'Prontos', icon: settings.iconStyle === 'emoji' ? <span className="text-sm">✅</span> : <CheckCircle2 size={13} className={getAccentTextClass(settings)} /> },
            { id: 'paused', label: settings.language === 'en' ? 'Paused' : 'Pausados', icon: settings.iconStyle === 'emoji' ? <span className="text-sm">⏸️</span> : <Pause size={13} className={getAccentTextClass(settings)} /> },
            { id: 'failed', label: settings.language === 'en' ? 'Failed' : 'Falhas', icon: settings.iconStyle === 'emoji' ? <span className="text-sm">⚠️</span> : <AlertTriangle size={13} className={getAccentTextClass(settings)} /> },
            { id: 'cancelled', label: settings.language === 'en' ? 'Cancelled' : 'Cancelados', icon: settings.iconStyle === 'emoji' ? <span className="text-sm">❌</span> : <X size={13} className={getAccentTextClass(settings)} /> },
          ].map((chip) => {
            const isActive = statusFilters.has(chip.id);
            const count = downloads.filter(d => d.status === chip.id).length;
            return (
              <button
                key={chip.id}
                onClick={() => toggleStatus(chip.id)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5
                  ${isActive ? 'bg-white/10 lf-text-secondary border border-white/10' : 'lf-text-muted hover:text-zinc-400 border border-transparent'}
                `}
              >
                {chip.icon}
                {chip.label}
                {count > 0 && <span className="ml-0.5 text-[10px] opacity-50">{count}</span>}
              </button>
            );
          })}

          {/* Clear status filters button */}
          {statusFilters.size > 0 && (
            <>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                onClick={handleClearStatusFilters}
                className="px-3 py-1.5 rounded-lg text-xs lf-text-muted hover:text-zinc-300 font-medium transition-colors"
              >
                {settings.language === 'en' ? 'Clear' : 'Limpar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Queue items list */}
      <div className="space-y-3.5">
        {filteredDownloads.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center rounded-2xl lf-surface/10 border border-dashed lf-border flex flex-col items-center justify-center space-y-3">
            <div className="p-3 rounded-2xl lf-surface/60 lf-text-muted">
              {settings.iconStyle === 'emoji' ? <span className="text-2xl">⏳</span> : <Clock size={28} className={getAccentTextClass(settings)} />}
            </div>
            <div>
              <h4 className="font-semibold text-sm lf-text-secondary">{settings.language === 'en' ? 'No downloads found' : 'Nenhum download encontrado'}</h4>
              <p className="text-xs lf-text-muted mt-1">
                {settings.language === 'en' ? 'Your filtered download list is currently empty.' : 'Sua lista de downloads filtrada está vazia no momento.'}
              </p>
            </div>
          </div>
        ) : (
          /* Downloads Grid and List */
          <AnimatedList initial={false}>
            {filteredDownloads.map((item) => {
              const platform = ProviderRegistry.getPlatformConfig(item.platform);
              const isQueued = item.status === 'queued';
              const isDownloading = item.status === 'downloading';
              const isPaused = item.status === 'paused';
              const isCompleted = item.status === 'completed';
              const isFailed = ['failed', 'cancelled'].includes(item.status);
              // Recorte sem % real (stdout mudo) → indeterminado + bytes vivos.
              // O total exibido seria do arquivo cheio: omitir p/ não induzir.
              const isCutSilent = isDownloading && !!item.downloadSections && !(item.progress > 0);
              // Intervalo do trecho (`*01:00-02:00` → `01:00-02:00`) p/ rotular
              // o total como original completo durante o download.
              const cutRange = (item.downloadSections || '').replace(/^\*/, '');
              // Posição na fila real (só-queued): setas desabilitadas nos extremos.
              const queuePos = queuedIds.indexOf(item.id);

              return (
                <AnimatedCard
                  animateKey={item.id}
                  variant={slideExitLeft}
                  className="p-4 rounded-xl glass-card flex flex-col md:flex-row gap-4 items-start md:items-center relative overflow-hidden group hover:bg-white/10 transition-colors"
                >
                  {/* Status left indicator colored bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                    isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-rose-500' : isPaused ? 'bg-amber-500' : 'bg-indigo-500'
                  }`} />

                  {/* Thumbnail */}
                  <div className="relative w-full md:w-28 aspect-video rounded-lg overflow-hidden border lf-border lf-surface shrink-0">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[8px] font-mono lf-text-secondary">
                      {item.format.quality}
                    </span>
                  </div>

                  {/* Info contents details */}
                  <div className="flex-1 min-w-0 space-y-1.5 w-full">
                    <div className="flex flex-col sm:flex-row justify-between gap-1">
                      <h4 className="font-semibold text-xs text-white truncate pr-4" title={item.title}>
                        {item.title}
                      </h4>
                    </div>

                    {/* Feature tags row */}
                    <div className="flex flex-wrap gap-1">
                      {/* Platform badge */}
                      {platform && (
                        <PlatformBadge platformId={item.platform} name={platform.name} color={platform.color} variant="inline" />
                      )}
                      {/* Format ext chip — concluído: extensão do ARQUIVO real
                          (stream único ignora --merge-output-format, ex. webm
                          com tag MP4); pendente: container prometido */}
                      {(() => {
                        const doneExt = item.status === 'completed' && item.filePath
                          ? (item.filePath.split('.').pop() || '')
                          : '';
                        const outExt = doneExt
                          || (item.audioOnly
                            ? item.audioFormat
                            : (item.mergeOutputFormat || item.format.ext));
                        return outExt ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-white/10 lf-text-secondary border border-white/10">
                            {outExt.toUpperCase()}
                          </span>
                        ) : null;
                      })()}
                      {/* Image source badge */}
                      {item.imageSource && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold border ${
                          item.imageSource === 'user-link'
                            ? 'bg-pink-900/60 text-pink-300 border-pink-800/40'
                            : 'bg-zinc-700/60 text-zinc-400 border-zinc-600/40'
                        }`}>
                          {item.imageSource === 'user-link' ? `🔗 ${t('badgeImageUrl')}` : '🖼️ Thumbnail'}
                        </span>
                      )}
                      {/* Subtitles */}
                      {(item.writeSubs || item.writeAutoSubs) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-blue-900/60 text-blue-300 border border-blue-800/40">
                          <Subtitles size={8} />
                          {item.subLangs || 'EN'}
                        </span>
                      )}
                      {/* SponsorBlock */}
                      {item.sponsorblockRemove && item.sponsorblockRemove !== '' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-800/40">
                          <Shield size={8} />
                          Sponsor
                        </span>
                      )}
                      {/* Trimmed */}
                      {item.downloadSections && item.downloadSections !== '' && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-amber-900/60 text-amber-300 border border-amber-800/40"
                          title={settings.language === 'en' ? 'Downloads the full video, then extracts this section locally' : 'Baixa o vídeo completo e extrai este trecho localmente'}
                        >
                          <Scissors size={8} />
                          {t('badgeCut')}
                        </span>
                      )}
                      {/* Audio Only */}
                      {item.audioOnly && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-800/40">
                          <Tag size={8} />
                          {(item.audioFormat || 'mp3').toUpperCase()}
                          {item.audioQuality && item.audioQuality !== '0' && (
                            <span className="opacity-70">{item.audioQuality}</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Progress tracking bar */}
                    <div className="space-y-1">
                      <div 
                        className="relative w-full h-1.5 rounded-full bg-white/5 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={item.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Download progress: ${item.progress}%`}
                      >
                        {isCutSilent ? (
                          /* Recorte: sem % real → indeterminado + bytes vivos */
                          <div className="h-full w-1/4 rounded-full lf-indeterminate-bar" />
                        ) : (
                          <div 
                            /* Sem transition na largura: atualiza 4x/s e interpolar em loop
                               repinta sem parar no raster por software. */
                            className={`h-full rounded-full transition-colors duration-300 ${
                              isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-rose-500' : isPaused ? 'bg-amber-500' : getAccentBgClass(settings).split(' ')[0]
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        )}
                      </div>
                      
                      {/* Sub progress metrics */}
                      <div className="flex justify-between items-center gap-3 text-[10px] lf-text-muted font-medium font-mono">
                        <span
                          className="lf-text-secondary shrink-0"
                          title={isDownloading && cutRange
                            ? (settings.language === 'en'
                              ? `Full video total — section ${cutRange} is extracted at the end`
                              : `Total do vídeo completo — o trecho ${cutRange} é extraído ao final`)
                            : undefined}
                        >
                          {isCutSilent
                            ? `${formatBytes(item.sizeDownloaded)} ${settings.language === 'en' ? 'downloaded' : 'baixados'}`
                            : (item.sizeTotal > 0
                              ? `${formatBytes(item.sizeDownloaded)} / ${formatBytes(item.sizeTotal)} (${item.progress}%)${isDownloading && cutRange ? ` · ${cutRange}` : ''}`
                              : `${formatBytes(item.sizeDownloaded)} (${item.progress}%)`
                            )
                          }
                        </span>

                        <div className="flex gap-3 shrink-0">
                          {isDownloading && (isCutSilent ? (
                            <span className="lf-text-secondary animate-pulse">
                              {item.processing
                                ? (settings.language === 'en' ? 'Processing cut…' : 'Processando corte…')
                                : (settings.language === 'en' ? 'Downloading slice…' : 'Baixando trecho…')}
                            </span>
                          ) : (
                            <>
                              <span className="flex items-center gap-0.5">
                                {settings.iconStyle === 'emoji' ? <span>📊</span> : <TrendingUp size={10} className={getAccentTextClass(settings)} />}
                                {formatSpeed(item.speed)}
                              </span>
                              <span className="flex items-center gap-0.5">
                                {settings.iconStyle === 'emoji' ? <span>⏳</span> : <Clock size={10} className={getAccentTextClass(settings)} />}
                                {formatEta(item.eta)}
                              </span>
                            </>
                          ))}
                          {isQueued && <span className="lf-text-muted animate-pulse">{settings.language === 'en' ? 'Waiting in queue...' : 'Aguardando na fila...'}</span>}
                          {isPaused && <span className="text-amber-500">{settings.language === 'en' ? 'Paused' : 'Pausado'}</span>}
                          {isCompleted && <span className="text-emerald-500 flex items-center gap-0.5"><CheckCircle2 size={10} /> {settings.language === 'en' ? 'Completed' : 'Concluído'}</span>}
                          {isFailed && <span className="text-rose-500 flex items-center gap-0.5"><AlertTriangle size={10} /> {settings.language === 'en' ? 'Failed' : 'Falhou'}</span>}
                        </div>
                      </div>
                      {/* Erro em linha própria, largura total: dentro da row de
                          métricas ele era esmagado entre bytes e status. */}
                      {isFailed && item.error && (
                        <div className="text-[11px] text-rose-400/80 mt-1 break-words line-clamp-3" title={item.error}>
                          {item.error}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick controls Toolbelt block */}
                  <div className="flex items-center gap-2 justify-end w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 lf-border">
                    {/* Reordering Controls (Only for queue/active lists) */}
                    {['queued', 'downloading', 'paused'].includes(item.status) && (
                      <div className="flex flex-col gap-1 mr-2 border-r lf-border pr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button 
                          onClick={() => handleMoveUp(item.id)}
                          disabled={queuePos <= 0}
                          className="p-1 rounded hover:bg-white/5 lf-text-muted hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                          title={settings.language === 'en' ? 'Move up' : 'Mover para cima'}
                        >
                          {settings.iconStyle === 'emoji' ? <span>⬆️</span> : <ArrowUp size={12} className={getAccentTextClass(settings)} />}
                        </button>
                        <button 
                          onClick={() => handleMoveDown(item.id)}
                          disabled={queuePos < 0 || queuePos >= queuedIds.length - 1}
                          className="p-1 rounded hover:bg-white/5 lf-text-muted hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                          title={settings.language === 'en' ? 'Move down' : 'Mover para baixo'}
                        >
                          {settings.iconStyle === 'emoji' ? <span>⬇️</span> : <ArrowDown size={12} className={getAccentTextClass(settings)} />}
                        </button>
                      </div>
                    )}

                    {/* Main Action Toggles */}
                    {isDownloading && (
                      <button
                        onClick={() => DownloadEngine.pauseDownload(item.id)}
                        className="p-2.5 rounded-lg lf-surface-raised hover:bg-zinc-750 lf-text-secondary hover:text-white transition-colors"
                        title={settings.language === 'en' ? 'Pause' : 'Pausar'}
                      >
                        {settings.iconStyle === 'emoji' ? <span>⏸️</span> : <Pause size={13} className={getAccentTextClass(settings)} />}
                      </button>
                    )}
                    {isPaused && (
                      <button
                        onClick={() => DownloadEngine.resumeDownload(item.id)}
                        className="p-2.5 rounded-lg lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white transition-colors"
                        title={settings.language === 'en' ? 'Resume' : 'Retomar'}
                      >
                        {settings.iconStyle === 'emoji' ? <span>▶️</span> : <Play size={13} fill="currentColor" className={getAccentTextClass(settings)} />}
                      </button>
                    )}
                    {isFailed && (
                      <button
                        onClick={() => DownloadEngine.retryDownload(item.id)}
                        className="p-2.5 rounded-lg lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white transition-colors"
                        title={settings.language === 'en' ? 'Retry Download' : 'Repetir Download'}
                      >
                        {settings.iconStyle === 'emoji' ? <span>🔄</span> : <RotateCcw size={13} className={getAccentTextClass(settings)} />}
                      </button>
                    )}

                    {/* Common / Helper Utilities */}
                    {isCompleted && (
                      <button
                        onClick={() => handleOpenFolder(item)}
                        className="p-2.5 rounded-lg lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white transition-colors"
                        title={settings.language === 'en' ? 'Open Folder' : 'Abrir Pasta'}
                      >
                        {settings.iconStyle === 'emoji' ? <span>📁</span> : <FolderOpen size={13} className={getAccentTextClass(settings)} />}
                      </button>
                    )}

                    <button
                      onClick={() => setCommandPreview(item)}
                      className="p-2.5 rounded-lg lf-surface-raised hover:bg-zinc-800 lf-text-secondary hover:text-zinc-200 transition-colors"
                      title={settings.language === 'en' ? 'View Command' : 'Ver Comando'}
                    >
                      {settings.iconStyle === 'emoji' ? <span>💻</span> : <Code size={13} className={getAccentTextClass(settings)} />}
                    </button>

                    <button
                      onClick={() => handleShare(item)}
                      className="p-2.5 rounded-lg lf-surface-raised hover:bg-zinc-800 lf-text-secondary hover:text-zinc-200 transition-colors"
                      title={settings.language === 'en' ? 'Share Link' : 'Compartilhar Link'}
                    >
                      {settings.iconStyle === 'emoji' ? <span>🔗</span> : <Share2 size={13} className={getAccentTextClass(settings)} />}
                    </button>

                    <button
                      onClick={() => DownloadEngine.removeDownload(item.id)}
                      className="p-2.5 rounded-lg lf-surface-raised hover:bg-red-950/40 lf-text-muted hover:text-rose-400 transition-colors"
                      title={settings.language === 'en' ? 'Delete Record' : 'Excluir Registro'}
                    >
                      {settings.iconStyle === 'emoji' ? <span>🗑️</span> : <Trash2 size={13} className={getAccentTextClass(settings)} />}
                    </button>
                  </div>
        </AnimatedCard>
              );
            })}
          </AnimatedList>
        )}
      </div>

      <AnimatedList>
        {commandPreview && (
          <AnimatedCard
            variant={fadeIn}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setCommandPreview(null)}
          >
            <AnimatedCard
              variant={scaleIn}
              transition={transitions.modal}
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700/50">
                <div className="flex items-center gap-2.5">
                  <Code size={16} className="text-zinc-400" />
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {settings.language === 'en' ? 'Download Command' : 'Comando de Download'}
                  </h3>
                </div>
                <button
                  onClick={() => setCommandPreview(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {settings.iconStyle === 'emoji' ? <span>✖️</span> : <X size={14} className={getAccentTextClass(settings)} />}
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  {settings.language === 'en' ? 'Title' : 'Titulo'}
                </p>
                <p className="text-xs text-zinc-300 mb-4 truncate">{commandPreview.title}</p>

                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  yt-dlp
                </p>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-emerald-400 whitespace-pre-wrap break-all">
                  {(() => {
                    const args = buildArgsPreview(commandPreview);
                    const lines: string[] = ['yt-dlp \\'];
                    for (let i = 0; i < args.length; i++) {
                      const arg = args[i];
                      if (i === args.length - 1) {
                        lines.push(`  "${arg}"`);
                      } else if (arg.startsWith('-')) {
                        const next = args[i + 1];
                        if (next && !next.startsWith('-')) {
                          lines.push(`  ${arg} "${next}" \\`);
                          i++;
                        } else {
                          lines.push(`  ${arg} \\`);
                        }
                      } else {
                        lines.push(`  "${arg}" \\`);
                      }
                    }
                    return lines.join('\n');
                  })()}
                </pre>
              </div>

              <div className="px-5 py-3 border-t border-zinc-700/50 flex justify-end">
                <button
                  onClick={() => {
                    const args = buildArgsPreview(commandPreview);
                    const cmd = 'yt-dlp ' + args.map(a => `"${a}"`).join(' ');
                    navigator.clipboard.writeText(cmd).then(() => {
                      showToast(settings.language === 'en' ? 'Command copied!' : 'Comando copiado!');
                    }).catch(() => {
                      showToast(settings.language === 'en' ? 'Failed to copy' : 'Falha ao copiar');
                    });
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                >
                  {settings.language === 'en' ? 'Copy Command' : 'Copiar Comando'}
                </button>
              </div>
                </AnimatedCard>
            </AnimatedCard>
        )}
      </AnimatedList>
    </div>
    </LayoutGroup>
  );
};
