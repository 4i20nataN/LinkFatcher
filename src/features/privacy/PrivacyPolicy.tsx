import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../core/i18n';
import { Shield, Database, Lock, Clock, ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
  const { setActiveTab, settings } = useApp();
  const { t } = useTranslation(settings);
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.1';
  const isLight = settings.themeMode === 'light';

  const POLICY_CARDS = [
    {
      icon: Database,
      title: t('privCard1'),
      items: [t('privCard1a'), t('privCard1b'), t('privCard1c')],
    },
    {
      icon: Lock,
      title: t('privCard2'),
      items: [t('privCard2a'), t('privCard2b'), t('privCard2c'), t('privCard2d')],
    },
    {
      icon: Shield,
      title: t('privCard3'),
      items: [t('privCard3a'), t('privCard3b'), t('privCard3c')],
    },
    {
      icon: Clock,
      title: t('privCard4'),
      items: [t('privCard4a'), t('privCard4b'), t('privCard4c')],
    },
  ];

  const USER_RIGHTS = [
    { label: t('privRight1l'), text: t('privRight1t') },
    { label: t('privRight2l'), text: t('privRight2t') },
    { label: t('privRight3l'), text: t('privRight3t') },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 md:px-8 relative">
      {/* Floating header bar */}
      <div className="w-full max-w-[1000px] mb-6">
        <button
          onClick={() => setActiveTab('settings')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
            ${isLight
              ? 'lf-text-secondary lf-border bg-white/40 hover:bg-white/70 hover:border-blue-300 hover:text-blue-600'
              : 'lf-text-secondary lf-border bg-white/[0.02] hover:bg-white/[0.06] hover:border-blue-500/30 hover:text-blue-400'
            }`}
        >
          <ArrowLeft size={14} />
          {t('privBack')}
        </button>
      </div>

      {/* Main container — glassmorphism */}
      <div
        className={`w-full max-w-[1000px] rounded-3xl p-8 md:p-10 relative z-10
          ${isLight
            ? 'bg-white/60 backdrop-blur-xl border border-zinc-200/50 shadow-2xl'
            : 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] shadow-2xl'
          }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between pb-6 mb-7 border-b lf-border flex-wrap gap-5`}>
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
                ${isLight
                  ? 'border border-blue-200/50 text-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.15)] bg-blue-50/50'
                  : 'border border-blue-500/50 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)] bg-white/[0.01]'
                }`}
            >
              <Shield size={22} />
            </div>
            <div>
              <h1 className={`text-xl font-bold tracking-tight ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                Link<span className="text-blue-500">Fetcher</span>
              </h1>
              <p className={`text-[11px] mt-0.5 lf-text-secondary`}>
                {t('privTitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-7">
          {/* Title + intro */}
          <div>
            <h2
              className={`text-2xl font-semibold tracking-tight mb-1.5 bg-gradient-to-br from-current to-zinc-400 bg-clip-text
                ${isLight ? 'text-zinc-800' : 'text-white'}`}
              style={{ WebkitTextFillColor: 'transparent' }}
            >
              {t('privSection')}
            </h2>
            <div
              className={`text-xs border-l-2 pl-3.5 mb-2.5
                ${isLight ? 'text-zinc-500 border-blue-500' : 'lf-text-secondary border-blue-500'}`}
            >
              {t('privUpdated')}
            </div>
            <p className={`text-[15px] leading-relaxed ${isLight ? 'text-zinc-700' : 'text-white/80'}`}>
              {t('privIntroA')}<strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-white font-semibold'}>LinkFetcher</strong>{t('privIntroB')} {t('privIntroC')}
            </p>
          </div>

          {/* Policy cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
            {POLICY_CARDS.map((card) => (
              <div
                key={card.title}
                className={`rounded-2xl p-6 transition-all duration-300 cv-auto
                  ${isLight
                    ? 'bg-white/50 border border-zinc-200/40 hover:border-blue-300/40 hover:shadow-lg'
                    : 'bg-white/[0.02] border border-white/[0.04] hover:border-blue-500/20 hover:shadow-[0_8px_25px_rgba(0,0,0,0.3)]'
                  }`}
              >
                <h3 className={`text-base font-semibold mb-3 flex items-center gap-2.5 ${isLight ? 'text-zinc-800' : 'text-white'}`}>
                  <card.icon size={18} className="text-blue-500 shrink-0" />
                  {card.title}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {card.items.map((item, i) => (
                    <li
                      key={i}
                      className={`text-[13px] leading-relaxed pl-5 relative
                        ${isLight ? 'text-zinc-600' : 'lf-text-secondary'}`}
                    >
                      <span className="absolute left-0 top-0 text-blue-500 font-light">▹</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* User rights card */}
          <div
            className={`rounded-2xl p-6 transition-all duration-300 cv-auto
              ${isLight
                ? 'bg-white/50 border border-zinc-200/40 hover:border-blue-300/40 hover:shadow-lg'
                : 'bg-white/[0.02] border border-white/[0.04] hover:border-blue-500/20 hover:shadow-[0_8px_25px_rgba(0,0,0,0.3)]'
              }`}
          >
            <h3 className={`text-base font-semibold mb-3 flex items-center gap-2.5 ${isLight ? 'text-zinc-800' : 'text-white'}`}>
              <Shield size={18} className="text-blue-500 shrink-0" />
              {t('privRights')}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {USER_RIGHTS.map((right, i) => (
                <li
                  key={i}
                  className={`text-[13px] leading-relaxed pl-5 relative
                    ${isLight ? 'text-zinc-600' : 'text-white/70'}`}
                >
                  <span className="absolute left-0 top-0 text-blue-500 font-light">▹</span>
                  <strong className={isLight ? 'text-zinc-800 font-semibold' : 'text-white font-semibold'}>{right.label}:</strong> {right.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Commitment note */}
          <p
            className={`mt-2.5 text-[13px] border-l-2 pl-4.5
              ${isLight ? 'text-zinc-500 border-blue-500' : 'lf-text-secondary border-blue-500'}`}
          >
            <span className="text-blue-500 font-medium">{t('privCommitTag')}</span> — {t('privCommitText')}
          </p>
        </div>

        {/* Footer */}
        <div
          className={`mt-8 pt-5 border-t flex justify-between items-center flex-wrap gap-3.5 text-xs
            ${isLight ? 'border-zinc-200/50 lf-text-secondary' : 'lf-border lf-text-secondary'}`}
        >
          <div className="flex items-center gap-3.5">
            <span
              className={`px-3.5 py-1 rounded-full text-[11px] font-medium
                ${isLight
                  ? 'bg-blue-50 text-blue-600 border border-blue-100'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                }`}
            >
              {t('privFooterTag')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="lf-text-secondary">v{version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
