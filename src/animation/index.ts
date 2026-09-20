/**
 * Barrel export — ponto de entrada único para todo o módulo de animação.
 *
 * Uso:
 *   import { AnimatedCard, AnimatedList, fadeIn, spring } from '@/animation';
 */

export { LazyMotionProvider } from './LazyMotionProvider';
export { AnimatedCard } from './AnimatedCard';
export { AnimatedList } from './AnimatedList';
export { AnimatedModal } from './AnimatedModal';
export { AnimatedToast } from './AnimatedToast';
export { AnimatedToggle } from './AnimatedToggle';
export { AnimatedAccordion } from './AnimatedAccordion';
export { TabIndicator, LayoutGroup } from './TabIndicator';
export { AnimatedButton } from './AnimatedButton';
export { AnimatedBackdrop } from './AnimatedBackdrop';
export { AnimatePresence } from 'motion/react';
export {
  fadeIn,
  slideUp,
  slideUpLight,
  slideUpStrong,
  scaleIn,
  modalScale,
  slideFromBottom,
  slideExitLeft,
  accordionExpand,
  chevronRotate,
  bannerEntry,
  spring,
  tween,
  transitions,
} from './variants';
