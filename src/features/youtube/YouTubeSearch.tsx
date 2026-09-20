import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { SearchResult } from '../../types';
import { Search, Globe, Play, ArrowRight, Eye, AlertCircle } from 'lucide-react';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { scaleIn } from '../../animation/variants';
import { useTranslation } from '../../core/i18n';
import { 
  getAccentBgClass, getAccentTextClass, getAccentRingClass
} from '../../components/ThemeWrapper';
import { searchVideosWithAdapter, adapterErrorMessage } from '../../core/ytdlp/YtDlpAdapter';

const CACHE_MAX = 20;
const searchCache = new Map<string, SearchResult[]>();

function cacheGet(key: string): SearchResult[] | undefined {
  const val = searchCache.get(key);
  if (val !== undefined) {
    searchCache.delete(key);
    searchCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, value: SearchResult[]) {
  if (searchCache.size >= CACHE_MAX) {
    const firstKey = searchCache.keys().next().value!;
    searchCache.delete(firstKey);
  }
  searchCache.set(key, value);
}

const SearchResultCard = React.memo<{
  video: SearchResult;
  onSelect: (url: string) => void;
  accentText: string;
  label: string;
}>(({ video, onSelect, accentText, label }) => (
  <AnimatedCard
    animateKey={video.url}
    variant={scaleIn}
    onClick={() => onSelect(video.url)}
    className="group rounded-2xl glass-card p-3 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:bg-white/10"
  >
    <div>
      <div className="relative aspect-video rounded-xl overflow-hidden border lf-border lf-surface shrink-0">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white">
            <Play size={16} fill="currentColor" />
          </div>
        </div>
        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-[10px] font-mono lf-text-secondary">
          {video.duration_string}
        </span>
      </div>
      <h4 className="font-display font-semibold text-sm text-white mt-3 line-clamp-2 leading-snug group-hover:text-zinc-200 transition-colors">
        {video.title}
      </h4>
      <p className="text-xs lf-text-secondary font-medium mt-1">
        {video.uploader}
      </p>
    </div>
    <div className="flex items-center justify-between mt-4 pt-3 border-t lf-border text-[10px] lf-text-muted font-medium">
      <div className="flex gap-3">
        <span className="flex items-center gap-1">
          <Eye size={12} />
          {video.view_count.toLocaleString()}
        </span>
      </div>
      <span className={`text-xs font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${accentText}`}>
        {label} <ArrowRight size={12} />
      </span>
    </div>
  </AnimatedCard>
));
SearchResultCard.displayName = 'SearchResultCard';

export const YouTubeSearch: React.FC = () => {
  const { settings, setSelectedUrl, setActiveTab } = useApp();
  const { t } = useTranslation(settings);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSelectVideo = useCallback((videoUrl: string) => {
    setSelectedUrl(videoUrl);
    setActiveTab('analyze');
  }, [setSelectedUrl, setActiveTab]);

  const accentText = useMemo(() => getAccentTextClass(settings), [settings]);
  const analyzeLabel = useMemo(() => settings.language === 'en' ? 'Analyze' : 'Analisar', [settings.language]);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const cacheKey = query.trim().toLowerCase();
    const cached = cacheGet(cacheKey);
    if (cached) {
      setResults(cached);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const data: SearchResult[] = await searchVideosWithAdapter({
        query: query.trim(),
        platform: 'youtube',
        maxResults: 10
      });
      if (!controller.signal.aborted) {
        setResults(data);
        cacheSet(cacheKey, data);
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(adapterErrorMessage(err, 'Search failed'));
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, [query]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 md:py-6 px-4">
      {/* Title Header */}
      <div className="text-center md:text-left space-y-2">
        <div className="flex items-center gap-2 justify-center md:justify-start">
          <Globe size={28} className={getAccentTextClass(settings)} />
          <h2 className="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight">
            {t('onlineSearch')}
          </h2>
        </div>
        <p className="lf-text-secondary text-sm md:text-base">
          {t('searchSubtitle')}
        </p>
      </div>

      {/* Search Input bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 lf-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={`
              w-full pl-11 pr-4 py-3.5 rounded-xl glass-input text-sm text-white placeholder-zinc-500
              focus:border-transparent focus:outline-none focus:ring-2 ${getAccentRingClass(settings)} transition-all
            `}
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className={`
            px-6 py-3.5 rounded-xl text-white font-semibold text-sm transition-all shadow-lg flex items-center gap-2 shrink-0
            ${getAccentBgClass(settings)} hover:scale-[1.02] active:scale-[0.98]
          `}
        >
          {searching ? '...' : t('btnSearch')}
        </button>
      </form>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Results View */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs lf-text-muted font-medium">
          <span>
            {query 
              ? (settings.language === 'en' ? `Results for "${query}"` : `Resultados para "${query}"`) 
              : (settings.language === 'en' ? 'Featured Media' : 'Mídias em Destaque')}
          </span>
          <span>{results.length} {settings.language === 'en' ? 'results' : 'resultados'}</span>
        </div>

        {searching ? (
          /* Loading states */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl glass-card p-3 animate-pulse space-y-4">
                <div className="aspect-video bg-zinc-800/50 rounded-xl" />
                <div className="space-y-2">
                  <div className="h-4 bg-zinc-800/50 rounded-full w-3/4" />
                  <div className="h-3 bg-zinc-800/50 rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Search results Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AnimatedList>
              {results.map((video) => (
                <SearchResultCard
                  key={video.id}
                  video={video}
                  onSelect={handleSelectVideo}
                  accentText={accentText}
                  label={analyzeLabel}
                />
              ))}
            </AnimatedList>
          </div>
        )}
      </div>
    </div>
  );
};
