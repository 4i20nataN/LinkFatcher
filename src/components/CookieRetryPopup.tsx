import { useState, useCallback } from 'react';
import { AnimatedModal } from '../animation/AnimatedModal';
import { AlertTriangle, Globe, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface CookieRetryPopupProps {
  itemId: string;
  error: string;
  onUseCookies: (itemId: string, browser: string) => void;
  onSkip: () => void;
}

const BROWSERS = [
  { id: 'chrome', label: 'Chrome', icon: '🟢' },
  { id: 'edge', label: 'Edge', icon: '🔵' },
  { id: 'firefox', label: 'Firefox', icon: '🟠' },
  { id: 'brave', label: 'Brave', icon: '🦁' },
  { id: 'chromium', label: 'Chromium', icon: '🔷' },
  { id: 'opera', label: 'Opera', icon: '🔴' },
] as const;

export function CookieRetryPopup({ itemId, error, onUseCookies, onSkip }: CookieRetryPopupProps) {
  const { settings } = useApp();
  const [visible, setVisible] = useState(true);
  // Mesma lista das Configurações; padrão = navegador global já escolhido.
  const [selectedBrowser, setSelectedBrowser] = useState<string>(settings.cookiesFromBrowser || 'chrome');

  const handleUseCookies = useCallback(() => {
    setVisible(false);
    onUseCookies(itemId, selectedBrowser);
  }, [itemId, selectedBrowser, onUseCookies]);

  const handleSkip = useCallback(() => {
    setVisible(false);
    onSkip();
  }, [onSkip]);

  const cleanError = error
    .replace(/^yt-dlp exited with code \d+:\s*/, '')
    .replace(/^ERROR:\s*/i, '')
    .substring(0, 200);

  return (
    <AnimatedModal
      open={visible}
      onClose={handleSkip}
      cardClassName="w-full max-w-[360px] p-6 rounded-3xl bg-[#141821]/95 backdrop-blur-xl border border-white/10 shadow-2xl"
      id="cookie-retry"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-500/20">
            <AlertTriangle size={20} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {settings.language === 'en' ? 'Download Blocked' : 'Download Bloqueado'}
            </h3>
            <p className="text-[10px] text-white/40">
              {settings.language === 'en' ? 'Bot detection triggered' : 'Detecção de bot ativada'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSkip}
          className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={14} className="text-white/40" />
        </button>
      </div>

      {cleanError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
          <p className="text-[11px] text-amber-300/80 leading-relaxed break-words">
            {cleanError}
          </p>
        </div>
      )}

      <p className="text-xs text-white/70 leading-relaxed mb-3">
        {settings.language === 'en'
          ? 'Use browser cookies to bypass the restriction. Select your browser:'
          : 'Use cookies do navegador para contornar a restrição. Selecione seu navegador:'}
      </p>

      <div className="flex gap-2 mb-4">
        {BROWSERS.map((browser) => (
          <button
            key={browser.id}
            onClick={() => setSelectedBrowser(browser.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              selectedBrowser === browser.id
                ? 'bg-white/10 border border-white/20 text-white'
                : 'bg-white/5 border border-white/5 text-white/50 hover:text-white/70 hover:bg-white/8'
            }`}
          >
            <span>{browser.icon}</span>
            <span>{browser.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 mb-5">
        <Globe size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[10px] text-white/50 leading-relaxed">
          {settings.language === 'en'
            ? '*Activate permanent browser cookies in the Settings tab*'
            : '*Ative cookies de navegador permanente na aba Configurações*'}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSkip}
          className="flex-1 py-2.5 rounded-xl text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          {settings.language === 'en' ? 'Skip' : 'Pular'}
        </button>
        <button
          onClick={handleUseCookies}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors"
        >
          {settings.language === 'en' ? 'Use Cookies' : 'Usar Cookies'}
        </button>
      </div>
    </AnimatedModal>
  );
}
