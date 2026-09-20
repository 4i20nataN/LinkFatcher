import { useState, useCallback } from 'react';
import { AnimatedModal } from '../animation/AnimatedModal';
import { Clipboard, X, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface FirstRunClipboardPromptProps {
  onDismiss: () => void;
}

export function FirstRunClipboardPrompt({ onDismiss }: FirstRunClipboardPromptProps) {
  const { settings, updateSettings } = useApp();
  const [visible, setVisible] = useState(true);

  const isCapable = typeof window !== 'undefined' && !!window.electron;

  const handleEnable = useCallback(() => {
    updateSettings({
      clipboardMonitoringEnabled: true,
      clipboardFirstRunDone: true,
    });
    setVisible(false);
    onDismiss();
  }, [updateSettings, onDismiss]);

  const handleSkip = useCallback(() => {
    updateSettings({ clipboardFirstRunDone: true });
    setVisible(false);
    onDismiss();
  }, [updateSettings, onDismiss]);

  if (!isCapable || settings.clipboardFirstRunDone) return null;

  return (
    <AnimatedModal
      open={visible}
      onClose={handleSkip}
      cardClassName="w-full max-w-[340px] p-6 rounded-3xl bg-[#141821]/95 backdrop-blur-xl border border-white/10 shadow-2xl"
      id="first-run-clipboard"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-indigo-500/20">
            <Clipboard size={20} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {settings.language === 'en' ? 'Smart Clipboard' : 'Área de Transferência Inteligente'}
            </h3>
            <p className="text-[10px] text-white/40">
              {settings.language === 'en' ? 'Optional feature' : 'Recurso opcional'}
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

      <p className="text-xs text-white/70 leading-relaxed mb-4">
        {settings.language === 'en'
          ? 'LinkFetcher can detect when you copy a link and show a quick download popup. This runs only when the app is open.'
          : 'O LinkFetcher pode detectar quando você copia um link e mostrar um popup rápido de download. Isso roda apenas quando o app está aberto.'}
      </p>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 mb-5">
        <ShieldCheck size={14} className="text-emerald-400 mt-0.5 shrink-0" />
        <p className="text-[10px] text-white/50 leading-relaxed">
          {settings.language === 'en'
            ? 'Your clipboard is never sent anywhere. Detection happens locally on your device.'
            : 'Sua área de transferência nunca é enviada para lugar nenhum. A detecção acontece localmente no seu dispositivo.'}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSkip}
          className="flex-1 py-2.5 rounded-xl text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          {settings.language === 'en' ? 'Not now' : 'Agora não'}
        </button>
        <button
          onClick={handleEnable}
          className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors"
        >
          {settings.language === 'en' ? 'Enable' : 'Ativar'}
        </button>
      </div>
    </AnimatedModal>
  );
}
