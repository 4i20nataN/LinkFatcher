import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { RENDER_PROFILE } from '../core/perf/renderProfile';

const ACCENT_MAP: Record<string, { primary: string; rgb: string; hover: string; glow: string }> = {
  indigo: { primary: '#6366f1', rgb: '99, 102, 241', hover: '#4f46e5', glow: 'rgba(79,70,229,0.20)' },
  emerald: { primary: '#10b981', rgb: '16, 185, 129', hover: '#059669', glow: 'rgba(5,150,105,0.20)' },
  amber: { primary: '#f59e0b', rgb: '245, 158, 11', hover: '#d97706', glow: 'rgba(217,119,6,0.20)' },
  rose: { primary: '#f43f5e', rgb: '244, 63, 94', hover: '#e11d48', glow: 'rgba(225,29,72,0.20)' },
  violet: { primary: '#8b5cf6', rgb: '139, 92, 246', hover: '#7c3aed', glow: 'rgba(124,58,237,0.20)' },
  sky: { primary: '#0ea5e9', rgb: '14, 165, 233', hover: '#0284c7', glow: 'rgba(2,132,199,0.20)' },
  teal: { primary: '#14b8a6', rgb: '20, 184, 166', hover: '#0d9488', glow: 'rgba(13,148,136,0.20)' },
  fuchsia: { primary: '#d946ef', rgb: '217, 70, 239', hover: '#c084fc', glow: 'rgba(192,132,252,0.20)' },
  orange: { primary: '#f97316', rgb: '249, 115, 22', hover: '#ea580c', glow: 'rgba(234,88,12,0.20)' },
  cyan: { primary: '#06b6d4', rgb: '6, 182, 212', hover: '#0891b2', glow: 'rgba(8,145,178,0.20)' },
  lime: { primary: '#84cc16', rgb: '132, 204, 22', hover: '#65a30d', glow: 'rgba(101,163,13,0.20)' },
  crimson: { primary: '#ef4444', rgb: '239, 68, 68', hover: '#dc2626', glow: 'rgba(220,38,38,0.20)' },
  pink: { primary: '#ec4899', rgb: '236, 72, 153', hover: '#db2777', glow: 'rgba(219,39,119,0.20)' },
  slate: { primary: '#94a3b8', rgb: '148, 163, 184', hover: '#64748b', glow: 'rgba(100,116,139,0.20)' },
};
const DEFAULT_ACCENT = ACCENT_MAP.indigo;

const THEME_CLASSES: Record<string, string> = {
  light: 'text-zinc-900 light',
  dark: 'text-slate-100 dark',
  gray: 'text-slate-200 gray-mode',
  white: 'text-zinc-900 white',
};

const THEME_BACKGROUNDS: Record<string, string> = {
  light: '/background-bege.png',
  dark: '/background-escuro.png',
  gray: '/background-cinza.png',
  white: '/background-branco.png',
};

// Logo por tema (sidebar + telas principais).
const THEME_LOGOS: Record<string, string> = {
  light: '/logo-light.png',
  dark: '/logo-dark.png',
  gray: '/logo-gray.png',
  white: '/logo-white.png',
};

export function getThemeLogo(settings: { themeMode: string }): string {
  return THEME_LOGOS[settings.themeMode] ?? THEME_LOGOS.dark;
}

// Fundo chapado do perfil efficient: bitmap fullscreen de ~1MB repintado a
// cada frame de scroll no raster por software. Cor sólida + glow estático
// (abaixo) preservam a identidade com custo de paint mínimo.
const EFFICIENT_FLAT_BG: Record<string, string> = {
  light: '#f4f0e6',
  dark: '#0a0c12',
  gray: '#15161c',
  white: '#f7f9fc',
};

export const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useApp();

  const themeClass = THEME_CLASSES[settings.themeMode] ?? THEME_CLASSES.dark;

  const backgroundImage = THEME_BACKGROUNDS[settings.themeMode] ?? THEME_BACKGROUNDS.dark;

  const accentVars = ACCENT_MAP[settings.accentColor] ?? DEFAULT_ACCENT;

  const style = useMemo(() => ({
    '--color-primary': accentVars.primary,
    '--color-primary-rgb': accentVars.rgb,
    '--color-primary-hover': accentVars.hover,
    '--color-primary-glow': accentVars.glow,
  } as React.CSSProperties), [accentVars.primary, accentVars.rgb, accentVars.hover, accentVars.glow]);

  return (
    <div
      className={`h-screen transition-colors duration-300 select-none ${themeClass} ${RENDER_PROFILE === 'efficient' ? 'efficient' : ''} relative overflow-hidden`}
      style={style}
    >
      {RENDER_PROFILE === 'efficient' ? (
        /* Perfil efficient: cor chapada, zero bitmap */
        <div
          className="absolute inset-0 z-[0] pointer-events-none"
          style={{ backgroundColor: EFFICIENT_FLAT_BG[settings.themeMode] ?? EFFICIENT_FLAT_BG.dark }}
        />
      ) : (
        /* Background estático de altíssima performance — zero consumo de CPU/GPU */
        <div
          className="absolute inset-0 z-[0] pointer-events-none bg-cover bg-center bg-no-repeat transition-all duration-500"
          style={{
            backgroundImage: `url("${backgroundImage}")`,
          }}
        />
      )}

      {/* Ambient glow — colored radials behind glass elements (reference: bg-glow-container).
          Efficient profile: same gradients, static (no blur filter, no bgmove
          animation). A full-screen blur(120px) repainted every frame pins a CPU
          core on software-rendered webviews; static is visually identical at rest. */}
      {(settings.themeMode !== 'light' && settings.themeMode !== 'white') && (
        <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
          <div
            style={{
              position: 'absolute',
              inset: '-20%',
              background: `
                radial-gradient(circle at 15% 25%, rgba(255, 59, 48, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 85% 25%, rgba(48, 209, 88, 0.06) 0%, transparent 50%),
                radial-gradient(circle at 50% 85%, rgba(148, 163, 184, 0.08) 0%, transparent 60%)
              `,
              ...(RENDER_PROFILE === 'efficient'
                ? {}
                : {
                    filter: 'blur(120px)',
                    animation: 'bgmove 35s ease-in-out infinite alternate',
                  }),
            }}
          />
        </div>
      )}

      {/* Content wrapper */}
      <div className="relative h-full z-[2]">
        {children}
      </div>
    </div>
  );
};

