/**
 * TabIndicator — indicador animado de aba ativa com layoutId.
 *
 * Usado para pill highlight e underline indicator que se movem
 * entre abas com animação compartilhada.
 *
 * Uso:
 *   {isActive && (
 *     <TabIndicator layoutId="active-sidebar-pill" className="absolute inset-0 bg-indigo-500/10 rounded-xl" />
 *   )}
 */

import React from 'react';
import { m, LayoutGroup } from 'motion/react';
import { transitions } from './variants';
import { RENDER_PROFILE } from '../core/perf/renderProfile';

interface TabIndicatorProps {
  /** ID compartilhado entre instâncias para animação layout.
      Em efficient é omitido: a pill/barra aparece instantânea, sem a
      medição de layout JS por troca de aba (4 usos: Sidebar ×2,
      DownloadManager, FormatSelector). */
  layoutId?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function TabIndicator({ layoutId, className, style }: TabIndicatorProps) {
  return (
    <m.div
      layoutId={RENDER_PROFILE === 'efficient' ? undefined : layoutId}
      className={className}
      style={style}
      transition={transitions.sidebar}
    />
  );
}

/** Wrapper para agrupar indicadores que compartilham layoutId */
export { LayoutGroup };
