import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation, type TranslationKey } from '../../core/i18n';

type Stage = 'checking' | 'idle' | 'downloading' | 'ready' | 'error';

interface DlState {
  stage: Stage;
  file: string;
  received: number;
  total: number;
  percent: number;
  note?: string;
  error?: string;
}

// Payload do evento `binary-download` (Rust): tipo independente do estado
// local — interseção aqui colapsaria o union e quebrava `d.stage === 'done'`.
interface DlEvent {
  stage: 'progress' | 'done' | 'error';
  file: string;
  received: number;
  total: number;
  percent: number;
  note?: string;
  error?: string;
}

function fmtMB(n: number): string {
  return `${(n / 1048576).toFixed(1)} MB`;
}

const isWindows =
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);

// Notas de progresso vindas do backend (Rust, PT) → chave i18n.
function backendNoteKey(note?: string): TranslationKey | null {
  switch (note) {
    case 'Verificando integridade do yt-dlp…': return 'noteVerifyYtdlp';
    case 'Testando yt-dlp…': return 'noteTestYtdlp';
    case 'Verificando integridade do ffmpeg…': return 'noteVerifyFfmpeg';
    case 'Extraindo ffmpeg…': return 'noteExtractFfmpeg';
    case 'Testando ffmpeg…': return 'noteTestFfmpeg';
    default: return null;
  }
}

// Erros do backend (Rust, PT) → EN quando preciso.
function translateBackendError(error: string, t: (k: TranslationKey) => string, lang: string): string {
  if (lang !== 'en') return error;
  const exact: Record<string, TranslationKey> = {
    'bin/ffmpeg não encontrado no tar.xz': 'setupErrFfmpegNix',
    'bin/ffprobe não encontrado no tar.xz': 'setupErrFfprobeNix',
    'ffmpeg.exe não encontrado no zip': 'setupErrFfmpegWin',
    'ffmpeg: SHA-256 não confere': 'setupErrFfmpegSha',
    'ffprobe.exe não encontrado no zip': 'setupErrFfprobeWin',
    'yt-dlp: SHA-512 não confere': 'setupErrYtdlpSha',
  };
  if (exact[error]) return t(exact[error]);
  if (error.startsWith('yt-dlp sums: ')) return `yt-dlp sums: ${error.slice('yt-dlp sums: '.length)}`;
  if (error.includes(' ausente no SHA2-512SUMS')) {
    return error.replace(' ausente no SHA2-512SUMS', ' missing from SHA2-512SUMS');
  }
  return error;
}

