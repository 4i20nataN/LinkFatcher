import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useApp } from '../../context/AppContext';
import { ProviderRegistry, probePlaylistFull } from '../../core/plugins/Providers';
import { MediaInfo, MediaFormat, PlaylistInfo } from '../../types';
import { 
  Play, Download, Clock, Star, ExternalLink, RefreshCw, 
  Trash2, ShieldCheck, HelpCircle, AlertCircle, Info, FileVideo, Music, Image as ImageIcon,
  ListMusic, ChevronDown, ChevronUp, Eye, Calendar, FolderOpen,
  Camera, Globe, X, Cloud, Radio, MessageCircle, MessageSquare,
  Film, Pin, Linkedin, Github, Heart, Send, Gamepad2, AtSign,
  BookOpen, GitBranch, PenTool
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { slideUp, slideUpStrong, scaleIn, fadeIn, transitions } from '../../animation/variants';
import { useTranslation } from '../../core/i18n';
import { 
  getAccentBgClass, getAccentTextClass, getAccentBorderClass, getAccentRingClass 
} from '../../components/ThemeWrapper';
import { DownloadEngine } from '../../core/engine/DownloadEngine';
import type { FormatOptions } from '../downloads/FormatOptions';
import { AUDIO_QUALITY_PRESETS } from '../downloads/constants';
const FormatSelector = React.lazy(() => import('../downloads/FormatSelector').then(m => ({ default: m.FormatSelector })));
import { isPlaylistUrl } from '../../core/ytdlp/playlistUtils';
import { probeUrlWithAdapter, adapterErrorMessage } from '../../core/ytdlp/YtDlpAdapter';
import { PlatformBadge } from '../../components/PlatformBadge';

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  youtube: Play,
  tiktok: Music,
  instagram: Camera,
  facebook: Globe,
  twitter: X,
  soundcloud: Cloud,
  twitch: Radio,
  reddit: MessageCircle,
  discord: MessageSquare,
  kick: Play,
  vimeo: Film,
  pinterest: Pin,
  linkedin: Linkedin,
  github: Github,
  patreon: Heart,
  telegram: Send,
  snapchat: Send,
  steam: Gamepad2,
  threads: AtSign,
  medium: BookOpen,
  behance: PenTool,
  dribbble: PenTool,
  gitlab: GitBranch,
  tumblr: PenTool,
  flickr: Camera,
  mastodon: Radio,
  bandcamp: Music,
};

const SummaryPanel: React.FC<{ formatOptions: FormatOptions; selectedFormat: MediaFormat | null; mediaInfo: MediaInfo }> = ({ formatOptions, selectedFormat, mediaInfo }) => {
  const { settings } = useApp();
  const { t } = useTranslation(settings);
  const items: { icon: string; label: string }[] = [];

  if (formatOptions.audioOnly) {
    items.push({ icon: '🎵', label: formatOptions.audioFormat.toUpperCase() });
    if (formatOptions.audioQuality) {
      const qLabel = AUDIO_QUALITY_PRESETS.find(p => p.value === formatOptions.audioQuality)?.label
        ?? formatOptions.audioQuality;
      items.push({ icon: '🔊', label: formatOptions.audioQuality === '0' ? t('sumBestQuality') : qLabel });
    }
  } else {
    if (formatOptions.videoFormat) items.push({ icon: '🎬', label: formatOptions.videoFormat.toUpperCase() });
    // Extract resolution from format string pattern height<=XXXX
    const fmt = formatOptions.format || '';
    const heightMatch = fmt.match(/height[<=>]+(\d+)/);
    if (heightMatch) {
      const h = Number(heightMatch[1]);
      const resMap: Record<number, string> = { 2160: '4K', 1440: '1440p', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p' };
      items.push({ icon: '📺', label: resMap[h] || `${h}p` });
    } else if (fmt.includes('best') || fmt === '') {
      items.push({ icon: '📺', label: t('sumBest') });
    } else if (selectedFormat?.quality) {
      items.push({ icon: '📺', label: selectedFormat.quality });
    }
    if (formatOptions.videoCodec) {
      const codecMap: Record<string, string> = { h264: 'H.264', h265: 'H.265', vp9: 'VP9', av01: 'AV1' };
      items.push({ icon: '🎞', label: codecMap[formatOptions.videoCodec] || formatOptions.videoCodec });
    }
  }

  if (formatOptions.sponsorblockRemove && formatOptions.sponsorblockRemove !== '') {
    const sb = formatOptions.sponsorblockRemove === 'all' ? t('sumAll') : formatOptions.sponsorblockRemove.replace(/,/g, ' + ');
    items.push({ icon: '⚡', label: `SponsorBlock: ${sb}` });
  }
  if (formatOptions.downloadSections) items.push({ icon: '✂', label: `${t('sumCut')} ${formatOptions.downloadSections.replace(/\*/g, '')}` });
  if (!formatOptions.audioOnly && formatOptions.fpsMax && formatOptions.fpsMax > 0) items.push({ icon: '🎞', label: `${formatOptions.fpsMax} FPS` });
  if (formatOptions.writeSubs || formatOptions.writeAutoSubs) {
    const lang = formatOptions.subLangs || 'en';
    items.push({ icon: '📋', label: lang.toUpperCase() });
  }
  if (formatOptions.customFilename) items.push({ icon: '📁', label: formatOptions.customFilename });
  if (formatOptions.descFormat && formatOptions.descFormat !== 'none' && mediaInfo.description) items.push({ icon: '📄', label: `${t('sumDesc')}${formatOptions.descFormat}` });

  if (items.length === 0) return null;

  return (
    <div className="p-3 rounded-xl lf-surface-40 border lf-border glass-result">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] lf-text-muted font-medium uppercase tracking-wider">{t('sumResult')}</span>
        <div className="flex-1 h-px bg-white/5" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[11px] lf-text-secondary">
            <span className="text-[10px]">{item.icon}</span>
            {item.label}
          </span>
        ))}
        {mediaInfo.duration && (
          <span className="flex items-center gap-1.5 text-[11px] lf-text-secondary">
            <span className="text-[10px]">🕒</span>
            {mediaInfo.duration}
          </span>
        )}
      </div>
    </div>
  );
};

const sanitizeUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete('t');
    parsed.searchParams.delete('time_continue');
    parsed.searchParams.delete('start');
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

export const LinkAnalyzer: React.FC = () => {
  const { 
    settings, 
    toggleFavorite, 
    isFavorite, 
    addToDownloadLater, 
    isDownloadLater,
    removeFromDownloadLater,
    selectedUrl, 
    setSelectedUrl,
    setActiveTab
  } = useApp();
  const { t } = useTranslation(settings);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const animationFrameRef = useRef<number | null>(null);
  const handleAnalyzeRef = useRef<(url: string) => void>(() => {});
  const handleProbeRef = useRef<(url: string) => void>(() => {});
  const smoothSetPlaybackRate = (element: HTMLElement | null, targetRate: number) => {
    if (!element) return;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    const animations = element.getAnimations();
    if (animations.length === 0) return;
    
    const startRate = animations[0].playbackRate;
    const duration = 400; // ms
    let startTime: number | null = null;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      const currentRate = startRate + (targetRate - startRate) * ease;
      
      animations.forEach(a => a.playbackRate = currentRate);
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  };
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistExpanded, setPlaylistExpanded] = useState(false);
  const [formatOptions, setFormatOptions] = useState<FormatOptions>({
    format: 'bestvideo+bestaudio/best',
    audioOnly: false,
    audioFormat: 'mp3',
    audioQuality: '0',
    writeSubs: false,
    writeAutoSubs: false,
    subLangs: '',
    subFormat: '',
    embedSubs: false,
    writeThumbnail: false,
    embedThumbnail: false,
    embedMetadata: false,
    videoOnly: false,
    sponsorblockRemove: '',
    fpsMax: 0,
    bandLimit: 0,
  });

  // Auto-analyze URL from search / download later trigger
  useEffect(() => {
    if (selectedUrl) {
      setUrl(selectedUrl);
      setSelectedUrl(''); // Clear
      const trimmed = selectedUrl.trim();
      if (trimmed && /^https?:\/\/.+/i.test(trimmed)) {
        const clean = sanitizeUrl(trimmed);
        handleAnalyze(clean);
        handleProbe(clean);
      }
    }
  }, [selectedUrl]);

  // Listen for clipboard-detected URL from popup
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail?.url;
      if (url) {
        setUrl(url);
        const trimmed = url.trim();
        if (trimmed && /^https?:\/\/.+/i.test(trimmed)) {
          const clean = sanitizeUrl(trimmed);
          handleAnalyzeRef.current(clean);
          handleProbeRef.current(clean);
        }
      }
    };
    window.addEventListener('clipboard:analyze', handler);
    return () => window.removeEventListener('clipboard:analyze', handler);
  }, []);

  // Persist analyzer state to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('universal_downloader_analyzer_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.url) setUrl(state.url);
        if (state.mediaInfo) setMediaInfo(state.mediaInfo);
        if (state.selectedFormat) setSelectedFormat(state.selectedFormat);
        if (state.formatOptions) setFormatOptions(state.formatOptions);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const state = { url, mediaInfo, selectedFormat, formatOptions };
    localStorage.setItem('universal_downloader_analyzer_state', JSON.stringify(state));
  }, [url, mediaInfo, selectedFormat, formatOptions]);

  const handleAnalyze = async (urlToAnalyze: string) => {
    const targetUrl = urlToAnalyze.trim();
    if (!targetUrl) return;

    setLoading(true);
    setError(null);
    setMediaInfo(null);
    setSelectedFormat(null);
    setFormatOptions({
      format: 'bestvideo+bestaudio/best',
      audioOnly: false,
      audioFormat: 'mp3',
      audioQuality: '0',
      writeSubs: false,
      writeAutoSubs: false,
      subLangs: '',
      subFormat: '',
      embedSubs: false,
      writeThumbnail: false,
      embedThumbnail: false,
      embedMetadata: false,
      videoOnly: false,
      sponsorblockRemove: '',
      fpsMax: 0,
      bandLimit: 0,
    });
    setSuccessMsg(null);
    setProbeError(null);
    setPlaylistInfo(null);

    // Check if URL is a playlist
    if (isPlaylistUrl(targetUrl)) {
      setPlaylistLoading(true);
      try {
        const playlist = await probePlaylistFull(targetUrl);
        setPlaylistInfo(playlist);
        setPlaylistLoading(false);
        setLoading(false);
        return;
      } catch (err: any) {
        setPlaylistLoading(false);
        setPlaylistInfo(null);
        // Fall through to normal analysis if playlist probe fails
      }
    }

    try {
      const provider = ProviderRegistry.getProviderForUrl(targetUrl);
      const info = await provider.analyze(targetUrl);
      
      setMediaInfo(info);
      if (info.formats && info.formats.length > 0) {
        setSelectedFormat(info.formats[0]); // Default to first format
      }
    } catch (err: any) {
      setError(adapterErrorMessage(err, settings.language === 'en' ? 'Error analyzing link. Please verify if link is correct.' : 'Erro ao analisar o link. Verifique se o link está correto.'));
    } finally {
      setLoading(false);
    }
  };
  handleAnalyzeRef.current = handleAnalyze;

  const handleProbe = async (probeUrl: string) => {
    setProbeLoading(true);
    setProbeError(null);

    try {
      const data = await probeUrlWithAdapter({ url: probeUrl });
      if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setProbeError(adapterErrorMessage(err, 'Probe failed'));
    } finally {
      setProbeLoading(false);
    }
  };
  handleProbeRef.current = handleProbe;

  const handleSubmit = async () => {
    let trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError(settings.language === 'en' ? 'Please enter a valid URL starting with http:// or https://' : 'Insira uma URL válida começando com http:// ou https://');
      return;
    }
    
    trimmed = sanitizeUrl(trimmed);
    setUrl(trimmed); // Atualiza o input visualmente com a URL limpa
    
    await handleAnalyze(trimmed);
    handleProbe(trimmed);
  };

  const handlePaste = async () => {
    if (!settings.clipboardEnabled) {
      setError(settings.language === 'en' ? 'Clipboard access is disabled in settings. Enable it in Settings > Visual Preferences.' : 'Acesso à área de transferência desabilitado nas configurações. Ative em Configurações > Preferências Visuais.');
      return;
    }
    try {
      const { readClipboardText } = await import('../../native/clipboard');
      const text = await readClipboardText();
      if (text) {
        setUrl(text);
      } else {
        setError(settings.language === 'en' ? 'Clipboard is empty or unavailable. Type or paste manually.' : 'Área de transferência vazia ou indisponível. Digite ou cole manualmente.');
      }
    } catch (e) {
      setError(settings.language === 'en' ? 'Clipboard permission was denied. Type or paste manually.' : 'A permissão de área de transferência foi negada. Digite ou cole manualmente.');
    }
  };

  const handleStartDownload = () => {
    if (!mediaInfo || !selectedFormat) {
      setError(settings.language === 'en' ? 'No format selected. Please wait for analysis to complete.' : 'Nenhum formato selecionado. Aguarde a analise completar.');
      return;
    }

    DownloadEngine.addDownload(
      mediaInfo,
      selectedFormat,
      formatOptions
    );

    // Download description if format selected and description exists
    // ('none' é truthy — precisa do !== explícito, senão cai no else e grava .txt)
    if (formatOptions.descFormat && formatOptions.descFormat !== 'none' && mediaInfo.description) {
      const fmt = formatOptions.descFormat;
      const title = mediaInfo.title || 'video';
      const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      let content = '';
      let filename = '';
      const fmtDate = (d: string) => /^\d{8}$/.test(d) ? `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}` : d;
      if (fmt === 'md') {
        content = `# ${title}\n\n`;
        if (mediaInfo.channel) content += `**Canal:** ${mediaInfo.channel}\n`;
        if (mediaInfo.publishDate) content += `**Data:** ${fmtDate(mediaInfo.publishDate)}\n`;
        if (mediaInfo.views) content += `**Views:** ${mediaInfo.views}\n`;
        if (mediaInfo.duration) content += `**Duracao:** ${mediaInfo.duration}\n`;
        content += `\n---\n\n${mediaInfo.description}`;
        filename = `${safeTitle}.md`;
      } else {
        content = `${title}\n${'='.repeat(title.length)}\n\n`;
        if (mediaInfo.channel) content += `Canal: ${mediaInfo.channel}\n`;
        if (mediaInfo.publishDate) content += `Data: ${fmtDate(mediaInfo.publishDate)}\n`;
        if (mediaInfo.views) content += `Views: ${mediaInfo.views}\n`;
        if (mediaInfo.duration) content += `Duracao: ${mediaInfo.duration}\n`;
        content += `\n${mediaInfo.description}`;
        filename = `${safeTitle}.txt`;
      }
      if (window.electron) {
        window.electron.invoke('save-description', { filename, content });
      } else {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    }

    setSuccessMsg(settings.language === 'en' ? `Added to queue: ${mediaInfo.title.substring(0, 45)}...` : `Adicionado a fila: ${mediaInfo.title.substring(0, 45)}...`);
    
    // Auto-redirect to downloads manager
    setTimeout(() => {
      setActiveTab('manager');
    }, 1200);
  };

  const handleDownloadAllPlaylist = async () => {
    if (!playlistInfo || playlistInfo.items.length === 0) return;

    // Probe each item to get its formats, then add to queue
    for (const item of playlistInfo.items) {
      try {
        const provider = ProviderRegistry.getProviderForUrl(item.url);
        const info = await provider.analyze(item.url);
        if (info.formats && info.formats.length > 0) {
          DownloadEngine.addDownload(info, info.formats[0], formatOptions);
        }
      } catch (err) {
        console.warn(`Failed to probe playlist item: ${item.title}`, err);
      }
    }

    setSuccessMsg(settings.language === 'en'
      ? `Added ${playlistInfo.items.length} items to queue`
      : `${playlistInfo.items.length} itens adicionados a fila`);
    setTimeout(() => setActiveTab('manager'), 1200);
  };

  const handleToggleFav = () => {
    if (!mediaInfo) return;
    toggleFavorite({
      id: mediaInfo.id,
      title: mediaInfo.title,
      url: mediaInfo.originalUrl,
      platform: mediaInfo.platform,
      thumbnailUrl: mediaInfo.thumbnailUrl
    });
  };

  const handleToggleLater = () => {
    if (!mediaInfo) return;
    const isAdded = isDownloadLater(mediaInfo.originalUrl);
    if (isAdded) {
      removeFromDownloadLater(mediaInfo.originalUrl);
    } else {
      addToDownloadLater({
        id: mediaInfo.id,
        title: mediaInfo.title,
        url: mediaInfo.originalUrl,
        platform: mediaInfo.platform,
        thumbnailUrl: mediaInfo.thumbnailUrl
      });
    }
  };

  const [showCoverFormats, setShowCoverFormats] = useState(false);

  const handleDownloadThumbnail = async (targetExt?: 'jpg' | 'png' | 'webp') => {
    if (!mediaInfo || !mediaInfo.thumbnailUrl) return;
    // Sem formato escolhido: abre o seletor
    if (!targetExt) {
      setShowCoverFormats(v => !v);
      return;
    }
    setShowCoverFormats(false);
    try {
      const mime = targetExt === 'jpg' ? 'image/jpeg' : targetExt === 'png' ? 'image/png' : 'image/webp';
      const quality = targetExt === 'png' ? undefined : 0.92;
      setSuccessMsg(settings.language === 'en' ? 'Downloading thumbnail...' : 'Baixando capa...');
      const title = (mediaInfo.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      const filename = `${title}_capa.${targetExt}`;

      // Converte via Canvas para o formato escolhido (1 arquivo, sem duplicatas)
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img'));
        img.src = mediaInfo.thumbnailUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, mime, quality));
      if (!blob) throw new Error('convert');

      const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      if (isTauri) {
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        const { join } = await import('@tauri-apps/api/path');
        let dir = settings.defaultDir || '';
        if (!dir) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            dir = await invoke<string>('fs_get_downloads_path');
          } catch { dir = ''; }
        }
        if (!dir) throw new Error('nodir');
        await writeFile(await join(dir, filename), new Uint8Array(await blob.arrayBuffer()));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setSuccessMsg(settings.language === 'en' ? `Cover saved (${targetExt.toUpperCase()})!` : `Capa salva (${targetExt.toUpperCase()})!`);
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err) {
      console.warn('Error downloading thumbnail:', err);
      setSuccessMsg(settings.language === 'en' ? 'Failed to download thumbnail' : 'Falha ao baixar capa');
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const platformConfig = mediaInfo ? ProviderRegistry.getPlatformConfig(mediaInfo.platform) : null;
  const isFav = mediaInfo ? isFavorite(mediaInfo.originalUrl) : false;
  const isLater = mediaInfo ? isDownloadLater(mediaInfo.originalUrl) : false;

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-2 md:py-6 px-4">
      {/* Title Header */}
      <div className="text-center md:text-left space-y-2">
        <h2 className="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight">
          {t('universalDownloader')}
        </h2>
        <p className="lf-text-secondary text-sm md:text-base">
          {settings.language === 'en' 
            ? 'Enter video, audio or image link from any supported platform to start.' 
            : 'Insira o link de vídeos, áudios ou imagens de qualquer plataforma suportada para começar.'}
        </p>
      </div>

      {/* Main Input Box */}
      <div className="p-4 md:p-6 rounded-3xl glass-card shadow-2xl">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('mainPlaceholder')}
              autoComplete="off"
                className={`
                w-full pl-4 pr-12 py-3.5 rounded-xl lf-surface border lf-border text-sm text-white placeholder-zinc-500
                focus:border-transparent focus:outline-none focus:ring-2 ${getAccentRingClass(settings)} transition-all
              `}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            {url && (
              <button
                onClick={() => {
                  setUrl('');
                  setMediaInfo(null);
                  setSelectedFormat(null);
                  setProbeError(null);
                  setFormatOptions({
                    format: 'bestvideo+bestaudio/best',
                    audioOnly: false,
                    audioFormat: 'mp3',
                    audioQuality: '0',
                    writeSubs: false,
                    writeAutoSubs: false,
                    subLangs: '',
                    subFormat: '',
                    embedSubs: false,
                    writeThumbnail: false,
                    embedThumbnail: false,
                    embedMetadata: false,
                    videoOnly: false,
                    sponsorblockRemove: '',
                    fpsMax: 0,
                    bandLimit: 0,
                  });
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/5 lf-text-secondary hover:text-white transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handlePaste}
              type="button"
              className="flex-1 md:flex-none px-4 py-3.5 rounded-xl lf-surface-raised hover:bg-zinc-850 text-zinc-200 border lf-border hover:text-white font-medium text-sm transition-all"
            >
              {t('btnPaste')}
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !url}
              className={`
                flex-1 md:flex-none px-6 py-3.5 rounded-xl text-white font-semibold text-sm transition-all shadow-lg
                ${loading || !url 
                  ? 'lf-surface-raised lf-text-muted cursor-not-allowed border lf-border shadow-none' 
                  : `${getAccentBgClass(settings)} hover:shadow-indigo-500/20`
                }
              `}
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <RefreshCw size={16} className="animate-spin" /> {settings.language === 'en' ? 'Analyzing...' : 'Analisando...'}
                </span>
              ) : (
                t('btnAnalyze')
              )}
            </button>
          </div>
        </div>

        {/* Supported platforms strip */}
        <div 
          className="slider-container"
          onMouseEnter={(e) => {
            const row = e.currentTarget.querySelector('.scroll-row');
            if (row) smoothSetPlaybackRate(row as HTMLElement, 0.35);
          }}
          onMouseLeave={(e) => {
            const row = e.currentTarget.querySelector('.scroll-row');
            if (row) smoothSetPlaybackRate(row as HTMLElement, 1);
          }}
        >
          <div className="scroll-row" id="scrollRow">
            <div className="tag youtube"><Play size={18} />YouTube</div>
            <div className="tag tiktok"><Music size={18} />TikTok</div>
            <div className="tag instagram"><Camera size={18} />Instagram</div>
            <div className="tag facebook"><Globe size={18} />Facebook</div>
            <div className="tag twitter"><X size={18} />X</div>
            <div className="tag soundcloud"><Cloud size={18} />SoundCloud</div>
            <div className="tag twitch"><Radio size={18} />Twitch</div>
            <div className="tag reddit"><MessageCircle size={18} />Reddit</div>
            <div className="tag discord"><MessageSquare size={18} />Discord</div>
            <div className="tag kick"><Play size={18} />Kick</div>
            <div className="tag vimeo"><Film size={18} />Vimeo</div>
            <div className="tag pinterest"><Pin size={18} />Pinterest</div>
            <div className="tag linkedin"><Linkedin size={18} />LinkedIn</div>
            <div className="tag github"><Github size={18} />GitHub</div>
            <div className="tag patreon"><Heart size={18} />Patreon</div>
            <div className="tag telegram"><Send size={18} />Telegram</div>
            <div className="tag snapchat"><Send size={18} />Snapchat</div>
            <div className="tag steam"><Gamepad2 size={18} />Steam</div>
            <div className="tag threads"><AtSign size={18} />Threads</div>
            <div className="tag medium"><BookOpen size={18} />Medium</div>
            <div className="tag behance"><PenTool size={18} />Behance</div>
            <div className="tag dribbble"><PenTool size={18} />Dribbble</div>
            <div className="tag gitlab"><GitBranch size={18} />GitLab</div>
            <div className="tag tumblr"><PenTool size={18} />Tumblr</div>
            <div className="tag flickr"><Camera size={18} />Flickr</div>
            <div className="tag mastodon"><Radio size={18} />Mastodon</div>
            <div className="tag bandcamp"><Music size={18} />Bandcamp</div>

            <div className="tag youtube"><Play size={18} />YouTube</div>
            <div className="tag tiktok"><Music size={18} />TikTok</div>
            <div className="tag instagram"><Camera size={18} />Instagram</div>
            <div className="tag facebook"><Globe size={18} />Facebook</div>
            <div className="tag twitter"><X size={18} />X</div>
            <div className="tag soundcloud"><Cloud size={18} />SoundCloud</div>
            <div className="tag twitch"><Radio size={18} />Twitch</div>
            <div className="tag reddit"><MessageCircle size={18} />Reddit</div>
            <div className="tag discord"><MessageSquare size={18} />Discord</div>
            <div className="tag kick"><Play size={18} />Kick</div>
            <div className="tag vimeo"><Film size={18} />Vimeo</div>
            <div className="tag pinterest"><Pin size={18} />Pinterest</div>
            <div className="tag linkedin"><Linkedin size={18} />LinkedIn</div>
            <div className="tag github"><Github size={18} />GitHub</div>
            <div className="tag patreon"><Heart size={18} />Patreon</div>
            <div className="tag telegram"><Send size={18} />Telegram</div>
            <div className="tag snapchat"><Send size={18} />Snapchat</div>
            <div className="tag steam"><Gamepad2 size={18} />Steam</div>
            <div className="tag threads"><AtSign size={18} />Threads</div>
            <div className="tag medium"><BookOpen size={18} />Medium</div>
            <div className="tag behance"><PenTool size={18} />Behance</div>
            <div className="tag dribbble"><PenTool size={18} />Dribbble</div>
            <div className="tag gitlab"><GitBranch size={18} />GitLab</div>
            <div className="tag tumblr"><PenTool size={18} />Tumblr</div>
            <div className="tag flickr"><Camera size={18} />Flickr</div>
            <div className="tag mastodon"><Radio size={18} />Mastodon</div>
            <div className="tag bandcamp"><Music size={18} />Bandcamp</div>
          </div>
        </div>
      </div>

      {/* Error View */}
      {error && (
        <AnimatedCard
          variant={fadeIn}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3"
        >
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">{settings.language === 'en' ? 'Analysis failed' : 'Falha na análise'}</h4>
            <p className="text-xs mt-1 text-red-300">{error}</p>
          </div>
        </AnimatedCard>
      )}

      {/* Success Notification pop */}
      {successMsg && (
        <AnimatedCard
          variant={scaleIn}
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3 shadow-lg shadow-emerald-500/5"
        >
          <ShieldCheck size={20} className="shrink-0" />
          <span className="font-semibold text-sm">{successMsg}</span>
        </AnimatedCard>
      )}

      {/* Skeleton Loading Card */}
      {loading && (
        <div className="p-4 md:p-6 rounded-2xl lf-surface-40 border lf-border animate-pulse space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-56 h-36 lf-surface-raised rounded-xl shrink-0" />
            <div className="flex-1 space-y-4">
              <div className="h-4 lf-surface-raised rounded-full w-2/3" />
              <div className="h-3 lf-surface-raised rounded-full w-1/3" />
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="h-3 lf-surface-raised rounded-full w-3/4" />
                <div className="h-3 lf-surface-raised rounded-full w-1/2" />
                <div className="h-3 lf-surface-raised rounded-full w-2/3" />
                <div className="h-3 lf-surface-raised rounded-full w-1/3" />
              </div>
            </div>
          </div>
          <div className="border-t lf-border pt-6 space-y-4">
            <div className="h-4 lf-surface-raised rounded-full w-1/4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 lf-surface-raised rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PLAYLIST LOADING STATE */}
      {playlistLoading && (
        <div className="p-6 rounded-3xl glass-card text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" />
          <p className="lf-text-secondary text-sm">
            {settings.language === 'en' ? 'Loading playlist...' : 'Carregando playlist...'}
          </p>
        </div>
      )}

      {/* PLAYLIST PREVIEW CARD */}
      <AnimatedList>
        {playlistInfo && !playlistLoading && (
          <AnimatedCard
            variant={slideUpStrong}
            className="p-5 rounded-3xl glass-card shadow-2xl space-y-4"
          >
            {/* Playlist Header */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-indigo-600/20 flex items-center justify-center shrink-0">
                <ListMusic size={24} className={getAccentTextClass(settings)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-display font-bold text-zinc-100 truncate">
                  {playlistInfo.title}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs lf-text-secondary">
                    {playlistInfo.items.length} {settings.language === 'en' ? 'items' : 'itens'}
                  </span>
                  {playlistInfo.totalDuration && playlistInfo.totalDuration > 0 && (
                    <span className="text-xs lf-text-secondary">
                      • {Math.floor(playlistInfo.totalDuration / 60)}min total
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Preview items (first 5) */}
            <div className="space-y-1.5">
              {playlistInfo.items.slice(0, playlistExpanded ? playlistInfo.items.length : 5).map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-[10px] lf-text-secondary w-5 text-center shrink-0">
                    {item.index}
                  </span>
                  <span className="text-xs text-zinc-300 truncate flex-1">
                    {item.title}
                  </span>
                  {item.duration && (
                    <span className="text-[10px] lf-text-secondary shrink-0">
                      {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Expand/Collapse */}
            {playlistInfo.items.length > 5 && (
              <button
                onClick={() => setPlaylistExpanded(!playlistExpanded)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-xs lf-text-secondary hover:text-zinc-300 transition-colors"
              >
                {playlistExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {playlistExpanded
                  ? settings.language === 'en' ? 'Show less' : 'Mostrar menos'
                  : settings.language === 'en' ? `Show all ${playlistInfo.items.length}` : `Ver todos (${playlistInfo.items.length})`}
              </button>
            )}

            {/* Download All Button */}
            <button
              onClick={handleDownloadAllPlaylist}
              className={`w-full py-2.5 rounded-xl font-display font-bold text-sm transition-all ${getAccentBgClass(settings)} hover:opacity-90 text-white shadow-lg`}
            >
              <span className="flex items-center justify-center gap-2">
                <Download size={14} />
                {settings.language === 'en' ? `Download All (${playlistInfo.items.length})` : `Baixar Todos (${playlistInfo.items.length})`}
              </span>
            </button>
          </AnimatedCard>
        )}
      </AnimatedList>

      {/* RICH CONTENT CARD */}
      <AnimatedList>
        {mediaInfo && !loading && (
          <AnimatedCard
            variant={slideUpStrong}
            className="p-4 md:p-6 rounded-3xl glass-card shadow-2xl space-y-6 overflow-hidden"
          >
            {/* Header / Thumbnail Block */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Thumbnail Container */}
              <div className="relative group w-full md:w-64 h-40 rounded-xl shrink-0 overflow-hidden border lf-border lf-surface">
                <img 
                  src={mediaInfo.thumbnailUrl} 
                  alt={mediaInfo.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white">
                    <Play size={20} fill="currentColor" />
                  </div>
                </div>
              </div>

              {/* Rich Metadata Information */}
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="font-display font-bold text-lg md:text-xl text-white leading-snug">
                    {mediaInfo.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs lf-text-secondary font-medium font-sans">
                    <span className="lf-text-secondary font-semibold">{t('authorLabel')} {mediaInfo.author}</span>
                    {platformConfig && (
                      <PlatformBadge platformId={mediaInfo.platform} name={platformConfig.name} color={platformConfig.color} variant="inline" />
                    )}
                    <span className="lf-text-faint">•</span>
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border lf-border text-[10px] uppercase font-mono tracking-wider flex items-center gap-1.5 lf-text-secondary">
                      {mediaInfo.type === 'video' && <>{settings.iconStyle === 'emoji' ? <span>🎬</span> : <FileVideo size={10} className="text-violet-400" />} {settings.language === 'en' ? 'Video' : 'Vídeo'}</>}
                      {mediaInfo.type === 'audio' && <>{settings.iconStyle === 'emoji' ? <span>🎵</span> : <Music size={10} className="text-rose-400" />} {settings.language === 'en' ? 'Audio' : 'Áudio'}</>}
                      {mediaInfo.type === 'image' && <>{settings.iconStyle === 'emoji' ? <span>🖼️</span> : <ImageIcon size={10} className="text-cyan-400" />} {settings.language === 'en' ? 'Image' : 'Imagem'}</>}
                    </span>
                  </div>
                  {/* Metadata: views, date, formats, duration */}
                  <div className="flex flex-wrap items-center gap-x-1 text-[11px] lf-text-faint font-medium">
                    {mediaInfo.views && (
                      <span className="flex items-center gap-1 px-2">
                        {settings.iconStyle === 'emoji' ? <span>👁️</span> : <Eye size={10} className="text-sky-400" />}
                        <span className="lf-text-secondary">{mediaInfo.views}</span>
                      </span>
                    )}
                    <span className="text-zinc-700">|</span>
                    {mediaInfo.publishDate && (
                      <span className="flex items-center gap-1 px-2">
                        {settings.iconStyle === 'emoji' ? <span>📅</span> : <Calendar size={10} className="text-amber-400" />}
                        <span className="lf-text-secondary">{mediaInfo.publishDate}</span>
                      </span>
                    )}
                    <span className="text-zinc-700">|</span>
                    <span className="flex items-center gap-1 px-2">
                      {settings.iconStyle === 'emoji' ? <span>📁</span> : <FolderOpen size={10} className="text-emerald-400" />}
                      <span className="lf-text-secondary">{mediaInfo.formats.length} {settings.language === 'en' ? 'formats' : 'formatos'}</span>
                    </span>
                    <span className="text-zinc-700">|</span>
                    {mediaInfo.duration && (
                      <span className="flex items-center gap-1 px-2">
                        {settings.iconStyle === 'emoji' ? <span>⏱️</span> : <Clock size={10} className="text-violet-400" />}
                        <span className="lf-text-secondary">{mediaInfo.duration}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Toolbelt */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleToggleFav}
                    className={`
                      px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all
                      ${isFav 
                        ? `${getAccentBorderClass(settings)} bg-current text-white` 
                        : 'lf-border lf-surface-40 lf-text-secondary hover:text-white hover:bg-zinc-850'
                      }
                    `}
                    style={isFav ? { backgroundColor: `rgba(var(--color-primary-rgb), 0.1)`, color: 'var(--color-primary)' } : {}}
                  >
                    {settings.iconStyle === 'emoji' ? <span>⭐</span> : <Star size={14} fill={isFav ? 'currentColor' : 'none'} className={getAccentTextClass(settings)} />}
                    {isFav ? (settings.language === 'en' ? 'Favorited' : 'Favoritado') : t('favorite')}
                  </button>

                  <button
                    onClick={handleToggleLater}
                    className={`
                      px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all
                      ${isLater 
                        ? `${getAccentBorderClass(settings)} bg-current text-white` 
                        : 'lf-border lf-surface-40 lf-text-secondary hover:text-white hover:bg-zinc-850'
                      }
                    `}
                    style={isLater ? { backgroundColor: `rgba(var(--color-primary-rgb), 0.1)`, color: 'var(--color-primary)' } : {}}
                  >
                    {settings.iconStyle === 'emoji' ? <span>⏰</span> : <Clock size={14} className={getAccentTextClass(settings)} />}
                    {t('laterBtn')}
                  </button>

                  {mediaInfo.type !== 'image' && (
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => handleDownloadThumbnail()}
                        className="px-3.5 py-2 rounded-xl border lf-border lf-surface-40 lf-text-secondary hover:text-white hover:bg-zinc-850 text-xs font-semibold flex items-center gap-2 transition-all"
                      >
                        {settings.iconStyle === 'emoji' ? <span>🖼️</span> : <ImageIcon size={14} className={getAccentTextClass(settings)} />}
                        {settings.language === 'en' ? 'Download Thumbnail' : 'Baixar Capa'}
                      </button>
                      {showCoverFormats && (
                        <div className="flex gap-1.5">
                          {(['jpg', 'png', 'webp'] as const).map(fmt => (
                            <button
                              key={fmt}
                              onClick={() => handleDownloadThumbnail(fmt)}
                              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase lf-surface-40 lf-border lf-text-secondary hover:text-white transition-all"
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <a
                    href={mediaInfo.originalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-3.5 py-2 rounded-xl border lf-border lf-surface-40 lf-text-secondary hover:text-white hover:bg-zinc-850 text-xs font-semibold flex items-center gap-2 transition-all"
                  >
                    {settings.iconStyle === 'emoji' ? <span>🔗</span> : <ExternalLink size={14} className={getAccentTextClass(settings)} />}
                    {t('btnOriginal')}
                  </a>
                </div>
              </div>
            </div>

            {/* Format Selector with Probe Options */}
            <div className="border-t lf-border pt-6 space-y-5">
              {probeLoading && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-500/10 border lf-border lf-text-secondary text-xs font-medium">
                  <RefreshCw size={14} className="animate-spin" />
                  {settings.language === 'en' ? 'Probing media info...' : 'Analisando informações da mídia...'}
                </div>
              )}
              {probeError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                  <AlertCircle size={14} />
                  {settings.language === 'en' ? 'Probe error' : 'Erro na sonda'}: {probeError}
                </div>
              )}

              <Suspense fallback={<div className="h-40 lf-surface-40 rounded-xl animate-pulse" />}>
                <FormatSelector
                  mediaInfo={mediaInfo}
                  onFormatSelect={setFormatOptions}
                  onFormatChange={setSelectedFormat}
                  formatOptions={formatOptions}
                />
              </Suspense>
            </div>

            {/* Execute Download trigger */}
            <div className="border-t lf-border pt-6 space-y-4">
              <SummaryPanel formatOptions={formatOptions} selectedFormat={selectedFormat} mediaInfo={mediaInfo} />
              <div className="flex justify-end">
                <button
                  onClick={handleStartDownload}
                  disabled={!selectedFormat}
                  className={`
                    w-full sm:w-auto px-6 py-3 rounded-xl text-white font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all
                    ${!selectedFormat ? 'bg-zinc-600 hover:bg-zinc-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'} hover:scale-[1.02] active:scale-[0.98]
                  `}
                >
                  <Download size={18} />
                  {t('btnDownloadSelected')}
                </button>
              </div>
            </div>
          </AnimatedCard>
        )}
      </AnimatedList>

      {/* Safety & Performance assurances info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: t('feat1Title'), icon: RefreshCw, desc: t('feat1Desc') },
          { title: t('feat2Title'), icon: ShieldCheck, desc: t('feat2Desc') },
          { title: t('feat3Title'), icon: HelpCircle, desc: t('feat3Desc') }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="p-4 rounded-2xl glass-card flex gap-3.5 items-start">
              <div className={`p-2 rounded-lg lf-surface ${getAccentTextClass(settings)} shrink-0`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="font-semibold text-xs text-white">{item.title}</p>
                <p className="text-[10px] lf-text-secondary mt-1">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
