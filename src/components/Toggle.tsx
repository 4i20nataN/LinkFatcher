import React from 'react';
import { AnimatedToggle } from '../animation/AnimatedToggle';
import { getAccentBgClass } from './ThemeWrapper';

interface ToggleProps {
  value: boolean;
  onChange: () => void;
  settings: { accentColor: string; themeMode?: string };
}

export const Toggle: React.FC<ToggleProps> = ({ value, onChange, settings }) => {
  // Em temas claros a bolinha branca some no trilho claro — usa cinza quando OFF
  const isLightTheme = settings.themeMode === 'light' || settings.themeMode === 'white';
  const knobColor = value || !isLightTheme ? 'bg-white' : 'bg-zinc-400';
  return (
  <button
    onClick={onChange}
    className={`relative w-[36px] h-[20px] rounded-full border-2 transition-colors duration-300 shrink-0 ${
      value ? getAccentBgClass(settings) : 'lf-surface-40'
    }`}
    style={{ borderColor: value ? 'transparent' : 'var(--color-primary)' }}
  >
    <AnimatedToggle
      active={value}
      className={`absolute top-[1px] left-[2px] w-[14px] h-[14px] rounded-full shadow-sm ${knobColor}`}
    />
  </button>
  );
};
