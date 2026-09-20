import React from 'react';
import { useApp } from '../context/AppContext';
import {
  MonitorPlay, FileVideo, Music, Volume2, SlidersHorizontal,
  Subtitles, Pencil, Scissors, ArrowDownToLine, Gauge,
  Shield, Tag, Image, Settings, Zap, RefreshCw, Rocket,
  Package, Binary,
} from 'lucide-react';

export type BlockId =
  | 'resolution' | 'video-format' | 'audio-extract' | 'audio-format'
  | 'audio-quality' | 'subtitles' | 'custom-format' | 'trim'
  | 'output-mode' | 'fps' | 'sponsorblock' | 'metadata'
  | 'thumbnail' | 'behavior' | 'fragments' | 'retries' | 'speed-limit'
  | 'container' | 'codec';

const EMOJI_MAP: Record<BlockId, string> = {
  resolution: '🎬',
  'video-format': '📼',
  'audio-extract': '🎵',
  'audio-format': '🔊',
  'audio-quality': '🎚️',
  subtitles: '📝',
  'custom-format': '✏️',
  trim: '✂️',
  'output-mode': '📤',
  fps: '⏱️',
  sponsorblock: '🛡️',
  metadata: '🏷️',
  thumbnail: '🖼️',
  behavior: '⚙️',
  fragments: '⚡',
  retries: '🔄',
  'speed-limit': '🚀',
  container: '📦',
  codec: '🔧',
};

const LUCIDE_MAP: Record<BlockId, React.ComponentType<{ size?: number; className?: string }>> = {
  resolution: MonitorPlay,
  'video-format': FileVideo,
  'audio-extract': Music,
  'audio-format': Volume2,
  'audio-quality': SlidersHorizontal,
  subtitles: Subtitles,
  'custom-format': Pencil,
  trim: Scissors,
  'output-mode': ArrowDownToLine,
  fps: Gauge,
  sponsorblock: Shield,
  metadata: Tag,
  thumbnail: Image,
  behavior: Settings,
  fragments: Zap,
  retries: RefreshCw,
  'speed-limit': Rocket,
  container: Package,
  codec: Binary,
};

const COLOR_MAP: Record<BlockId, string> = {
  resolution: 'text-sky-400',
  'video-format': 'text-emerald-400',
  'audio-extract': 'text-pink-400',
  'audio-format': 'text-rose-400',
  'audio-quality': 'text-fuchsia-400',
  subtitles: 'text-zinc-200',
  'custom-format': 'text-amber-400',
  trim: 'text-orange-400',
  'output-mode': 'text-emerald-400',
  fps: 'text-teal-400',
  sponsorblock: 'text-purple-400',
  metadata: 'text-yellow-400',
  thumbnail: 'text-cyan-400',
  behavior: 'text-zinc-300',
  fragments: 'text-yellow-400',
  retries: 'text-red-400',
  'speed-limit': 'text-green-400',
  container: 'text-indigo-400',
  codec: 'text-sky-500',
};

export const BlockIcon: React.FC<{ blockId: BlockId; size?: number }> = ({ blockId, size = 14 }) => {
  const { settings } = useApp();
  const style = settings.iconStyle || 'lucide-mono';

  if (style === 'emoji') {
    return <span className="fs-sm leading-none">{EMOJI_MAP[blockId]}</span>;
  }

  const Icon = LUCIDE_MAP[blockId];
  if (style === 'lucide-color') {
    return <Icon size={size} className={COLOR_MAP[blockId]} />;
  }
  return <Icon size={size} className="lf-text-secondary" />;
};

export const BlockTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="fs-sm font-bold lf-text-secondary tracking-wide">{children}</label>
);
