import { useState, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Toggle } from '../../components/Toggle';
import { useApp } from '../../context/AppContext';

/**
 * AndroidUpdater — auto-update sideload (sem Play Store).
 * Consulta a latest do GitHub, compara com a versão instalada e baixa o APK
 * via DownloadManager nativo (comando `updateDownload` do plugin Kotlin),
 * que abre o instalador ao concluir. Sem dependência nova, sem Rust novo:
 * o plugin já está registrado como `ytdlp`.
 */

const OWNER = '4i20nataN';
const REPO = 'LinkFatcher';
const LATEST_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

function parseVer(v: string): number[] {
  return v.trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
}

/** Retorna >0 se `a` é mais nova que `b`. */
function compareVer(a: string, b: string): number {
  const pa = parseVer(a);
  const pb = parseVer(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

type Stage = 'idle' | 'checking' | 'available' | 'downloading' | 'error';

export function AndroidUpdater() {
  const { settings, updateSettings } = useApp();
  const en = settings.language === 'en';
  const [stage, setStage] = useState<Stage>('idle');
  const [remote, setRemote] = useState('');
  const [apkUrl, setApkUrl] = useState('');
  const [apkName, setApkName] = useState('LinkFetcher.apk');
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    setStage('checking');
    setError('');
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      const current = await getVersion();
      const res = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const rel = await res.json();
      const tag: string = rel.tag_name || '';
      const assets: any[] = rel.assets || [];
      // APK da ABI do aparelho (leve); fallback: universal (completo).
      let name = 'LinkFetcher.apk';
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { abi } = await invoke<{ abi: string }>('plugin:ytdlp|appAbi');
        const perAbi = abi ? `LinkFetcher-${abi}.apk` : '';
        if (perAbi && assets.some(a => a?.name === perAbi)) name = perAbi;
      } catch {
        // sem ABI (ou comando indisponível): universal
      }
      setApkName(name);
      const apk = assets.find((a: any) => typeof a?.name === 'string' && a.name === name);
      if (!tag || !apk?.browser_download_url) {
        throw new Error(en ? 'No Android APK in latest release' : 'Release atual sem APK Android');
      }
      if (compareVer(tag, current) > 0) {
        setRemote(tag);
        setApkUrl(apk.browser_download_url);
        setStage('available');
      } else {
        setRemote(tag);
        setStage('idle');
      }
    } catch (e: any) {
      setError(e?.message || (en ? 'Check failed' : 'Falha na verificação'));
      setStage('error');
    }
  }, [en]);

  const download = useCallback(async () => {
    if (!apkUrl) return;
    setStage('downloading');
    setError('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const fileName = apkName;
      await invoke('plugin:ytdlp|updateDownload', { url: apkUrl, fileName });
      // O DownloadManager do sistema assume daqui (notificação + instalador).
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message;
      setError(msg || (en ? 'Download failed' : 'Falha no download'));
      setStage('error');
    }
  }, [apkUrl, apkName, en]);

  const statusText =
    stage === 'checking'
      ? (en ? 'Checking…' : 'Verificando…')
      : stage === 'downloading'
        ? (en ? 'Downloading via system notification…' : 'Baixando pela notificação do sistema…')
        : stage === 'available'
          ? (en ? `${remote} available` : `${remote} disponível`)
          : remote
            ? (en ? `Up to date (${remote})` : `Em dia (${remote})`)
            : (en ? 'Check for app updates via GitHub releases' : 'Verifica atualizações nas releases do GitHub');

  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-xl lf-surface-40 lf-border">
      <div className="space-y-0.5 min-w-0">
        <span className="text-xs font-semibold lf-text-secondary">
          {en ? 'App updates' : 'Atualizações do app'}
        </span>
        <p className="text-[10px] lf-text-muted flex items-center gap-1">
          {stage === 'error' ? <AlertCircle size={10} className="text-rose-400 shrink-0" /> : null}
          <span className="truncate">{stage === 'error' ? error : statusText}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Toggle value={settings.updates} onChange={() => updateSettings({ updates: !settings.updates })} settings={settings} />
        {stage === 'available' ? (
          <button
            onClick={download}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
          >
            <Download size={12} />
            {en ? 'Install' : 'Instalar'}
          </button>
        ) : stage === 'idle' || stage === 'error' ? (
          <button
            onClick={check}
            className="px-3 py-2 rounded-xl lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-zinc-700/50 transition-all whitespace-nowrap"
          >
            <RefreshCw size={12} />
            {en ? 'Check' : 'Verificar'}
          </button>
        ) : (
          <span className="px-3 py-2 text-xs lf-text-muted flex items-center gap-1.5">
            {stage === 'available' || stage === 'downloading' ? <CheckCircle2 size={12} className="text-emerald-400" /> : <RefreshCw size={12} className="animate-spin" />}
            {stage === 'downloading' ? (en ? 'Downloading…' : 'Baixando…') : ''}
          </span>
        )}
      </div>
    </div>
  );
}
