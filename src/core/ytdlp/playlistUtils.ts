/**
 * Pure playlist utility functions — zero Node.js dependencies.
 * Safe to import in browser renderer (Vite-compatible).
 */

/**
 * Detect if a URL is a playlist (contains `list=` parameter or known playlist path).
 */
export function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('list')) return true;
    const playlistPatterns = [
      /youtube\.com\/playlist/,
      /youtube\.com\/.*&list=/,
      /soundcloud\.com\/.*\/sets\//,
      /vimeo\.com\/channels\/.*\/sets/,
      /dailymotion\.com\/playlist\//,
    ];
    return playlistPatterns.some(p => p.test(url));
  } catch {
    return false;
  }
}
