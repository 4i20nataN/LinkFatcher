/**
 * AnimatedAccordion — accordion expand/collapse com spring height.
 *
 * Uso:
 *   <AnimatedAccordion isOpen={expanded}>
 *     <div>conteúdo expansível</div>
 *   </AnimatedAccordion>
 */

import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { accordionExpand, transitions, tween } from './variants';

interface AnimatedAccordionProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AnimatedAccordion({ isOpen, children, className }: AnimatedAccordionProps) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <m.div
          variants={accordionExpand}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{
            height: transitions.accordionHeight,
            opacity: transitions.accordionOpacity,
          }}
          className={className}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}
