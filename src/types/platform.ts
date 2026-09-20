export type PlatformId = 
  | 'youtube' 
  | 'tiktok' 
  | 'instagram' 
  | 'facebook' 
  | 'x' 
  | 'reddit' 
  | 'soundcloud' 
  | 'spotify' 
  | 'twitch' 
  | 'pinterest' 
  | 'threads' 
  | 'vimeo'
  | 'generic';

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  icon: string;
  color: string;
  domains: string[];
}
