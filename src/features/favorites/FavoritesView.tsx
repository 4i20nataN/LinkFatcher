import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FavoriteItem } from '../../types';
import { Star, Link2, ExternalLink, ArrowRight, Trash2, Edit2, Check, FileText, Download } from 'lucide-react';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { scaleIn } from '../../animation/variants';
import { useTranslation } from '../../core/i18n';
import { 
  getAccentBgClass, getAccentTextClass, getAccentBorderClass, getAccentRingClass 
} from '../../components/ThemeWrapper';
import { ProviderRegistry } from '../../core/plugins/Providers';
import { PlatformBadge } from '../../components/PlatformBadge';

export const FavoritesView: React.FC = () => {
  const { settings, favorites, toggleFavorite, updateFavoriteNotes, setSelectedUrl, setActiveTab } = useApp();
  const { t } = useTranslation(settings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const handleStartEditing = (fav: FavoriteItem) => {
    setEditingId(fav.id);
    setEditNotes(fav.notes || '');
  };

  const handleSaveNotes = (id: string) => {
    updateFavoriteNotes(id, editNotes);
    setEditingId(null);
  };

  const handleAnalyze = (url: string) => {
    setSelectedUrl(url);
    setActiveTab('analyze');
  };

  const handleExportFavorites = () => {
    try {
      const dataStr = JSON.stringify(favorites, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `favorites-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {
      console.error('Failed to export favorites');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 md:py-6 px-4">
      {/* Title Header with Export Button */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b lf-border pb-4">
        <div className="text-center md:text-left space-y-1">
          <h2 className="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight">
            {t('favoritesTitle')}
          </h2>
          <p className="lf-text-secondary text-sm md:text-base">
            {t('favoritesSubtitle')}
          </p>
        </div>
        
        {favorites.length > 0 && (
          <button
            onClick={handleExportFavorites}
            className={`
              w-full md:w-auto px-4 py-2.5 rounded-xl text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md
              ${getAccentBgClass(settings)} hover:scale-[1.02] active:scale-[0.98]
            `}
          >
            <Download size={14} />
            {settings.language === 'en' ? 'Backup Favorites' : 'Exportar Favoritos'}
          </button>
        )}
      </div>

      {favorites.length === 0 ? (
        /* Empty State */
        <div className="p-16 text-center rounded-3xl glass-card border-dashed flex flex-col items-center justify-center space-y-4">
          <div className="p-4 rounded-2xl lf-surface-raised lf-text-muted">
            {settings.iconStyle === 'emoji' ? <span className="text-3xl">⭐</span> : <Star size={32} className={getAccentTextClass(settings)} />}
          </div>
          <div>
            <h4 className="font-semibold text-sm lf-text-secondary">{t('noFavorites')}</h4>
            <p className="text-xs lf-text-muted mt-1 max-w-sm mx-auto">
              {t('noFavoritesDesc')}
            </p>
          </div>
        </div>
      ) : (
        /* Favorites Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatedList initial={false}>
            {favorites.map((fav) => {
              const platform = ProviderRegistry.getPlatformConfig(fav.platform);
              const isEditing = editingId === fav.id;

              return (
                <AnimatedCard
                  animateKey={fav.id}
                  variant={scaleIn}
                  className="p-4 rounded-2xl glass-card flex flex-col justify-between space-y-4 group hover:bg-white/10 transition-colors"
                >
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border lf-border lf-surface shrink-0">
                      <img
                        src={fav.thumbnailUrl}
                        alt={fav.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                      />
                      {platform && (
                        <PlatformBadge platformId={fav.platform} name={platform.name} color={platform.color} variant="overlay" />
                      )}
                    </div>

                    {/* Metadata details */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-[9px] font-semibold lf-text-muted block font-mono uppercase tracking-wider">
                        {t('dateAdded')} {new Date(fav.dateAdded).toLocaleDateString()}
                      </span>
                      <h4 className="font-semibold text-xs text-white leading-snug line-clamp-2">
                        {fav.title}
                      </h4>
                      <p className="text-[10px] lf-text-secondary block truncate font-mono">
                        {fav.url}
                      </p>
                    </div>
                  </div>

                  {/* Notes Segment */}
                  <div className="p-3 rounded-lg bg-white/5 border lf-border">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-bold lf-text-muted font-mono uppercase flex items-center gap-1">
                        {settings.iconStyle === 'emoji' ? <span>📄</span> : <FileText size={10} className={getAccentTextClass(settings)} />} {settings.language === 'en' ? 'Notes / Annotations' : 'Observações / Anotações'}
                      </span>
                      {!isEditing && (
                        <button
                          onClick={() => handleStartEditing(fav)}
                          className="p-1 rounded lf-text-muted hover:text-white hover:bg-white/5 transition-colors"
                          title={settings.language === 'en' ? 'Edit notes' : 'Editar anotação'}
                        >
                          {settings.iconStyle === 'emoji' ? <span>✏️</span> : <Edit2 size={10} className={getAccentTextClass(settings)} />}
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex gap-1.5 mt-1.5">
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder={t('notesPlaceholder')}
                          className={`
                            flex-1 px-2.5 py-1.5 rounded lf-surface border border-zinc-800 text-[11px] text-white placeholder-zinc-600
                            focus:outline-none focus:ring-1 ${getAccentRingClass(settings)}
                          `}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveNotes(fav.id)}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveNotes(fav.id)}
                          className={`p-2 rounded ${getAccentBgClass(settings)} text-white shadow-md`}
                          title={settings.language === 'en' ? 'Save' : 'Salvar'}
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] lf-text-secondary italic min-h-[16px] leading-relaxed">
                        {fav.notes || (settings.language === 'en' ? 'No notes registered.' : 'Nenhuma nota registrada.')}
                      </p>
                    )}
                  </div>

                  {/* Card bottom footer actions */}
                  <div className="pt-2 border-t lf-border flex justify-between items-center text-xs">
                    <button
                      onClick={() => toggleFavorite({ id: fav.id, title: fav.title, url: fav.url, platform: fav.platform, thumbnailUrl: fav.thumbnailUrl })}
                      className="lf-text-muted hover:text-rose-400 flex items-center gap-1.5 font-semibold transition-colors"
                    >
                      {settings.iconStyle === 'emoji' ? <span>🗑️</span> : <Trash2 size={13} className={getAccentTextClass(settings)} />} {settings.language === 'en' ? 'Delete' : 'Excluir'}
                    </button>

                    <div className="flex items-center gap-2">
                      <a
                        href={fav.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 lf-surface-raised lf-text-secondary hover:text-white transition-colors"
                        title={settings.language === 'en' ? 'View original' : 'Ver original'}
                      >
                        {settings.iconStyle === 'emoji' ? <span>🔗</span> : <ExternalLink size={13} className={getAccentTextClass(settings)} />}
                      </a>
                      
                      <button
                        onClick={() => handleAnalyze(fav.url)}
                        className={`
                          px-3.5 py-1.5 rounded-lg text-white font-bold text-xs flex items-center gap-1 transition-all
                          ${getAccentBgClass(settings)}
                        `}
                      >
                        {settings.language === 'en' ? 'Analyze' : 'Analisar'} <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </AnimatedCard>
              );
            })}
          </AnimatedList>
        </div>
      )}
    </div>
  );
};
