export interface SearchOptions {
  query: string;
  platform: 'youtube' | 'vimeo' | 'dailymotion' | 'bilibili' | 'soundcloud';
  maxResults?: number;
  proxy?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number;          // seconds
  duration_string: string;   // "12:45"
  view_count: number;
  uploader: string;
  description: string;
}
