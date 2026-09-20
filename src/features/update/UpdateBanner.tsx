import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { AnimatedButton } from '../../animation/AnimatedButton';
import { bannerEntry, scaleIn } from '../../animation/variants';
import { Download, X, CheckCircle, AlertCircle, Loader2, ShieldCheck, Sparkles, RefreshCw, FileText, Clock } from 'lucide-react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../core/i18n';

declare const __APP_VERSION__: string;

type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'dismissed';

interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function UpdateBanner() {
  const { settings } = useApp();
  const { t } = useTranslation(settings);
  const [stage, setStage] = useState<UpdateStage>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showNotes, setShowNotes] = useState(true);

  const tauriUpdateRef = useRef<Update | null>(null);

  // Verificação inicial ao carregar o aplicativo (com delay suave de 2.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (stage === 'downloading' || stage === 'ready') return;
    setStage('checking');
    setErrorMsg('');

    // Tauri Desktop v2 Auto-updater
    try {
      const update = await check();
      if (update) {
        tauriUpdateRef.current = update;
        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.0'),
          body: update.body || undefined,
          date: update.date || undefined,
        });
        setStage('available');
      } else {
        setStage('idle');
      }
    } catch {
      // Em dev local ou sem conexão de rede, não alarma o usuário no startup
      setStage('idle');
    }
  }, [stage]);

  const handleUpdateAndRestart = useCallback(async () => {
    if (!updateInfo) return;
    setStage('downloading');
    setProgress(0);
    setReceivedBytes(0);
    setTotalBytes(0);
    setErrorMsg('');

    // Tauri Desktop
    const update = tauriUpdateRef.current;
    if (!update) {
      setErrorMsg(t('updNoInstance'));
      setStage('error');
      return;
    }

    try {
      let total = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength || 0;
          setTotalBytes(total);
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setReceivedBytes(downloaded);
          if (total > 0) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            setProgress(pct);
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
          setStage('ready');
        }
      });

      setStage('ready');
      // Relaunch imediato ou após 1 segundo para feedback visual limpo
      setTimeout(async () => {
        try {
          await relaunch();
        } catch {
          // Se falhar o relaunch automático, o botão "Reiniciar" permite acionar manualmente
        }
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || t('updFailGeneric'));
      setStage('error');
    }
  }, [updateInfo, t]);

  const handleManualRelaunch = async () => {
    try {
      await relaunch();
    } catch {
      window.location.reload();
    }
  };

  const dismiss = useCallback(() => {
    setStage('dismissed');
  }, []);

  if (stage === 'idle' || stage === 'dismissed') {
    return null;
  }

  return (
    <AnimatedList>
      <AnimatedCard
        animateKey="update-banner"
        variant={bannerEntry}
        className="mb-6 relative z-30"
      >
        {/* State: Checking (apenas visível se triggered) */}
        {stage === 'checking' && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl lf-surface border lf-border backdrop-blur-md">
            <Loader2 size={16} className="animate-spin text-indigo-400" />
            <span className="text-sm lf-text-secondary">{t('updChecking')}</span>
          </div>
        )}

        {/* State: Update Available - Popup com Changelog e Botões */}
        {stage === 'available' && updateInfo && (
          <AnimatedCard
            animateKey="update-available-modal"
            variant={scaleIn}
            className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 via-indigo-950/20 to-transparent backdrop-blur-xl shadow-2xl shadow-indigo-500/10 p-5"
          >
            {/* Linha de brilho superior */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />

            <div className="flex flex-col gap-4">
              {/* Header do popup */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-inner">
                    <Sparkles size={20} className="text-indigo-400 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {t('updAvailable')}
                      </h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-500/30">
                        v{updateInfo.version}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs lf-text-secondary">
                      <span>{t('updCurrent')} <strong className="font-mono text-zinc-300">v{updateInfo.currentVersion}</strong></span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <ShieldCheck size={13} />
                        {t('updSigOk')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botão X para dispensar */}
                <button
                  onClick={dismiss}
                  className="p-1.5 rounded-lg lf-text-muted hover:text-white hover:bg-white/10 transition-colors"
                  title={t('updDismissTitle')}
                  aria-label={t('updDismissAria')}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Notas de atualização (Changelog do GitHub) */}
              {updateInfo.body && (
                <div className="rounded-xl bg-black/40 border border-white/5 p-3.5 text-xs text-zinc-200">
                  <div
                    onClick={() => setShowNotes(!showNotes)}
                    className="flex items-center justify-between cursor-pointer select-none font-semibold text-indigo-300 mb-1.5"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileText size={14} />
                      {t('updWhatsNew')}
                    </span>
                    <span className="text-[11px] underline opacity-80 hover:opacity-100">
                      {showNotes ? t('updHide') : t('updShow')}
                    </span>
                  </div>
                  {showNotes && (
                    <div className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed pr-1 text-zinc-300 font-sans text-xs scrollbar-thin">
                      {updateInfo.body}
                    </div>
                  )}
                </div>
              )}

              {/* Ações: Atualizar e Reiniciar vs Mais Tarde */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold lf-text-secondary hover:text-white hover:bg-white/5 transition-colors border border-white/10"
                >
                  <Clock size={14} />
                  {t('updLater')}
                </button>

                <AnimatedButton
                  onClick={handleUpdateAndRestart}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:brightness-110 shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
                >
                  <Download size={14} />
                  {t('updInstall')}
                </AnimatedButton>
              </div>
            </div>
          </AnimatedCard>
        )}

        {/* State: Downloading com barra de progresso elegante */}
        {stage === 'downloading' && (
          <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/40 to-black/60 backdrop-blur-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-indigo-400" />
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    {t('updDownloading')}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {t('updRestartAuto')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-bold text-indigo-400">{progress}%</span>
                {totalBytes > 0 && (
                  <p className="text-[11px] font-mono text-zinc-400">
                    {formatBytes(receivedBytes)} / {formatBytes(totalBytes)}
                  </p>
                )}
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden relative">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* State: Ready (reiniciando) */}
        {stage === 'ready' && (
          <AnimatedCard
            animateKey="ready"
            variant={scaleIn}
            className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-black/60 backdrop-blur-xl p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <CheckCircle size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{t('updReady')}</h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    {t('updRestarting')}
                  </p>
                </div>
              </div>
              <AnimatedButton
                onClick={handleManualRelaunch}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-colors"
              >
                <RefreshCw size={13} />
                {t('updRestartNow')}
              </AnimatedButton>
            </div>
          </AnimatedCard>
        )}

        {/* State: Error */}
        {stage === 'error' && (
          <div className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 to-black/60 backdrop-blur-xl p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0">
                  <AlertCircle size={18} className="text-rose-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t('updFailed')}</p>
                  <p className="text-xs text-rose-300/80 truncate mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={checkForUpdates}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
                >
                  {t('updRetry')}
                </button>
                <button
                  onClick={dismiss}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label={t('updClose')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatedCard>
    </AnimatedList>
  );
}
