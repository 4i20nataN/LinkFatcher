import React, { startTransition } from 'react';
import { useSettings, useNavigation, useDownloadCount } from '../context/AppContext';
import { Link2, Search, ArrowDownToLine, Star, Clock, Settings, Menu, X } from 'lucide-react';
import { AnimatedBackdrop } from '../animation/AnimatedBackdrop';
import { TabIndicator } from '../animation/TabIndicator';
import { AnimatedList } from '../animation/AnimatedList';
import { getAccentTextClass, getAccentBgClass, getThemeLogo } from './ThemeWrapper';
import { RENDER_PROFILE } from '../core/perf/renderProfile';
import { useTranslation, TranslationKey } from '../core/i18n';

export const Sidebar: React.FC<{ isOpen: boolean; toggleOpen: () => void }> = React.memo(({ isOpen, toggleOpen }) => {
  const { settings } = useSettings();
  const { activeTab, setActiveTab } = useNavigation();
  // Badge via contador (só muda de verdade) — a Sidebar não re-renderiza
  // a cada tick de progresso do engine.
  const activeBadge = useDownloadCount(['downloading', 'queued']);
  const { t } = useTranslation(settings);

  const menuItems = [
    { id: 'analyze', label: t('analyzeLink'), icon: '🔗', desc: t('analyzeDesc') },
    { id: 'search', label: t('onlineSearch'), icon: '🔍', desc: t('searchDesc') },
    { id: 'manager', label: t('downloads'), icon: '📥', desc: t('downloadsDesc'), badge: activeBadge },
    { id: 'favorites', label: t('favorites'), icon: '⭐', desc: t('favoritesDesc') },
    { id: 'later', label: t('downloadLater'), icon: '⏰', desc: t('laterDesc') },
    { id: 'settings', label: t('settings'), icon: '⚙️', desc: t('settingsDesc') },
    { id: 'privacy', label: t('privacy'), icon: '🛡️', desc: t('privacyDesc') }
  ];

  return (
    <>
      {/* Header bar (narrow viewport) */}
      <header className="lg:hidden min-h-16 border-b lf-border bg-black/40 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between px-4 safe-top">
        <div className="flex items-center gap-2">
          <img
            src={getThemeLogo(settings)}
            alt="LinkFetcher"
            width={36}
            height={36}
            className="w-9 h-9 rounded-xl object-cover shrink-0"
            decoding="async"
          />
          <span className="font-display font-bold text-lg tracking-tight">LinkFetcher</span>
        </div>
        <button 
          onClick={toggleOpen} 
          className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label={isOpen ? (settings.language === 'en' ? 'Close menu' : 'Fechar menu') : (settings.language === 'en' ? 'Open menu' : 'Abrir menu')}
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Backdrop for drawer (narrow viewport) */}
      <AnimatedBackdrop
        visible={isOpen}
        onClick={toggleOpen}
        className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
      />

      {/* Navigation Drawer */}
      <nav 
        className={`
          fixed top-16 bottom-0 left-0 z-40 w-64 glass-sidebar p-4
          lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:glass-sidebar lg:p-6
          transition-transform duration-300 transform
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
      <div className="h-full overflow-y-auto">
        {/* Title branding on desktop */}
        <div className="hidden lg:flex items-center gap-3 mb-10">
          <img
            src={getThemeLogo(settings)}
            alt="LinkFetcher"
            width={44}
            height={44}
            className="w-11 h-11 rounded-2xl object-cover shrink-0"
            decoding="async"
          />
          <div>
            <h1 className="font-display font-extrabold text-xl tracking-tight text-white leading-tight">
              LinkFetcher
            </h1>
            <p className="text-xs lf-text-secondary font-mono tracking-wider uppercase">{t('mediaDownloader')}</p>
          </div>
        </div>

        {/* Sidebar Sections */}
        <div className="space-y-1.5 pb-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  startTransition(() => {
                    setActiveTab(item.id);
                  });
                  if (window.innerWidth < 1024) toggleOpen();
                }}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  w-full relative group flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300
                  ${isActive 
                    ? 'text-white font-semibold' 
                    : 'lf-text-secondary hover:text-white hover:bg-white/5'
                  }
                `}
              >
                {/* Active Highlight Pill */}
                {isActive && (
                  <TabIndicator
                    layoutId="active-sidebar-pill"
                    className={`absolute inset-0 rounded-xl ${getAccentBgClass(settings).split(' ')[0]}`}
                    style={{ opacity: 0.10 }}
                  />
                )}
                
                {/* Active Left Indicator Bar */}
                {isActive && (
                  <TabIndicator
                    layoutId="active-sidebar-bar"
                    className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${getAccentBgClass(settings)}`}
                  />
                )}

                <div className="flex items-center gap-3.5 z-10">
                  <span 
                    className={`
                      text-xl transition-transform duration-300 group-hover:scale-110 
                      ${!isActive ? 'opacity-50 group-hover:opacity-100' : ''}
                      ${!isActive && !settings.colorfulIcons ? 'grayscale group-hover:grayscale-0' : ''}
                    `}
                  >
                    {item.icon}
                  </span>
                  <div>
                    <span className="font-medium text-sm block leading-none">{item.label}</span>
                    <span className="text-[10px] lf-text-muted block mt-1 group-hover:text-zinc-400 font-sans">
                      {item.desc}
                    </span>
                  </div>
                </div>

                {/* Badge for active downloads */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold z-10 ${getAccentBgClass(settings)} text-white ${RENDER_PROFILE === 'efficient' ? '' : 'animate-pulse'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </div>
      </nav>
    </>
  );
});
