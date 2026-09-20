/**
 * AnimatedModal — modal com backdrop + animação de scale.
 *
 * Backdrop e card animam juntos. Card usa spring para efeito "pop".
 *
 * Uso:
 *   <AnimatedModal open={isOpen} onClose={handleClose}>
 *     <div className="p-6">conteúdo do modal</div>
 *   </AnimatedModal>
 */

import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { modalScale, fadeIn, transitions } from './variants';
import { RENDER_PROFILE } from '../core/perf/renderProfile';

interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** classes do card interno */
  cardClassName?: string;
  /** ID do modal para acessibilidade */
  id?: string;
}

export function AnimatedModal({ open, onClose, children, cardClassName, id }: AnimatedModalProps) {
  // Perfil efficient (raster por software): sem scale/y no card — só fade curto.
  // Animar escala+posição de um card grande repinta tudo a cada frame.
  const efficient = RENDER_PROFILE === 'efficient';
  return (
    <AnimatePresence>
      {open && (
        <m.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={tween(efficient ? 0.15 : 0.2)}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
        >
          <m.div
            variants={efficient ? fadeIn : modalScale}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={efficient ? tween(0.15) : transitions.modal}
            className={cardClassName}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

// Re-export tween for convenience
import { tween } from './variants';
