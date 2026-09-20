/**
 * AnimatedBackdrop — backdrop fade in/out para overlays.
 *
 * Uso:
 *   <AnimatedBackdrop visible={isOpen} onClick={handleClose} />
 */

import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { fadeIn, tween } from './variants';

interface AnimatedBackdropProps {
  visible: boolean;
  onClick?: () => void;
  className?: string;
}

export function AnimatedBackdrop({ visible, onClick, className }: AnimatedBackdropProps) {
  return (
    <AnimatePresence>
      {visible && (
        <m.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={tween(0.2)}
          onClick={onClick}
          className={className}
        />
      )}
    </AnimatePresence>
  );
}
