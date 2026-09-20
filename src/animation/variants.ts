/**
 * Animation presets centralizados.
 *
 * Todos os componentes animados do app consomem variantes daqui.
 * Para alterar timing/easing de um padrão, mude UM arquivo.
 *
 * Referência motion/react v12:
 *   - Variants aceitam { hidden, visible, exit }
 *   - Transition pode ser number | Spring | Tween | PerProperty
 */

import type { Variants, Transition } from 'motion/react';

// ── Transições reutilizáveis ────────────────────────────────────────────────

export const spring = (stiffness = 400, damping = 30): Transition => ({
  type: 'spring' as const,
  stiffness,
  damping,
});

export const tween = (duration = 0.25, ease: Transition['ease'] = 'easeInOut'): Transition => ({
  type: 'tween' as const,
  duration,
  ease,
});

// ── Variantes de enter/exit ─────────────────────────────────────────────────

/** Fade simples (opacidade 0→1) */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Fade + slide up (y: 15→0) — cards, banners */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -15 },
};

/** Fade + slide up leve (y: 10→0) — list items */
export const slideUpLight: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/** Fade + slide up forte (y: 20→0) — content cards */
export const slideUpStrong: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

/** Fade + scale (0.95→1) — toasts, popups */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/** Fade + scale forte (0.9→1) — modais */
export const modalScale: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9, y: 20 },
};

/** Slide from bottom (y: 80→0) — clipboard popup */
export const slideFromBottom: Variants = {
  hidden: { y: 80, opacity: 0, scale: 0.95 },
  visible: { y: 0, opacity: 1, scale: 1 },
  exit: { y: 80, opacity: 0, scale: 0.95 },
};

/** Slide from left (x: -15→0) — download item exit */
export const slideExitLeft: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -15 },
};

/** Accordion expand/collapse (height: 0→auto) */
export const accordionExpand: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto' as const, opacity: 1 },
  exit: { height: 0, opacity: 0 },
};

/** Chevron rotation (0→180deg) */
export const chevronRotate = (isOpen: boolean): { rotate: number } => ({
  rotate: isOpen ? 180 : 0,
});

/** Update banner entry (y: -12→0, subtle scale) */
export const bannerEntry: Variants = {
  hidden: { opacity: 0, y: -12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.98 },
};

// ── Transições específicas por componente ───────────────────────────────────

export const transitions = {
  /** Spring padrão para cards/modais */
  card: spring(400, 30),
  /** Spring para sidebar pill */
  sidebar: spring(350, 30),
  /** Spring rápido para tooltips */
  tooltip: spring(450, 25),
  /** Spring suave para modais */
  modal: spring(300, 25),
  /** Tween para page transitions */
  page: tween(0.25, 'easeInOut'),
  /** Tween para indicadores de aba */
  tab: tween(0.2),
  /** Tween para accordion opacity */
  accordionOpacity: tween(0.2),
  /** Spring para accordion height */
  accordionHeight: spring(400, 30),
  /** Tween para shimmer */
  shimmer: { duration: 1.5, repeat: Infinity, ease: 'linear' as const },
  /** Spring para toggle */
  toggle: spring(500, 30),
  /** Bezier custom para accordion chevron */
  chevron: tween(0.3, [0.25, 0.1, 0.25, 1]),
  /** Bezier premium para update banner */
  banner: tween(0.3, [0.23, 1, 0.32, 1]),
} as const;
