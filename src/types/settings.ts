export interface AppSettings {
  themeMode: 'light' | 'dark' | 'gray' | 'white';
  accentColor: string; // e.g., 'indigo', 'emerald', 'amber', 'rose', 'violet', 'sky', 'teal', 'fuchsia'
  iconStyle: 'emoji' | 'lucide-mono' | 'lucide-color';
  language: 'pt' | 'en';
  defaultDir: string;
  bandLimit: number; // KB/s, 0 = unlimited
  maxConcurrent: number;
  autoDownload: boolean;
  notifications: boolean;
  updates: boolean;
  colorfulIcons: boolean;
  clipboardEnabled: boolean;
  clipboardMonitoringEnabled: boolean;
  clipboardFirstRunDone: boolean;
}
