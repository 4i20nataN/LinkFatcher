import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation, type TranslationKey } from '../../core/i18n';
import { MediaInfo, MediaFormat } from '../../types';
import { getAccentBgClass, getAccentTextClass, getAccentBorderClass, getAccentTextOnBgClass } from '../../components/ThemeWrapper';
import { Toggle } from '../../components/Toggle';
import { BlockIcon, BlockTitle, BlockId } from '../../components/BlockIcon';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { AnimatedAccordion } from '../../animation/AnimatedAccordion';
import { AnimatedButton } from '../../animation/AnimatedButton';
import { TabIndicator, LayoutGroup } from '../../animation/TabIndicator';
import { chevronRotate, slideUp, scaleIn, fadeIn, transitions } from '../../animation/variants';
import { ChevronDown, ChevronUp, Info, ArrowDownToLine, AlertTriangle, FileText, Download } from 'lucide-react';
import { AUDIO_QUALITY_PRESETS } from './constants';

interface FormatSelectorProps {
  mediaInfo: MediaInfo;
  onFormatSelect: (options: FormatOptions) => void;
  onFormatChange?: (format: MediaFormat) => void;
  formatOptions?: FormatOptions;
}

export type { FormatOptions } from './FormatOptions';
import type { FormatOptions } from './FormatOptions';

const VIDEO_PRESETS = [
  { id: 'best', label: '★ Melhor', height: Infinity, format: 'bestvideo+bestaudio/best', starYellow: true },
  { id: '2160p', label: '4K Ultra', height: 2160, format: 'bv*[height<=2160]+ba/b[height<=2160]' },
  { id: '1440p', label: '1440 QHD', height: 1440, format: 'bv*[height<=1440]+ba/b[height<=1440]' },
  { id: '1080p', label: '1080 Full HD', height: 1080, format: 'bv*[height<=1080]+ba/b[height<=1080]' },
  { id: '720p', label: '720 HD', height: 720, format: 'bv*[height<=720]+ba/b[height<=720]' },
  { id: '480p', label: '480 SD', height: 480, format: 'bv*[height<=480]+ba/b[height<=480]' },
  { id: '360p', label: '360 Baixa', height: 360, format: 'bv*[height<=360]+ba/b[height<=360]' },
] as const;

const VIDEO_FORMATS = ['mp4', 'mkv', 'webm', 'flv'] as const;
const VIDEO_CODECS = [
  { id: '', label: 'Auto', tip: 'Escolher automaticamente o melhor codec' },
  { id: 'h264', label: 'H.264', tip: 'Mais compativel. Funciona em todos os dispositivos' },
  { id: 'h265', label: 'H.265', tip: 'Melhor compressao. Pode nao funcionar em TVs antigas' },
  { id: 'vp9', label: 'VP9', tip: 'Codec Google. Bom para YouTube, compressao eficiente' },
  { id: 'av01', label: 'AV1', tip: 'Codec moderno. Maior compressao. Suporte crescente' },
] as const;
// Filtro [vcodec~=] usa regex search contra strings reais (avc1.*, hev1.*, vp9, av01.*).
// h264/h265 precisam de alternância — valor puro nunca casa com avc1/hev1.
const CODEC_FILTER: Record<string, string> = {
  h264: '"^(avc|h264)"',
  h265: '"^(hev|hvc|h265)"',
  vp9: 'vp9',
  av01: 'av01',
};
// Compat container × codec de vídeo no merge (-c copy): o Auto é imprevisível
// (pode cair em codec incompatível), então containers restritos exigem codec
// explícito. A faixa de áudio (bestaudio) o app não escolhe — risco residual.
const CODECS_FOR_CONTAINER: Record<string, string[]> = {
  webm: ['', 'vp9', 'av01'],
  flv: ['', 'h264'],
};
const CONTAINERS_FOR_CODEC: Record<string, string[]> = {
  h264: ['mp4', 'mkv', 'flv'],
  h265: ['mp4', 'mkv'],
  vp9: ['mp4', 'mkv', 'webm'],
  av01: ['mp4', 'mkv', 'webm'],
};
// Incorporar thumbnail: yt-dlp só aceita mp3, mkv/mka, ogg/opus/flac, m4a/mp4/m4v/mov
function canEmbedThumbnail(o: FormatOptions): boolean {
  if (o.audioOnly) {
    return o.audioFormat === 'mp3' || o.audioFormat === 'flac' || o.audioFormat === 'opus' || o.audioFormat === 'm4a' || o.audioFormat === 'aac';
  }
  return !o.videoFormat || o.videoFormat === 'mp4' || o.videoFormat === 'mkv';
}
const AUDIO_FORMATS = [
  { id: 'mp3', label: 'MP3' },
  { id: 'aac', label: 'AAC' },
  { id: 'm4a', label: 'M4A' },
  { id: 'flac', label: 'FLAC' },
  { id: 'opus', label: 'OPUS' },
  { id: 'wav', label: 'WAV' },
] as const;
const SUB_FORMATS = ['srt', 'ass', 'vtt'] as const;
const SUB_LANGS = [
  { id: 'pt', label: 'PT' },
  { id: 'en', label: 'EN' },
  { id: 'es', label: 'ES' },
  { id: 'pt,en', label: 'PT+EN' },
  { id: 'all', label: 'ALL' },
] as const;

// Tips de codec por id (labels ficam no render via t()).
const CODEC_TIPS: Record<string, TranslationKey> = {
  '': 'fmtTipAuto',
  h264: 'fmtTipH264',
  h265: 'fmtTipH265',
  vp9: 'fmtTipVp9',
  av01: 'fmtTipAv1',
};

type TabId = 'media' | 'advanced';

