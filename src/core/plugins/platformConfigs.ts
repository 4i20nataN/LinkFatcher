import type { PlatformId } from '../../types';

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  icon: string;
  color: string;
  patterns: RegExp[];
}

export const PLATFORM_REGISTRY: PlatformConfig[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'Youtube',
    color: 'bg-red-600 text-white',
    patterns: [/youtube\.com/i, /youtu\.be/i],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'Tv',
    color: 'bg-neutral-900 text-white border border-neutral-700',
    patterns: [/tiktok\.com/i],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'Instagram',
    color: 'bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 text-white',
    patterns: [/instagram\.com/i],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'Facebook',
    color: 'bg-blue-600 text-white',
    patterns: [/facebook\.com/i, /fb\.watch/i, /fb\.com/i],
  },
  {
    id: 'x',
    name: 'X / Twitter',
    icon: 'Twitter',
    color: 'bg-black text-white border border-neutral-800',
    patterns: [/x\.com/i, /twitter\.com/i],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: 'MessageSquare',
    color: 'bg-orange-600 text-white',
    patterns: [/reddit\.com/i],
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: 'Music',
    color: 'bg-orange-500 text-white',
    patterns: [/soundcloud\.com/i],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'Disc',
    color: 'bg-emerald-500 text-black',
    patterns: [/spotify\.com/i],
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: 'Twitch',
    color: 'bg-purple-600 text-white',
    patterns: [/twitch\.tv/i],
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    icon: 'Image',
    color: 'bg-red-700 text-white',
    patterns: [/pinterest\.com/i, /pin\.it/i],
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: 'Hash',
    color: 'bg-zinc-900 text-white',
    patterns: [/threads\.net/i],
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    icon: 'Video',
    color: 'bg-sky-500 text-white',
    patterns: [/vimeo\.com/i],
  },
  {
    id: 'generic',
    name: 'Web Link / File',
    icon: 'Globe',
    color: 'bg-zinc-600 text-white',
    patterns: [/.*/],
  },
];

export function getPlatformConfig(id: PlatformId): PlatformConfig {
  return PLATFORM_REGISTRY.find(p => p.id === id) || PLATFORM_REGISTRY.find(p => p.id === 'generic')!;
}

export function matchPlatformForUrl(url: string): PlatformConfig | null {
  return PLATFORM_REGISTRY.find(p => p.patterns.some(rx => rx.test(url))) || null;
}
