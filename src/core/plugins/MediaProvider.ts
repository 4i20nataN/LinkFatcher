import { MediaInfo, PlatformId } from '../../types';

export interface MediaProvider {
  id: PlatformId;
  name: string;
  domains: RegExp[];
  
  /**
   * Validates if the given URL belongs to this platform provider.
   */
  canHandle(url: string): boolean;

  /**
   * Analyzes the URL and extracts metadata.
   */
  analyze(url: string): Promise<MediaInfo>;
}
