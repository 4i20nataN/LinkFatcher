/**
 * AnimatedButton — botão com feedback whileTap.
 *
 * Uso:
 *   <AnimatedButton onTap={() => handleDownload()} className="px-4 py-2 bg-indigo-600">
 *     Baixar
 *   </AnimatedButton>
 */

import React from 'react';
import { m } from 'motion/react';

interface AnimatedButtonProps {
  children: React.ReactNode;
  /** Escala no toque (padrão: 0.97) */
  tapScale?: number;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
}

export function AnimatedButton({ children, tapScale = 0.97, className, ...rest }: AnimatedButtonProps) {
  return (
    <m.button
      whileTap={{ scale: tapScale }}
      className={className}
      {...rest}
    >
      {children}
    </m.button>
  );
}
