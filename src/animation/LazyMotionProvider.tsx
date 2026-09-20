/**
 * LazyMotionProvider — lazy-load do motor de animação motion/react.
 *
 * Reduz o bundle inicial em ~29KB gzip ao carregar apenas domAnimation.
 * Componentes filhos usam `m.div` em vez de `motion.div`.
 *
 * Uso:
 *   <LazyMotionProvider>
 *     <App />
 *   </LazyMotionProvider>
 */

import React, { Suspense } from 'react';
import { LazyMotion } from 'motion/react';

const loadFeatures = () => import('./features').then((m) => m.default);

export function LazyMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
