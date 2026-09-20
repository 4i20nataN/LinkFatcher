/**
 * AnimatedList — wrapper AnimatePresence para listas animadas.
 *
 * Encapsula AnimatePresence + m.div para listas com enter/exit.
 * Cada item filho deve ter uma `key` única.
 *
 * Uso:
 *   <AnimatedList>
 *     {items.map(item => (
 *       <AnimatedCard key={item.id} variant={slideUpLight}>
 *         {item.name}
 *       </AnimatedCard>
 *     ))}
 *   </AnimatedList>
 */

import React from 'react';
import { AnimatePresence } from 'motion/react';

interface AnimatedListProps {
  children: React.ReactNode;
  /** Modo do AnimatePresence: "wait" aguarda saída antes de entrada */
  mode?: 'wait' | 'sync' | 'popLayout';
  /** Desabilitar animação inicial (útil para listas já renderizadas) */
  initial?: boolean;
  /** className no wrapper externo */
  className?: string;
}

export function AnimatedList({
  children,
  mode = 'sync',
  initial = true,
  className,
}: AnimatedListProps) {
  return (
    <AnimatePresence mode={mode} initial={initial}>
      {className ? <div className={className}>{children}</div> : children}
    </AnimatePresence>
  );
}