// Global Helper to return background class for active accent
export function getAccentBgClass(settings: { accentColor: string }) {
  switch (settings.accentColor) {
    case 'emerald': return 'bg-emerald-500 hover:bg-emerald-600';
    case 'amber': return 'bg-amber-500 hover:bg-amber-600';
    case 'rose': return 'bg-rose-500 hover:bg-rose-600';
    case 'violet': return 'bg-violet-500 hover:bg-violet-600';
    case 'sky': return 'bg-sky-500 hover:bg-sky-600';
    case 'teal': return 'bg-teal-500 hover:bg-teal-600';
    case 'fuchsia': return 'bg-fuchsia-500 hover:bg-fuchsia-600';
    case 'orange': return 'bg-orange-500 hover:bg-orange-600';
    case 'cyan': return 'bg-cyan-500 hover:bg-cyan-600';
    case 'lime': return 'bg-lime-500 hover:bg-lime-600';
    case 'crimson': return 'bg-red-500 hover:bg-red-600';
    case 'pink': return 'bg-pink-500 hover:bg-pink-600';
    case 'slate': return 'bg-slate-400 hover:bg-slate-500';
    case 'indigo':
    default:
      return 'bg-indigo-500 hover:bg-indigo-600';
  }
}

// Global Helper to return text class for active accent
export function getAccentTextClass(settings: { accentColor: string }) {
  switch (settings.accentColor) {
    case 'emerald': return 'text-emerald-500';
    case 'amber': return 'text-amber-500';
    case 'rose': return 'text-rose-500';
    case 'violet': return 'text-violet-500';
    case 'sky': return 'text-sky-500';
    case 'teal': return 'text-teal-500';
    case 'fuchsia': return 'text-fuchsia-500';
    case 'orange': return 'text-orange-500';
    case 'cyan': return 'text-cyan-500';
    case 'lime': return 'text-lime-500';
    case 'crimson': return 'text-red-500';
    case 'pink': return 'text-pink-500';
    case 'slate': return 'text-slate-400';
    case 'indigo':
    default:
      return 'text-indigo-500';
  }
}

// Global Helper to return border class for active accent
export function getAccentBorderClass(settings: { accentColor: string }) {
  switch (settings.accentColor) {
    case 'emerald': return 'border-emerald-500';
    case 'amber': return 'border-amber-500';
    case 'rose': return 'border-rose-500';
    case 'violet': return 'border-violet-500';
    case 'sky': return 'border-sky-500';
    case 'teal': return 'border-teal-500';
    case 'fuchsia': return 'border-fuchsia-500';
    case 'orange': return 'border-orange-500';
    case 'cyan': return 'border-cyan-500';
    case 'lime': return 'border-lime-500';
    case 'crimson': return 'border-red-500';
    case 'pink': return 'border-pink-500';
    case 'slate': return 'border-slate-400';
    case 'indigo':
    default:
      return 'border-indigo-500';
  }
}

// Global Helper to return ring class for active accent
export function getAccentRingClass(settings: { accentColor: string }) {
  switch (settings.accentColor) {
    case 'emerald': return 'focus:ring-emerald-500/30';
    case 'amber': return 'focus:ring-amber-500/30';
    case 'rose': return 'focus:ring-rose-500/30';
    case 'violet': return 'focus:ring-violet-500/30';
    case 'sky': return 'focus:ring-sky-500/30';
    case 'teal': return 'focus:ring-teal-500/30';
    case 'fuchsia': return 'focus:ring-fuchsia-500/30';
    case 'orange': return 'focus:ring-orange-500/30';
    case 'cyan': return 'focus:ring-cyan-500/30';
    case 'lime': return 'focus:ring-lime-500/30';
    case 'crimson': return 'focus:ring-red-500/30';
    case 'pink': return 'focus:ring-pink-500/30';
    case 'slate': return 'focus:ring-slate-400/30';
    case 'indigo':
    default:
      return 'focus:ring-indigo-500/30';
  }
}

// Global Helper to return text color class for active accent background (white or dark)
export function getAccentTextOnBgClass(settings: { accentColor: string }) {
  // Colors where 500 shade is too light for white text
  const darkTextColors = ['amber', 'lime', 'slate'];
  return darkTextColors.includes(settings.accentColor) ? 'text-zinc-900' : 'text-white';
}