export const BinarySetupOverlay: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const { settings } = useApp();
  const { t } = useTranslation(settings);
  const [st, setSt] = useState<DlState>({ stage: 'checking', file: '', received: 0, total: 0, percent: 0 });
  const [destDir, setDestDir] = useState('');
  const [showManual, setShowManual] = useState(false);
  const YTDLP_FILE = isWindows ? 'yt-dlp.exe' : t('setupYtdlpFile');
  const FFMPEG_FILE = isWindows ? t('setupFfmpegFileWin') : t('setupFfmpegFileNix');
  const noteKey = backendNoteKey(st.note);

  // t() troca de identidade a cada render: depende só da string do idioma
  // para não religar o effect de listen/check em loop.
  const lang = settings.language;
  const check = useCallback(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const s = await invoke<{ ready: boolean; binaryPath?: string }>('ytdlp_status');
      if (s.binaryPath) {
        const sep = s.binaryPath.includes('\\') ? '\\' : '/';
        setDestDir(s.binaryPath.split(sep).slice(0, -1).join(sep));
      }
      if (s.ready) {
        onReady();
        return;
      }
    } catch {
      // status indisponível = backend sem comandos: mostra erro com retry
      setSt({ stage: 'error', file: '', received: 0, total: 0, percent: 0, error: t('setupBackendError') });
      return;
    }
    setSt((p) => ({ ...p, stage: 'idle' }));
  }, [onReady, lang]);

  const startDownload = useCallback(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    setSt((p) => ({ ...p, stage: 'downloading', percent: 0, note: undefined, error: undefined }));
    try {
      await invoke('ytdlp_ensure_binaries');
    } catch (e) {
      setSt((p) => ({ ...p, stage: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<DlEvent>('binary-download', (ev) => {
        const d = ev.payload;
        if (d.stage === 'done' && d.file === 'ffmpeg') {
          setSt({ stage: 'ready', file: '', received: 0, total: 0, percent: 100 });
          return;
        }
        if (d.stage === 'error') {
          setSt({ stage: 'error', file: d.file, received: 0, total: 0, percent: 0, error: d.error });
          return;
        }
        setSt({ stage: 'downloading', file: d.file, received: d.received, total: d.total, percent: d.percent, note: d.note });
      });
      await check();
    })();
    return () => {
      unlisten?.();
    };
  }, [check, onReady]);

  if (st.stage === 'checking') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-md p-6 rounded-3xl bg-[#0c1017] border border-white/10 shadow-2xl space-y-4">
        <h2 className="text-lg font-semibold">{t('setupTitle')}</h2>
        <p className="text-sm lf-text-secondary">
          {t('setupDesc')}
        </p>

        {st.stage === 'checking' && <p className="text-sm lf-text-muted">{t('setupChecking')}</p>}

        {st.stage === 'idle' && (
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold" onClick={startDownload}>
              {t('setupDownloadNow')}
            </button>
            <button className="px-4 py-2 rounded-xl lf-surface-raised border lf-border text-sm" onClick={() => setShowManual((v) => !v)}>
              {t('setupManual')}
            </button>
          </div>
        )}

        {st.stage === 'downloading' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-indigo-400 flex items-center gap-1.5 animate-pulse">
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                {st.percent < 30
                  ? t('setupPhasePrep')
                  : st.percent < 85
                  ? t('setupPhaseDl')
                  : t('setupPhaseVerify')}
              </span>
              <span className="font-mono lf-text-secondary">{st.percent}%</span>
            </div>
            <div className="h-2 rounded-full lf-surface-raised overflow-hidden border lf-border">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${st.percent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] lf-text-muted">
              <span>{st.file ? t('setupComponent', { file: st.file }) : t('setupPreparing')}</span>
              <span>{st.received > 0 ? `${fmtMB(st.received)} / ${st.total ? fmtMB(st.total) : '...'}` : ''}</span>
            </div>
            {st.note && <p className="text-xs text-indigo-300/90 italic">{noteKey ? t(noteKey) : st.note}</p>}
          </div>
        )}

        {st.stage === 'ready' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <span className="text-base">✨</span>
              <span>{t('setupReady')}</span>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <span className="text-sm">⚡</span>
              <p className="text-[11px] lf-text-secondary leading-relaxed">
                {t('setupThrottleTip')}
              </p>
            </div>
            <button
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
              onClick={onReady}
            >
              {t('setupStart')}
            </button>
          </div>
        )}

        {st.stage === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-rose-400">{st.error ? translateBackendError(st.error, t, settings.language) : t('setupFailGeneric')}</p>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm" onClick={startDownload}>
                {t('setupRetry')}
              </button>
              <button className="px-4 py-2 rounded-xl lf-surface-raised border lf-border text-sm" onClick={() => setShowManual((v) => !v)}>
                {t('setupManual')}
              </button>
            </div>
          </div>
        )}

        {(st.stage === 'idle' || st.stage === 'error') && showManual && (
          <div className="text-xs lf-text-secondary space-y-2 border-t lf-border pt-3">
            <p>{t('setupManualTitle')}</p>
            <p className="font-mono break-all lf-text-muted">{destDir || t('setupManualFallback')}</p>
            <p>1. yt-dlp: github.com/yt-dlp/yt-dlp/releases/latest → {YTDLP_FILE}</p>
            <p>2. ffmpeg: github.com/BtbN/FFmpeg-Builds/releases → {FFMPEG_FILE}</p>
            {!isWindows && <p>3. No terminal: <span className="font-mono">chmod +x yt-dlp ffmpeg</span></p>}
            <button className="px-3 py-1.5 rounded-lg lf-surface-raised border lf-border text-xs" onClick={check}>
              {t('setupManualRecheck')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
