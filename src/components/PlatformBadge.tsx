import React from 'react';
import { PlatformId } from '../types';
import {
  Youtube, Tv, Instagram, Facebook, Twitter, MessageSquare,
  Music, Disc, Twitch, Image as ImageIconLucide, Hash, Video, Globe
} from 'lucide-react';

const platformIconMap: Record<PlatformId, React.ComponentType<any>> = {
  youtube: Youtube,
  tiktok: Tv,
  instagram: Instagram,
  facebook: Facebook,
  x: Twitter,
  reddit: MessageSquare,
  soundcloud: Music,
  spotify: Disc,
  twitch: Twitch,
  pinterest: ImageIconLucide,
  threads: Hash,
  vimeo: Video,
  generic: Globe,
};

interface PlatformBadgeProps {
  platformId: PlatformId;
  name: string;
  color: string;
  variant?: 'overlay' | 'inline';
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platformId, name, color, variant = 'inline' }) => {
  const Icon = platformIconMap[platformId];

  if (variant === 'overlay') {
    return (
      <span className={`absolute top-1 left-1 p-1 rounded text-[7px] font-bold ${color} shadow`}>
        {Icon && <Icon size={7} />}
        {' '}{name}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold ${color}`}>
      {Icon && <Icon size={8} />}
      {name}
    </span>
  );
};
