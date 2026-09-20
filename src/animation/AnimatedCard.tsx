/**
 * AnimatedCard — card com animação de entrada/saída.
 *
 * Suporta variantes pré-definidas (slideUp, scaleIn, etc.)
 * e personalização via props.
 *
 * Uso:
 *   <AnimatedCard variant="slideUp" className="p-4 rounded-xl">
 *     conteúdo
 *   </AnimatedCard>
 */

import React from 'react';
import { m, type Variants } from 'motion/react';
import { slideUp, transitions } from './variants';

interface AnimatedCardProps extends React.ComponentPropsWithoutRef<'div'> {
  children: React.ReactNode;
  variant?: Variants;
  transition?: React.ComponentProps<typeof m.div>['transition'];
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** Desabilitar animação de saída (manter no DOM) */
  disableExit?: boolean;
  /** Key para forçar re-mount e re-animação */
  animateKey?: string;
}

export function AnimatedCard({
  children,
  variant = slideUp,
  transition = transitions.card,
  className,
  style,
  animateKey,
  ...rest
}: AnimatedCardProps) {
  return (
    <m.div
      key={animateKey}
      variants={variant}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={transition}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </m.div>
  );
}