export function parseFormatHeight(quality: string): number {
  if (!quality) return 0;
  const xy = quality.match(/(\d+)\s*x\s*(\d+)/);
  if (xy) return parseInt(xy[2], 10);
  const m = quality.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

function getMaxVideoHeight(formats: MediaInfo['formats']): number {
  let maxH = 0;
  for (const f of formats) {
    if (f.type === 'video' || f.type === 'image') {
      const h = parseFormatHeight(f.quality);
      if (h > maxH) maxH = h;
    }
  }
  return maxH;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseTimeInput(text: string): number | null {
  const cleaned = text.trim();
  if (!cleaned) return null;
  const parts = cleaned.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2 && parts[0] >= 0 && parts[1] >= 0 && parts[1] < 60) return parts[0] * 60 + parts[1];
  return null;
}

interface TimeRangeSliderProps {
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  accentBg: string;
  onChange: (start: number, end: number) => void;
}

function TimeRangeSlider({ durationSeconds, startSeconds, endSeconds, accentBg, onChange }: TimeRangeSliderProps) {
  const { settings } = useApp();
  const { t } = useTranslation(settings);
  const maxVal = durationSeconds || 1;
  const effectiveEnd = endSeconds || durationSeconds;

  const startPct = (startSeconds / maxVal) * 100;
  const endPct = (effectiveEnd / maxVal) * 100;

  const [inputStart, setInputStart] = useState(formatTime(startSeconds));
  const [inputEnd, setInputEnd] = useState(endSeconds > 0 ? formatTime(endSeconds) : '');
  const [inputFocused, setInputFocused] = useState<'start' | 'end' | null>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (inputFocused !== 'start') setInputStart(formatTime(startSeconds));
  }, [startSeconds, inputFocused]);

  useEffect(() => {
    if (inputFocused !== 'end') setInputEnd(endSeconds > 0 ? formatTime(endSeconds) : '');
  }, [endSeconds, inputFocused]);

  const commitInput = (which: 'start' | 'end', raw: string) => {
    const parsed = parseTimeInput(raw);
    if (parsed !== null) {
      if (which === 'start') {
        const clamped = Math.min(parsed, effectiveEnd > 0 ? effectiveEnd - 1 : durationSeconds);
        onChange(Math.max(0, clamped), endSeconds);
      } else {
        const clamped = Math.min(Math.max(parsed, startSeconds + 1), durationSeconds);
        onChange(startSeconds, clamped >= durationSeconds ? 0 : clamped);
      }
    }
    setInputFocused(null);
  };

  const updateFromClientX = useCallback((which: 'start' | 'end', clientX: number) => {
    const track = document.querySelector('[data-time-range-track]') as HTMLElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const val = Math.round(pct * maxVal);
    if (which === 'start') {
      const maxAllowed = effectiveEnd > 0 ? effectiveEnd - 1 : maxVal;
      if (val <= maxAllowed) onChange(val, endSeconds);
    } else {
      const minAllowed = startSeconds + 1;
      if (val >= minAllowed) onChange(startSeconds, val >= durationSeconds ? 0 : val);
    }
  }, [maxVal, effectiveEnd, durationSeconds, endSeconds, startSeconds, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const mouseMove = (e: MouseEvent) => { e.preventDefault(); updateFromClientX(dragging, e.clientX); };
    const mouseUp = () => setDragging(null);
    const touchMove = (e: TouchEvent) => { e.preventDefault(); updateFromClientX(dragging, e.touches[0].clientX); };
    const touchEnd = () => setDragging(null);
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    return () => {
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', mouseUp);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
    };
  }, [dragging, updateFromClientX]);

  const cutDuration = effectiveEnd > startSeconds ? effectiveEnd - startSeconds : 0;

  return (
    <div className="space-y-3">
      <div className="relative h-6 flex items-center select-none" data-time-range-track>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full lf-surface-raised" />
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-1 rounded-full ${accentBg}`}
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        <input
          type="range"
          min={0}
          max={maxVal}
          step={1}
          value={startSeconds}
          onChange={e => {
            const val = parseInt(e.target.value);
            const maxAllowed = effectiveEnd > 0 ? effectiveEnd - 1 : maxVal;
            if (val <= maxAllowed) onChange(val, endSeconds);
          }}
          className="absolute inset-0 opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-label={t('fmtTrimStartAria')}
        />
        <input
          type="range"
          min={0}
          max={maxVal}
          step={1}
          value={effectiveEnd}
          onChange={e => {
            const val = parseInt(e.target.value);
            const minAllowed = startSeconds + 1;
            if (val >= minAllowed) onChange(startSeconds, val >= durationSeconds ? 0 : val);
          }}
          className="absolute inset-0 opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-label={t('fmtTrimEndAria')}
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setDragging('start'); }}
          onTouchStart={e => { setDragging('start'); }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(0, startSeconds - 1), endSeconds); }
            if (e.key === 'ArrowRight') { e.preventDefault(); const maxAllowed = effectiveEnd > 0 ? effectiveEnd - 1 : maxVal; if (startSeconds + 1 <= maxAllowed) onChange(startSeconds + 1, endSeconds); }
          }}
          className="absolute top-1/2 w-4 h-4 rounded-full bg-white border-2 border-zinc-300 shadow-lg transition-transform hover:scale-125 active:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900"
          style={{ left: `${startPct}%`, transform: 'translate(-50%, -50%)', zIndex: 4 }}
          aria-label={t('fmtTrimStartAria')}
          aria-valuemin={0}
          aria-valuemax={maxVal}
          aria-valuenow={startSeconds}
          tabIndex={0}
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setDragging('end'); }}
          onTouchStart={e => { setDragging('end'); }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); const minAllowed = startSeconds + 1; if (effectiveEnd - 1 >= minAllowed) onChange(startSeconds, effectiveEnd - 1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); if (effectiveEnd < maxVal) onChange(startSeconds, effectiveEnd + 1 >= durationSeconds ? 0 : effectiveEnd + 1); }
          }}
          className="absolute top-1/2 w-4 h-4 rounded-full bg-white border-2 border-zinc-300 shadow-lg transition-transform hover:scale-125 active:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900"
          style={{ left: `${endPct}%`, transform: 'translate(-50%, -50%)', zIndex: 4 }}
          aria-label={t('fmtTrimEndAria')}
          aria-valuemin={0}
          aria-valuemax={maxVal}
          aria-valuenow={effectiveEnd}
          tabIndex={0}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputStart}
          onFocus={() => setInputFocused('start')}
          onBlur={e => commitInput('start', e.target.value)}
          onChange={e => setInputStart(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-16 px-2 py-1.5 rounded-lg lf-surface lf-border fs-sm font-mono text-white text-center placeholder-zinc-600 focus:outline-none focus:border-white/15"
          placeholder="00:00"
        />
        <span className="lf-text-faint text-xs">-</span>
        <input
          type="text"
          value={inputEnd}
          onFocus={() => setInputFocused('end')}
          onBlur={e => commitInput('end', e.target.value)}
          onChange={e => setInputEnd(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-16 px-2 py-1.5 rounded-lg lf-surface lf-border fs-sm font-mono text-white text-center placeholder-zinc-600 focus:outline-none focus:border-white/15"
          placeholder={t('fmtEndWord')}
        />
        {cutDuration > 0 && (
          <span className="ml-auto fs-sm lf-text-muted font-mono">
            {formatTime(cutDuration)}
          </span>
        )}
      </div>
    </div>
  );
}

interface AccordionSectionProps {
  title: string;
  blockId: BlockId;
  isOpen: boolean;
  onToggle: () => void;
  accentBg: string;
  children: React.ReactNode;
}

const AccordionSection = React.memo<AccordionSectionProps>(({ title, blockId, isOpen, onToggle, accentBg, children }) => (
  <div className="rounded-xl lf-surface-50 border-[0.5px] lf-border-strong glass-section">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center gap-3">
        <BlockIcon blockId={blockId} />
        <BlockTitle>{title}</BlockTitle>
      </div>
      <div
        style={{ transform: `rotate(${isOpen ? 180 : 0}deg)`, transition: 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)' }}
      >
        <ChevronDown size={14} className="lf-text-muted" />
      </div>
    </button>
    <AnimatedAccordion isOpen={isOpen}>
      {children}
    </AnimatedAccordion>
  </div>
));
AccordionSection.displayName = 'AccordionSection';

function fmtDate(d: string, forFilename = false): string {
  if (/^\d{8}$/.test(d)) {
    const sep = forFilename ? '-' : '/';
    return `${d.slice(6,8)}${sep}${d.slice(4,6)}${sep}${d.slice(0,4)}`;
  }
  return forFilename ? d.replace(/\//g, '-') : d;
}

function fmtDuration(dur: string): string {
  const parts = dur.split(':');
  if (parts.length === 3) return `${parts[0]}h${parts[1]}m${parts[2]}s`;
  if (parts.length === 2) return `${parts[0]}m${parts[1]}s`;
  return dur;
}

export const FormatSelector = React.memo(function FormatSelector({ mediaInfo, onFormatSelect, onFormatChange, formatOptions }: FormatSelectorProps) {
  const { settings, updateSettings } = useApp();
  const { t } = useTranslation(settings);
  const [activeTab, setActiveTab] = useState<TabId>('media');
  // Refs dos inputs manuais de recorte: o pareamento start/end usava
  // querySelector no placeholder (quebrava ao traduzir). Refs são à prova.
  const trimStartRef = useRef<HTMLInputElement>(null);
  const trimEndRef = useRef<HTMLInputElement>(null);
  const [showSubs, setShowSubs] = useState(!!formatOptions?.writeSubs);
  const [useUnderscore, setUseUnderscore] = useState(true);
  const [uiScale, setUiScale] = useState(50);
  const [descExpanded, setDescExpanded] = useState(false);

  const maxRes = useMemo(() => getMaxVideoHeight(mediaInfo.formats), [mediaInfo.formats]);

  const [options, setOptions] = useState<FormatOptions>(() => ({
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
    concurrentFragments: 0,
    retries: 0,
    restrictFilenames: false,
    noOverwrites: false,
    keepVideo: false,
    videoOnly: false,
    sponsorblockRemove: '',
    fpsMax: 0,
    bandLimit: 0,
    videoCodec: '',
    customFilename: '',
    descFormat: 'none',
    ...formatOptions,
  }));

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const findMatchingFormat = useCallback((): MediaFormat | null => {
    const formats = mediaInfo.formats;
    if (!formats.length) return null;

    if (options.audioOnly) {
      const audioFormats = formats.filter(f => f.type === 'audio');
      if (audioFormats.length) {
        const preferred = audioFormats.find(f => f.ext === options.audioFormat);
        return preferred || audioFormats.reduce((best, f) => (f.sizeBytes > best.sizeBytes ? f : best), audioFormats[0]);
      }
      return formats[0];
    }

    const presetMatch = VIDEO_PRESETS.find(p => p.format === options.format);
    const heightFromFormat = options.format?.match(/height<=(\d+)/)?.[1];
    const targetHeight = presetMatch?.height ?? (heightFromFormat ? parseInt(heightFromFormat, 10) : undefined);
    if (targetHeight && targetHeight !== Infinity) {
      const videoFormats = formats.filter(f => f.type === 'video');
      const matching = videoFormats
        .filter(f => {
          const h = parseFormatHeight(f.quality);
          return h > 0 && h <= targetHeight;
        })
        .sort((a, b) => {
          const ha = parseFormatHeight(a.quality);
          const hb = parseFormatHeight(b.quality);
          if (hb !== ha) return hb - ha;
          return b.sizeBytes - a.sizeBytes;
        });
      if (matching.length) return matching[0];
      if (videoFormats.length) return videoFormats.sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
    }

    const videoFormats = formats.filter(f => f.type === 'video');
    if (videoFormats.length) return videoFormats.sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
    return formats[0];
  }, [mediaInfo.formats, options.format, options.audioOnly, options.audioFormat]);

  useEffect(() => {
    if (onFormatChange && mediaInfo.type !== 'image') {
      const fmt = findMatchingFormat();
      if (fmt) onFormatChange(fmt);
    }
  }, [onFormatChange, findMatchingFormat, mediaInfo.type]);

  const update = useCallback((partial: Partial<FormatOptions>) => {
    setOptions(prev => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    onFormatSelect(options);
  }, [options, onFormatSelect]);

  useEffect(() => {
    if (trimStart === 0 && trimEnd === 0) {
      update({ downloadSections: '' });
    } else {
      const start = formatTime(trimStart);
      const end = trimEnd > 0 ? formatTime(trimEnd) : '';
      update({ downloadSections: `*${start}-${end}` });
    }
  }, [trimStart, trimEnd, update]);

  // Altura-alvo do preset atual (para compatibilidade FPS × resolução)
  const selectedTargetHeight = useMemo(() => {
    const presetMatch = VIDEO_PRESETS.find(p => p.format === options.format);
    const heightFromFormat = options.format?.match(/height<=(\d+)/)?.[1];
    const h = presetMatch?.height ?? (heightFromFormat ? parseInt(heightFromFormat, 10) : undefined);
    return h && h !== Infinity ? h : undefined;
  }, [options.format]);

  // FPS disponível para a resolução selecionada: existe formato no teto da
  // resolução com esse fps (fps desconhecido conta como compatível).
  const isFpsAvailable = useCallback((fps: number): boolean => {
    if (fps === 0) return true;
    if (options.audioOnly) return true;
    if (selectedTargetHeight == null) return true;
    const pool = mediaInfo.formats.filter(f => {
      if (f.type !== 'video') return false;
      const h = parseFormatHeight(f.quality);
      return h > 0 && h <= selectedTargetHeight;
    });
    if (!pool.length) return true;
    const top = Math.max(...pool.map(f => parseFormatHeight(f.quality)));
    return pool.some(f => parseFormatHeight(f.quality) === top && (f.fps == null || f.fps <= fps));
  }, [mediaInfo.formats, options.audioOnly, selectedTargetHeight]);

  // Se a resolução mudou e o FPS atual não existe nela, volta para Original
  useEffect(() => {
    if (options.fpsMax && options.fpsMax > 0 && !isFpsAvailable(options.fpsMax)) {
      update({ fpsMax: 0 });
    }
  }, [options.fpsMax, isFpsAvailable, update]);

  // Compat container × codec de vídeo (null = tudo permitido)
  const allowedCodecs = useMemo(() => {
    if (options.audioOnly) return null;
    return CODECS_FOR_CONTAINER[options.videoFormat || ''] ?? null;
  }, [options.audioOnly, options.videoFormat]);
  const allowedContainers = useMemo(() => {
    if (options.audioOnly) return null;
    return CONTAINERS_FOR_CODEC[options.videoCodec || ''] ?? null;
  }, [options.audioOnly, options.videoCodec]);

  // Ao mudar um lado, o outro volta p/ neutro se ficar incompatível
  useEffect(() => {
    if (options.audioOnly) return;
    if (allowedCodecs && !allowedCodecs.includes(options.videoCodec)) {
      update({ videoCodec: allowedCodecs[0] });
    }
  }, [options.audioOnly, allowedCodecs, options.videoCodec, update]);
  useEffect(() => {
    if (options.audioOnly) return;
    if (allowedContainers && options.videoFormat && !allowedContainers.includes(options.videoFormat)) {
      update({ videoFormat: '' });
    }
  }, [options.audioOnly, allowedContainers, options.videoFormat, update]);
  // Embutir legendas só vale em mp4/webm/mkv com vídeo (yt-dlp rejeita em áudio)
  useEffect(() => {
    if (options.embedSubs && (options.audioOnly || (options.videoFormat && !['mp4', 'webm', 'mkv'].includes(options.videoFormat)))) {
      update({ embedSubs: false });
    }
  }, [options.videoFormat, options.audioOnly, options.embedSubs, update]);
  // Manter vídeo só vale com extração de áudio
  useEffect(() => {
    if (!options.audioOnly && options.keepVideo) {
      update({ keepVideo: false });
    }
  }, [options.audioOnly, options.keepVideo, update]);
  // Incorporar thumbnail só vale nos formatos aceitos
  useEffect(() => {
    if (options.embedThumbnail && !canEmbedThumbnail(options)) {
      update({ embedThumbnail: false });
    }
  }, [options.embedThumbnail, options.audioOnly, options.audioFormat, options.videoFormat, update]);

  const accentBg = getAccentBgClass(settings).split(' ')[0];
  const accentText = getAccentTextClass(settings);
  const accentBorder = getAccentBorderClass(settings).split(' ')[0];
  const accentTextOnBg = getAccentTextOnBgClass(settings);

  const isImage = mediaInfo.type === 'image';

  if (isImage) {
    const imageFormats = mediaInfo.formats.filter(f => f.type === 'image');
    const origExt = mediaInfo.originalUrl?.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
    return (
      <div className="space-y-3">
        {/* Preview card */}
        <div className="flex items-center gap-3 p-3 rounded-xl lf-surface-40 lf-border">
          <div className="w-16 h-16 rounded-lg overflow-hidden lf-border-strong lf-surface shrink-0">
            <img src={mediaInfo.thumbnailUrl || mediaInfo.originalUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" loading="lazy" decoding="async" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="fs-sm font-semibold text-white truncate">{mediaInfo.title}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="fs-sm lf-text-secondary font-mono">{mediaInfo.resolution || 'Imagem'}</span>
              {origExt && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold lf-surface-raised lf-text-secondary uppercase">{origExt}</span>
              )}
              {mediaInfo.sizeEst !== 'N/A' && (
                <span className="fs-sm lf-text-muted">{mediaInfo.sizeEst}</span>
              )}
            </div>
          </div>
        </div>

        {imageFormats.length > 0 && (
          <div className="p-3 rounded-xl lf-surface-40 lf-border space-y-2">
            <div className="flex items-center gap-2">
              <BlockIcon blockId="resolution" />
              <BlockTitle>{settings.language === 'en' ? 'Convert to' : 'Converter para'}</BlockTitle>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {imageFormats.map(fmt => (
                <button
                  key={fmt.id}
                  onClick={() => {
                    setOptions(prev => ({ ...prev, format: fmt.id }));
                    onFormatChange(fmt);
                  }}
                  className={`
                    border rounded-lg fs-sm font-bold transition-all text-center py-2.5
                    ${options.format === fmt.id
                      ? `lf-surface-40 text-white ${accentBorder}`
                      : 'lf-surface-40 lf-border lf-text-secondary hover:text-zinc-200 hover:bg-zinc-800'}
                  `}
                >
                  {fmt.quality}
                </button>
              ))}
            </div>
            <p className="text-[9px] lf-text-faint italic">{t('fmtCanvasNote')}</p>
          </div>
        )}
      </div>
    );
  }

  const selectedPreset = useMemo(
    () => VIDEO_PRESETS.find(p => p.format === options.format && !options.audioOnly),
    [options.format, options.audioOnly]
  );
  const isOverMaxRes = selectedPreset && selectedPreset.height !== Infinity && maxRes > 0 && selectedPreset.height > maxRes;

  const ToggleRow: React.FC<{ value: boolean; onChange: () => void; label: string; desc?: string; icon?: React.ReactNode }> = ({ value, onChange, label, desc, icon }) => (
    <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
      <div className="flex items-center gap-2">
        {icon && <span className="lf-text-secondary">{icon}</span>}
        <div>
          <p className="fs-sm font-semibold text-white">{label}</p>
          {desc && <p className="fs-sm lf-text-muted mt-0.5">{desc}</p>}
        </div>
      </div>
      <Toggle value={value} onChange={onChange} settings={settings} />
    </div>
  );

  const SmallToggle: React.FC<{ value: boolean; onChange: () => void; label: string }> = ({ value, onChange, label }) => (
    <div className="flex items-center justify-between p-2.5 rounded-lg lf-surface-30 lf-border">
      <label className="fs-sm lf-text-secondary">{label}</label>
      <Toggle value={value} onChange={onChange} settings={settings} />
    </div>
  );

  const TooltipWrapper: React.FC<{ tip: string; children: React.ReactNode }> = ({ tip, children }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
      <div 
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
        <AnimatedList>
          {isHovered && (
            <AnimatedCard 
              variant={scaleIn}
              transition={transitions.tooltip}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg lf-surface-raised lf-border-strong fs-sm lf-text-secondary whitespace-nowrap z-[100] shadow-2xl pointer-events-none"
            >
              {tip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-800" />
            </AnimatedCard>
          )}
        </AnimatedList>
      </div>
    );
  };

  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const Btn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; className?: string; disabled?: boolean }> = ({ active, onClick, children, className = '', disabled = false }) => {
    const baseClasses = 'lf-opt relative !overflow-visible rounded-xl px-3 py-1.5 fs-sm font-bold transition-all text-center cursor-pointer';
    const stateClasses = active ? 'z-10 active' : 'z-0';
    const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';
    
    return (
      <AnimatedButton
        onClick={onClick}
        disabled={disabled}
        tapScale={0.97}
        className={[baseClasses, stateClasses, disabledClasses, className].filter(Boolean).join(' ')}
      >
      {active && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
      )}
      {children}
    </AnimatedButton>
    );
  };

  return (
    <div className="space-y-3" style={{ '--ui-scale': uiScale } as React.CSSProperties}>
      <LayoutGroup>
      <div className="flex items-center gap-1 border-b lf-border">
        {([
          { id: 'media' as TabId, blockId: 'video-format' as BlockId, label: t('fmtMediaTab') },
          { id: 'advanced' as TabId, blockId: 'behavior' as BlockId, label: t('fmtAdvancedTab') },
        ]).map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 fs-sm font-semibold transition-all relative ${isActive ? accentText : 'lf-text-muted hover:text-zinc-300'}`}
            >
              <BlockIcon blockId={tab.blockId} size={14} />
              {tab.label}
              {isActive && (
                <TabIndicator
                  layoutId="tab-indicator"
                  className={`absolute bottom-0 left-0 right-0 h-0.5 ${accentBg}`}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end -mt-2 mb-1">
        <div className="flex items-center gap-0.5">
          <span className="fs-sm lf-text-faint mr-0.5">🔍</span>
          <button onClick={() => setUiScale(s => Math.max(0, s - 5))} className="w-5 h-5 rounded flex items-center justify-center fs-sm lf-text-faint hover:text-zinc-300 hover:bg-zinc-800 transition-colors">A-</button>
          <span className="fs-xs lf-text-muted w-7 text-center font-mono">{uiScale}%</span>
          <button onClick={() => setUiScale(s => Math.min(100, s + 5))} className="w-5 h-5 rounded flex items-center justify-center fs-sm lf-text-faint hover:text-zinc-300 hover:bg-zinc-800 transition-colors">A+</button>
        </div>
      </div>

      <AnimatedList mode="wait">
        {activeTab === 'media' && (
          <AnimatedCard animateKey="media" variant={slideUp} className="space-y-3">

            {/* ── Resolução ── */}
            <AccordionSection id="resolution" title={t('fmtResolution')} blockId="resolution" isOpen={openSections.has('resolution')} onToggle={() => toggleSection('resolution')} accentBg={accentBg}>
              <div className={`px-3 pb-3 pt-2 space-y-2 ${options.audioOnly ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="flex flex-wrap gap-2.5">
                  {VIDEO_PRESETS.map(preset => {
                    const unavailable = preset.height !== Infinity && maxRes > 0 && preset.height > maxRes;
                    return (
                      <Btn
                        key={preset.id}
                        active={options.format === preset.format && !options.audioOnly}
                        onClick={() => {
                          let fmt: string = preset.format;
                          if (options.videoCodec) {
                            fmt = fmt.replace(/\[vcodec~?[^]]*\]/g, '');
                            fmt = fmt.replace(/bv\*\[/g, `bv*[vcodec~=${CODEC_FILTER[options.videoCodec] ?? options.videoCodec}][`);
                          }
                          update({ format: fmt, audioOnly: false });
                        }}
                        disabled={unavailable}
                        className="py-2.5"
                      >
                        {'starYellow' in preset && preset.starYellow ? (
                          <><span className="text-yellow-400">★</span> {t('fmtBest')}</>
                        ) : preset.id === '360p' ? t('fmtPreset360') : preset.label}
                      </Btn>
                    );
                  })}
                </div>
                {maxRes > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg lf-surface-30 lf-border">
                    <Info size={12} className="lf-text-muted shrink-0" />
                    <p className="fs-sm lf-text-secondary">
                      {settings.language === 'en'
                        ? `This video is available up to ${maxRes}p. Higher presets will download at the maximum available quality.`
                        : `Este video esta disponivel ate ${maxRes}p. Presets maiores serao baixados na maxima qualidade disponivel.`}
                    </p>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* ── Formato Video + Codecs ── */}
            <AccordionSection id="video-format" title={t('fmtFormats')} blockId="video-format" isOpen={openSections.has('video-format')} onToggle={() => toggleSection('video-format')} accentBg={accentBg}>
              <div className={`px-3 pb-3 pt-2 space-y-3 ${options.audioOnly ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className={`space-y-2 ${options.videoOnly ? 'opacity-30 pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-2">
                      <BlockIcon blockId="container" />
                      <BlockTitle>{t('fmtContainer')}</BlockTitle>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {VIDEO_FORMATS.map(fmt => {
                        const ok = !allowedContainers || allowedContainers.includes(fmt);
                        const btn = (
                          <Btn
                            key={fmt}
                            active={!options.audioOnly && options.videoFormat === fmt}
                            disabled={!ok}
                            onClick={() => {
                              if (options.audioOnly) return;
                              update({ videoFormat: fmt });
                            }}
                            className="py-2"
                          >
                            {fmt.toUpperCase()}
                          </Btn>
                        );
                        return ok ? btn : (
                          <TooltipWrapper key={fmt} tip={t('fmtTipIncompatCodec', { name: VIDEO_CODECS.find(c => c.id === options.videoCodec)?.label ?? options.videoCodec })}>
                            {btn}
                          </TooltipWrapper>
                        );
                      })}
                    </div>
                    {options.videoOnly && (
                      <p className="fs-sm lf-text-faint">{t('fmtVideoOnlyNote')}</p>
                    )}
                  </div>
                    <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BlockIcon blockId="codec" />
                      <BlockTitle>{t('fmtCodec')}</BlockTitle>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {VIDEO_CODECS.map(codec => {
                        const ok = !allowedCodecs || allowedCodecs.includes(codec.id);
                        const btn = (
                          <Btn
                            key={codec.id}
                            active={options.videoCodec === codec.id}
                            disabled={!ok}
                            onClick={() => {
                              const codecVal = codec.id;
                              update({ videoCodec: codecVal });
                              if (!options.audioOnly && options.format) {
                                let fmt = options.format;
                                fmt = fmt.replace(/\[vcodec~?[^]]*\]/g, '');
                                if (codecVal) {
                                  fmt = fmt.replace(/bv\*\[/g, `bv*[vcodec~=${CODEC_FILTER[codecVal] ?? codecVal}][`);
                                }
                                update({ format: fmt });
                              }
                            }}
                            className="py-2"
                          >
                            {codec.label}
                          </Btn>
                        );
                        return ok ? (
                          <TooltipWrapper key={codec.id} tip={t(CODEC_TIPS[codec.id] ?? 'fmtTipAuto')}>
                            {btn}
                          </TooltipWrapper>
                        ) : (
                          <TooltipWrapper key={codec.id} tip={t('fmtTipIncompatContainer', { name: options.videoFormat?.toUpperCase() ?? '' })}>
                            {btn}
                          </TooltipWrapper>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </AccordionSection>


            {/* ── Áudio ── */}
            <AccordionSection id="audio" title={t('fmtAudio')} blockId="audio-format" isOpen={openSections.has('audio')} onToggle={() => toggleSection('audio')} accentBg={accentBg}>
              <div className="px-3 pb-3 pt-2 space-y-3">
                <ToggleRow
                  value={options.audioOnly}
                  onChange={() => {
                    const next = !options.audioOnly;
                    const reset: Partial<FormatOptions> = { audioOnly: next };
                    if (next) {
                      reset.embedSubs = false;
                      reset.videoFormat = '';
                      reset.videoCodec = '';
                      reset.fpsMax = 0;
                      reset.videoOnly = false;
                    }
                    update(reset);
                  }}
                  label={t('fmtExtractAudio')}
                  desc={t('fmtExtractAudioDesc')}
                  icon={<BlockIcon blockId="audio-extract" />}
                />
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${options.audioOnly ? '' : 'opacity-30 pointer-events-none'}`}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BlockIcon blockId="audio-format" />
                    <BlockTitle>{t('fmtAudioFormat')}</BlockTitle>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {AUDIO_FORMATS.map(fmt => (
                      <Btn key={fmt.id} active={options.audioFormat === fmt.id} onClick={() => update({ audioFormat: fmt.id })} className="py-2">
                        {fmt.label}
                      </Btn>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BlockIcon blockId="audio-quality" />
                    <BlockTitle>{t('fmtAudioQuality')}</BlockTitle>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {AUDIO_QUALITY_PRESETS.map(q => (
                      <Btn key={q.value} active={options.audioQuality === q.value} onClick={() => update({ audioQuality: q.value })} className="py-2">
                        {q.value === '0' ? t('fmtBest') : q.label}
                      </Btn>
                    ))}
                  </div>
                </div>
                </div>
                {!options.audioOnly && (
                  <p className="fs-sm lf-text-faint">{t('fmtAudioNote')}</p>
                )}
              </div>
            </AccordionSection>

            {/* ── Descrição ── */}
            {mediaInfo.description && (
              <AccordionSection id="description" title={t('fmtDescSection')} blockId="metadata" isOpen={openSections.has('description')} onToggle={() => toggleSection('description')} accentBg={accentBg}>
                <div className="px-3 pb-3 pt-2 space-y-2">
                  <div className={`relative fs-sm lf-text-secondary leading-relaxed whitespace-pre-line ${descExpanded ? '' : 'line-clamp-5'}`}>
                    {mediaInfo.description}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="fs-xs lf-text-muted hover:text-zinc-300 transition-colors flex items-center gap-1"
                    >
                      {descExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {descExpanded ? t('fmtDescCollapse') : t('fmtDescExpand')}
                    </button>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Btn active={options.descFormat === 'none'} onClick={() => update({ descFormat: 'none' })} className="py-1 px-2 text-[10px]">
                        {t('fmtNoInclude')}
                      </Btn>
                      <Btn active={options.descFormat === 'txt'} onClick={() => update({ descFormat: 'txt' })} className="py-1 px-2 text-[10px]">
                        {settings.iconStyle === 'emoji' ? <span className="inline mr-1">📄</span> : <FileText size={10} className={`inline mr-1 ${getAccentTextClass(settings)}`} />}.txt
                      </Btn>
                      <Btn active={options.descFormat === 'md'} onClick={() => update({ descFormat: 'md' })} className="py-1 px-2 text-[10px]">
                        {settings.iconStyle === 'emoji' ? <span className="inline mr-1">⬇️</span> : <Download size={10} className={`inline mr-1 ${getAccentTextClass(settings)}`} />}.md
                      </Btn>
                    </div>
                  </div>
                </div>
              </AccordionSection>
            )}

            {/* ── Legendas ── */}
            <AccordionSection id="subtitles" title={t('fmtSubs')} blockId="subtitles" isOpen={openSections.has('subtitles')} onToggle={() => toggleSection('subtitles')} accentBg={accentBg}>
              <div className="px-3 pb-3 pt-2 space-y-3">
                <ToggleRow
                  value={showSubs}
                  onChange={() => {
                    const next = !showSubs;
                    setShowSubs(next);
                    if (next) update({ writeSubs: true });
                    else update({ writeSubs: false, writeAutoSubs: false, embedSubs: false });
                  }}
                  label={t('fmtDlSubs')}
                  desc={t('fmtDlSubsDesc')}
                />
                {showSubs && (
                  <AnimatedAccordion isOpen={showSubs} className="space-y-3 pl-2 border-l-2 border-zinc-800">
                    <SmallToggle value={options.writeAutoSubs} onChange={() => update({ writeAutoSubs: !options.writeAutoSubs })} label={t('fmtAutoSubs')} />
                    <div className="space-y-1.5">
                      <BlockTitle>{t('fmtSubLang')}</BlockTitle>
                      <div className="flex flex-wrap gap-2.5">
                        {SUB_LANGS.map(lang => (
                          <Btn key={lang.id} active={options.subLangs === lang.id} onClick={() => update({ subLangs: lang.id })} className="py-2">
                            {lang.label}
                          </Btn>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <BlockTitle>{t('fmtSubFormat')}</BlockTitle>
                  <div className="flex flex-wrap gap-2.5">
                        {SUB_FORMATS.map(fmt => (
                          <Btn key={fmt} active={options.subFormat === fmt} onClick={() => update({ subFormat: fmt })} className="py-2">
                            {fmt.toUpperCase()}
                          </Btn>
                        ))}
                      </div>
                    </div>
                    <div className={(!options.audioOnly && (!options.videoFormat || ['mp4', 'webm', 'mkv'].includes(options.videoFormat))) ? '' : 'opacity-30 pointer-events-none'}>
                      <SmallToggle value={options.embedSubs} onChange={() => update({ embedSubs: !options.embedSubs })} label={t('fmtEmbedSubs')} />
                    </div>
                    {(!!options.audioOnly || (!!options.videoFormat && !['mp4', 'webm', 'mkv'].includes(options.videoFormat))) && (
                      <p className="fs-sm lf-text-faint">{t('fmtEmbedSubsNote')}</p>
                    )}
                  </AnimatedAccordion>
                )}
              </div>
            </AccordionSection>

            {/* ── Nome do Arquivo + Nome Limpo ── */}
            <div className="p-3 rounded-xl lf-surface-40 lf-border glass-section space-y-2">
              <div className="flex items-center gap-2">
                <BlockIcon blockId="custom-format" />
                <BlockTitle>{t('fmtFileNameTitle')}</BlockTitle>
              </div>
              <input
                type="text"
                value={options.customFilename || ''}
                onChange={e => {
                  let val = e.target.value;
                  if (useUnderscore) val = val.replace(/ /g, '_');
                  update({ customFilename: val });
                }}
                placeholder={t('fmtFileName')}
                className="w-full px-3 py-2 rounded-lg lf-surface-raised lf-border fs-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white/15 transition-colors font-mono"
              />
              <div className="flex flex-wrap items-center gap-2.5">
                {[
                  { resolved: mediaInfo.title || 'video', label: t('fmtTagTitle') },
                  { resolved: mediaInfo.channel || 'canal', label: t('fmtTagChannel') },
                  { resolved: fmtDate(mediaInfo.publishDate || '', true), label: t('fmtTagDate') },
                  { resolved: fmtDuration(mediaInfo.duration || ''), label: t('fmtTagDuration') },
                ].filter(t => t.resolved).map(t => (
                  <button
                    key={t.label}
                    onClick={() => {
                      const cur = options.customFilename || '';
                      const val = useUnderscore ? t.resolved.replace(/ /g, '_') : t.resolved;
                      const sep = useUnderscore ? '_' : ' ';
                      update({ customFilename: cur ? `${cur}${sep}${val}` : val });
                    }}
                    className="lf-opt px-2 py-1 rounded-md fs-sm transition-all duration-200"
                  >
                    {t.label}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-1 pl-2 border-l lf-border">
                  <Toggle
                    value={useUnderscore}
                    onChange={() => {
                      const next = !useUnderscore;
                      setUseUnderscore(next);
                      if (next && options.customFilename) {
                        update({ customFilename: options.customFilename.replace(/ /g, '_') });
                      }
                    }}
                    settings={settings}
                  />
                  <span className="fs-sm lf-text-faint">{t('fmtNoSpaces')}</span>
                </div>
                <div className="flex items-center gap-1 ml-1 pl-2 border-l lf-border">
                  <label className="fs-sm lf-text-secondary">{t('fmtCleanName')}</label>
                  <Toggle value={!!options.restrictFilenames} onChange={() => update({ restrictFilenames: !options.restrictFilenames })} settings={settings} />
                </div>
              </div>
            </div>
          </AnimatedCard>
        )}

        {activeTab === 'advanced' && (
          <AnimatedCard animateKey="advanced" variant={slideUp} className="space-y-3">

            {/* ── Recorte de tempo ── */}
            <AccordionSection id="trim" title={t('fmtTrim')} blockId="trim" isOpen={openSections.has('trim')} onToggle={() => toggleSection('trim')} accentBg={accentBg}>
              <div className={`px-3 pb-3 pt-2 space-y-2 ${options.audioOnly ? 'opacity-30 pointer-events-none' : ''}`}>
                {mediaInfo.durationSeconds > 0 ? (
                  <TimeRangeSlider
                    durationSeconds={mediaInfo.durationSeconds}
                    startSeconds={trimStart}
                    endSeconds={trimEnd}
                    accentBg={accentBg}
                    onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
                  />
                ) : (
                  <>
                    <p className="fs-sm lf-text-faint">{t('fmtTrimHint')}</p>
                    <div className="flex gap-2 items-center">
                      <input
                        ref={trimStartRef}
                        type="text"
                        placeholder={t('fmtTrimStartPh')}
                        onChange={e => {
                          const end = trimEndRef.current?.value.trim() || '';
                          const val = e.target.value.trim();
                          if (val && end) update({ downloadSections: `*${val}-${end}` });
                          else if (val) update({ downloadSections: `*${val}-` });
                          else update({ downloadSections: end ? `*-${end}` : '' });
                        }}
                        className="flex-1 px-3 py-2 rounded-lg lf-surface lf-border fs-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-white/15"
                      />
                      <span className="lf-text-faint text-xs">-</span>
                      <input
                        ref={trimEndRef}
                        type="text"
                        placeholder={t('fmtTrimEndPh')}
                        onChange={e => {
                          const start = trimStartRef.current?.value.trim() || '';
                          const val = e.target.value.trim();
                          if (start && val) update({ downloadSections: `*${start}-${val}` });
                          else if (val) update({ downloadSections: `*-${val}` });
                          else update({ downloadSections: start ? `*${start}-` : '' });
                        }}
                        className="flex-1 px-3 py-2 rounded-lg lf-surface lf-border fs-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-white/15"
                      />
                    </div>
                  </>
                )}
              </div>
            </AccordionSection>

            {/* ── Modo de Saída + FPS (2 colunas) ── */}
            <AccordionSection id="output" title={t('fmtOutputMode')} blockId="output-mode" isOpen={openSections.has('output')} onToggle={() => toggleSection('output')} accentBg={accentBg}>
              <div className="px-3 pb-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BlockIcon blockId="video-format" />
                    <BlockTitle>{t('fmtContent')}</BlockTitle>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <Btn active={!options.videoOnly && !options.audioOnly} onClick={() => update({ videoOnly: false, audioOnly: false })} className="py-2.5">
                      {t('fmtVideoAudio')}
                    </Btn>
                    <Btn active={!!options.videoOnly} onClick={() => {
                      const next = !options.videoOnly;
                      const reset: Partial<FormatOptions> = { videoOnly: next, audioOnly: false };
                      if (next) {
                        reset.audioFormat = 'mp3';
                        reset.audioQuality = '0';
                      }
                      update(reset);
                    }} className="py-2.5">
                      {t('fmtVideoOnly')}
                    </Btn>
                    <Btn active={!!options.audioOnly} onClick={() => {
                      const next = !options.audioOnly;
                      const reset: Partial<FormatOptions> = { audioOnly: next, videoOnly: false };
                      if (next) {
                        reset.embedSubs = false;
                        reset.videoFormat = '';
                        reset.videoCodec = '';
                        reset.fpsMax = 0;
                      }
                      update(reset);
                    }} className="py-2.5">
                      {t('fmtAudioOnlyOpt')}
                    </Btn>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BlockIcon blockId="fps" />
                    <BlockTitle>{t('fmtFpsMax')}</BlockTitle>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[0, 24, 30, 60, 120].map(fps => {
                      const available = isFpsAvailable(fps);
                      const btn = (
                        <Btn key={fps} active={options.fpsMax === fps} disabled={!available} onClick={() => update({ fpsMax: fps })} className="py-2 flex-1">
                          {fps === 0 ? 'Original' : `${fps} FPS`}
                        </Btn>
                      );
                      return available ? btn : (
                        <TooltipWrapper key={fps} tip={selectedTargetHeight ? t('fmtFpsTipMissing', { h: selectedTargetHeight, fps }) : t('fmtFpsUnavailable')}>
                          {btn}
                        </TooltipWrapper>
                      );
                    })}
                  </div>
                  {selectedTargetHeight != null && [24, 30, 60, 120].some(f => !isFpsAvailable(f)) && (
                    <p className="fs-sm lf-text-faint">{t('fmtFpsMissing')}</p>
                  )}
                </div>
              </div>
            </AccordionSection>

            {/* ── SponsorBlock ── */}
            <AccordionSection id="sponsorblock" title="SponsorBlock" blockId="sponsorblock" isOpen={openSections.has('sponsorblock')} onToggle={() => toggleSection('sponsorblock')} accentBg={accentBg}>
              <div className="px-3 pb-3 pt-2 space-y-2">
                <p className="fs-sm lf-text-faint">{t('fmtSponsorblock')}</p>
                <div className="flex gap-2.5">
                  <Btn
                    active={!options.sponsorblockRemove}
                    onClick={() => update({ sponsorblockRemove: '' })}
                    className="py-1.5 px-2.5 fs-sm flex-1"
                  >
                    {t('fmtOff')}
                  </Btn>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {[
                    { id: 'sponsor', label: 'Sponsors' },
                    { id: 'intro', label: 'Intro' },
                    { id: 'outro', label: 'Outro' },
                    { id: 'preview', label: 'Preview' },
                    { id: 'selfpromo', label: 'Self-promo' },
                    { id: 'interaction', label: t('fmtSponsorCatInteraction') },
                    { id: 'music_offtopic', label: t('fmtSponsorCatMusic') },
                    { id: 'filler', label: 'Filler' },
                  ].map(cat => {
                    const current = options.sponsorblockRemove || '';
                    const selected = current === 'all' || current.split(',').includes(cat.id);
                    return (
                      <Btn
                        key={cat.id}
                        active={selected}
                        onClick={() => {
                          if (current === 'all') {
                            update({ sponsorblockRemove: cat.id });
                          } else {
                            const parts = current ? current.split(',') : [];
                            const next = selected ? parts.filter(p => p !== cat.id) : [...parts, cat.id];
                            update({ sponsorblockRemove: next.length > 0 ? next.join(',') : '' });
                          }
                        }}
                        className="py-1.5 px-2.5 fs-sm"
                      >
                        {selected && '✓ '}{cat.label}
                      </Btn>
                    );
                  })}
                </div>
                <div className="flex gap-2.5">
                  <Btn
                    active={options.sponsorblockRemove === 'all'}
                    onClick={() => update({ sponsorblockRemove: 'all' })}
                    className="py-1.5 px-2.5 fs-sm flex-1"
                  >
                    {options.sponsorblockRemove === 'all' && '✓ '}{t('fmtRemoveAll')}
                  </Btn>
                </div>
              </div>
            </AccordionSection>

            {/* ── Metadados + Thumbnail (2 colunas) ── */}
            <AccordionSection id="metadata" title={t('fmtMetaSection')} blockId="metadata" isOpen={openSections.has('metadata')} onToggle={() => toggleSection('metadata')} accentBg={accentBg}>
              <div className="px-3 pb-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ToggleRow value={options.embedMetadata} onChange={() => update({ embedMetadata: !options.embedMetadata })} label={t('fmtMeta')} desc={t('fmtMetaDesc')} icon={<BlockIcon blockId="container" />} />
                <div>
                  <ToggleRow value={!!options.writeThumbnail} onChange={() => update({ writeThumbnail: !options.writeThumbnail })} label={t('fmtThumb')} desc={t('fmtThumbDesc')} icon={<BlockIcon blockId="thumbnail" />} />
                  {options.writeThumbnail && (
                    <div className="mt-2 space-y-1.5">
                      <div className={canEmbedThumbnail(options) ? '' : 'opacity-30 pointer-events-none'}>
                        <SmallToggle value={!!options.embedThumbnail} onChange={() => update({ embedThumbnail: !options.embedThumbnail })} label={t('fmtThumbEmbed')} />
                      </div>
                      {!canEmbedThumbnail(options) && (
                        <p className="fs-sm lf-text-faint">{t('fmtThumbAudio', { fmt: options.audioOnly ? 'wav' : 'webm/flv' })}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </AccordionSection>

            {/* ── Comportamento + Limite de Velocidade (2 colunas) ── */}
            <AccordionSection id="behavior" title={t('fmtBehavior')} blockId="behavior" isOpen={openSections.has('behavior')} onToggle={() => toggleSection('behavior')} accentBg={accentBg}>
              <div className="px-3 pb-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BlockIcon blockId="speed-limit" />
                    <BlockTitle>{t('fmtSpeedLimit')}</BlockTitle>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {[0, 512, 1024, 5120, 10240, 25600, 51200].map(kbps => (
                      <Btn
                        key={kbps}
                        active={options.bandLimit === kbps}
                        onClick={() => update({ bandLimit: kbps })}
                        className="py-2 flex-1 fs-sm min-w-[80px]"
                      >
                      {kbps === 0 ? t('fmtNoLimit') : kbps >= 1024 ? `${kbps / 1024}MB/s` : `${kbps}KB/s`}
                      </Btn>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                <BlockIcon blockId="custom-format" />
                    <BlockTitle>{t('fmtBehavior')}</BlockTitle>
                  </div>
                  <div className="space-y-1.5 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={11} className="text-amber-500/70" />
                      <span className="fs-sm text-amber-500/70 font-medium">{t('fmtAdvancedOpts')}</span>
                    </div>
                    <SmallToggle value={!!options.noOverwrites} onChange={() => update({ noOverwrites: !options.noOverwrites })} label={t('fmtNoOverwrite')} />
                    <div className={options.audioOnly ? '' : 'opacity-30 pointer-events-none'}>
                      <SmallToggle value={!!options.keepVideo} onChange={() => update({ keepVideo: !options.keepVideo })} label={t('fmtKeepVideo')} />
                    </div>
                  </div>
                </div>
              </div>
            </AccordionSection>
          </AnimatedCard>
        )}
      </AnimatedList>
      </LayoutGroup>
    </div>
  );
});
