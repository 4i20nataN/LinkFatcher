import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../core/storage/Storage';
import { 
  Settings, Globe, Sliders, HardDrive, AlertCircle, 
  Trash2, ShieldCheck, Download, Upload, RefreshCw,
  FolderOpen, FolderPlus, Smile, Palette, Clipboard, Eye, Cookie
} from 'lucide-react';
import { AnimatedCard } from '../../animation/AnimatedCard';
import { AnimatedList } from '../../animation/AnimatedList';
import { slideUp, scaleIn, fadeIn } from '../../animation/variants';
import { useTranslation } from '../../core/i18n';
import { 
  getAccentBgClass, getAccentTextClass, getAccentBorderClass, getAccentRingClass
} from '../../components/ThemeWrapper';
import { Toggle } from '../../components/Toggle';

const accentColorsList = [
  { id: 'indigo', name: 'indigo', color: 'bg-indigo-500' },
  { id: 'emerald', name: 'emerald', color: 'bg-emerald-500' },
  { id: 'amber', name: 'amber', color: 'bg-amber-500' },
  { id: 'rose', name: 'rose', color: 'bg-rose-500' },
  { id: 'violet', name: 'violet', color: 'bg-violet-500' },
  { id: 'sky', name: 'sky', color: 'bg-sky-500' },
  { id: 'teal', name: 'teal', color: 'bg-teal-500' },
  { id: 'fuchsia', name: 'fuchsia', color: 'bg-fuchsia-500' },
  { id: 'orange', name: 'orange', color: 'bg-orange-500' },
  { id: 'cyan', name: 'cyan', color: 'bg-cyan-500' },
  { id: 'lime', name: 'lime', color: 'bg-lime-500' },
  { id: 'crimson', name: 'crimson', color: 'bg-red-500' },
  { id: 'pink', name: 'pink', color: 'bg-pink-500' },
  { id: 'slate', name: 'slate', color: 'bg-slate-400' }
];

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, clearAllData, setActiveTab } = useApp();
  const { t } = useTranslation(settings);
  const [importText, setImportText] = useState('');
  const [showImportArea, setShowImportArea] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const isElectron = typeof window !== 'undefined' && !!window.electron;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => { setToastMsg(null); }, 2000);
  };

  useEffect(() => {
    if (isElectron && (!settings.defaultDir || settings.defaultDir === 'Downloads')) {
      window.electron!.invoke('shell:getDownloadsPath').then((p: any) => {
        if (p && typeof p === 'string') {
          updateSettings({ defaultDir: p });
        }
      }).catch(() => {});
    }
  }, []);

  // Sync auto-update preference to main process
  useEffect(() => {
    if (isElectron && window.electron?.setAutoCheck) {
      window.electron.setAutoCheck(settings.updates);
    }
  }, [settings.updates, isElectron]);

  const handleOpenFolder = async () => {
    const downloadPath = settings.defaultDir || '';
    if (!downloadPath) {
      showToast(settings.language === 'en' ? 'No folder configured. Choose a destination folder first.' : 'Nenhuma pasta configurada. Escolha uma pasta de destino primeiro.');
      return;
    }
    if (!isElectron) return;
    await window.electron!.invoke('shell:openPath', downloadPath);
  };

  const handleSelectFolder = async () => {
    if (!isElectron) return;
    const selectedPath = await window.electron!.invoke('shell:selectFolder', settings.defaultDir) as string | null;
    if (selectedPath) {
      updateSettings({ defaultDir: selectedPath });
      showToast(settings.language === 'en' ? `Download folder set to: ${selectedPath}` : `Pasta de downloads definida para: ${selectedPath}`);
    }
  };

  const handleExport = () => {
    try {
      const dataStr = StorageService.exportLinksBackup();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linkfetcher-links-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('backupSuccess'));
    } catch (_) {
      showToast(settings.language === 'en' ? 'Failed to export links' : 'Falha ao exportar links');
    }
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const result = StorageService.importLinksBackup(importText);
    if (result.errors.length === 0 && result.imported > 0) {
      showToast(`${settings.language === 'en' ? 'Imported' : 'Importado'} ${result.imported} ${settings.language === 'en' ? 'items' : 'itens'}. ${settings.language === 'en' ? 'Restarting...' : 'Reiniciando...'}`);
      setTimeout(() => { window.location.reload(); }, 1000);
    } else if (result.imported === 0) {
      showToast(t('importFailed'));
    } else {
      showToast(`${settings.language === 'en' ? 'Imported' : 'Importado'} ${result.imported} ${settings.language === 'en' ? 'items' : 'itens'} (${result.errors.join(', ')})`);
    }
  };

  const handleClearCache = () => {
    StorageService.clearCache();
    showToast(settings.language === 'en' ? 'App cache cleared successfully' : 'Cache do aplicativo limpo com sucesso');
  };

  const handleResetData = () => {
    const msg = settings.language === 'en'
      ? 'Are you sure you want to reset ALL settings, favorites, and download history? This action cannot be undone.'
      : 'Tem certeza de que deseja redefinir TODAS as configurações, favoritos e histórico de download? Esta ação não pode ser desfeita.';
    if (window.confirm(msg)) {
      clearAllData();
      showToast(settings.language === 'en' ? 'All data reset to defaults' : 'Todos os dados foram redefinidos para os padrões');
      setTimeout(() => { window.location.reload(); }, 1000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 md:py-6 px-4 pb-12">
      <AnimatedList>
        {toastMsg && (
          <AnimatedCard
            animateKey="toast"
            variant={slideUp}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-50 px-4 py-3 rounded-xl lf-surface lf-border-strong text-xs font-semibold text-white shadow-2xl flex items-center gap-2.5"
          >
            <ShieldCheck size={16} className={getAccentTextClass(settings)} />
            {toastMsg}
          </AnimatedCard>
        )}
      </AnimatedList>

      <div className="text-center md:text-left space-y-2">
        <h2 className="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight">
          {t('settingsTitle')}
        </h2>
        <p className="lf-text-secondary text-sm md:text-base">
          {t('settingsSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <div className="p-5 rounded-3xl glass-card space-y-4 shadow-md cv-auto">
            <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
              <Settings size={16} className={getAccentTextClass(settings)} /> {t('visualPrefs')}
            </h3>

            <div className="space-y-2">
              <span className="text-xs lf-text-secondary font-medium">{t('themeMode')}</span>
              <div className="grid grid-cols-4 gap-2 p-1 rounded-xl lf-surface lf-border">
                {[
                  { id: 'light', name: t('themeLight') },
                  { id: 'dark', name: t('themeDark') },
                  { id: 'gray', name: t('themeGray') },
                  { id: 'white', name: t('themeWhite') }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => updateSettings({ themeMode: mode.id as any })}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all ${settings.themeMode === mode.id ? 'lf-surface text-white shadow-md border lf-border' : 'lf-text-muted hover:text-zinc-300 border border-transparent'}`}
                  >
                    {mode.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="text-xs lf-text-secondary font-medium block">{t('accentColor')}</span>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {accentColorsList.map((color) => {
                  const isSelected = settings.accentColor === color.id;
                  return (
                    <button
                      key={color.id}
                      onClick={() => updateSettings({ accentColor: color.id })}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${isSelected ? `${getAccentBorderClass(settings)} bg-white/5` : 'border-zinc-800 bg-transparent hover:bg-white/5'}`}
                    >
                      <span className={`w-4 h-4 rounded-full ${color.color} block shadow-inner`} />
                      <span className="text-[10px] lf-text-secondary font-medium capitalize">{t(color.name as any)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs lf-text-secondary font-medium flex items-center gap-1">
                <Palette size={14} /> {settings.language === 'en' ? 'Icon Style' : 'Estilo dos Icones'}
              </span>
              <div className="grid grid-cols-3 gap-2 p-1 rounded-xl lf-surface lf-border">
                {[
                  { id: 'emoji', name: 'Emoji', icon: '🎬' },
                  { id: 'lucide-mono', name: 'Lucide', icon: null },
                  { id: 'lucide-color', name: 'Colorido', icon: null },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => updateSettings({ iconStyle: mode.id as any })}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${settings.iconStyle === mode.id ? 'lf-surface text-white shadow-md border lf-border' : 'lf-text-muted hover:text-zinc-300 border border-transparent'}`}
                  >
                    {mode.icon ? (
                      <span className="text-sm">{mode.icon}</span>
                    ) : (
                      <Palette size={12} className={mode.id === 'lucide-color' ? 'text-amber-400' : 'lf-text-secondary'} />
                    )}
                    {mode.name}
                  </button>
                ))}
              </div>
              <p className="text-[10px] lf-text-faint">
                {settings.language === 'en'
                  ? 'Choose how icons appear on download option blocks and format selector cards.'
                  : 'Escolha como os icones aparecem nos blocos de opcoes de download e cards do seletor de formato.'}
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
              <div className="space-y-1">
                <span className="text-xs text-white font-medium flex items-center gap-1.5">
                  <Smile size={14} className="lf-text-secondary" />
                  {settings.language === 'en' ? 'Colorful Sidebar Emojis' : 'Emojis Coloridos na Lateral'}
                </span>
                <p className="text-[10px] lf-text-muted">
                  {settings.language === 'en' ? 'Keep sidebar emojis colored at all times instead of grayscale' : 'Manter emojis da barra lateral sempre coloridos em vez de preto e branco'}
                </p>
              </div>
              <Toggle value={settings.colorfulIcons} onChange={() => updateSettings({ colorfulIcons: !settings.colorfulIcons })} settings={settings} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
              <div className="space-y-1">
                <span className="text-xs text-white font-medium flex items-center gap-1.5">
                  <Clipboard size={14} className="lf-text-secondary" />
                  {settings.language === 'en' ? 'Allow Clipboard Access' : 'Permitir Acesso à Área de Transferência'}
                </span>
                <p className="text-[10px] lf-text-muted">
                  {settings.language === 'en' ? 'Enable "paste link" button to read from clipboard automatically' : 'Ativar botão "colar link" para ler automaticamente da área de transferência'}
                </p>
              </div>
              <Toggle value={settings.clipboardEnabled} onChange={() => updateSettings({ clipboardEnabled: !settings.clipboardEnabled })} settings={settings} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
              <div className="space-y-1">
                <span className="text-xs text-white font-medium flex items-center gap-1.5">
                  <Eye size={14} className="lf-text-secondary" />
                  {settings.language === 'en' ? 'Clipboard Link Detection' : 'Detecção de Links na Área de Transferência'}
                </span>
                <p className="text-[10px] lf-text-muted">
                  {settings.language === 'en'
                    ? 'Show download popup when a link is copied to clipboard'
                    : 'Mostrar popup de download quando um link for copiado para a área de transferência'}
                </p>
              </div>
              <Toggle value={settings.clipboardMonitoringEnabled} onChange={() => {
                const newVal = !settings.clipboardMonitoringEnabled;
                updateSettings({
                  clipboardMonitoringEnabled: newVal,
                  clipboardFirstRunDone: true,
                });
              }} settings={settings} />
            </div>
          </div>

          <div className="p-5 rounded-3xl glass-card space-y-4 shadow-md cv-auto">
            <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
              <Sliders size={16} className={getAccentTextClass(settings)} /> {t('networkSettings')}
            </h3>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="lf-text-secondary">{t('simultaneousDownloads')}</span>
                <span className="text-white">{t('simultCount', { count: settings.maxConcurrent })}</span>
              </div>
              <div className="flex gap-2 p-1 rounded-xl lf-surface lf-border">
                {[1, 2, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => updateSettings({ maxConcurrent: num })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${settings.maxConcurrent === num ? 'lf-surface text-white shadow-md border lf-border' : 'lf-text-muted hover:text-zinc-300 border border-transparent'}`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold lf-text-secondary">
                    {settings.language === 'en' ? 'Start Downloads Automatically' : 'Iniciar Downloads Automaticamente'}
                  </span>
                  <p className="text-[10px] lf-text-muted">
                    {settings.language === 'en' ? 'Starts downloading right after analyzer finishes.' : 'Inicia o download logo após a análise, sem aguardar na fila.'}
                  </p>
                </div>
                <Toggle value={settings.autoDownload} onChange={() => updateSettings({ autoDownload: !settings.autoDownload })} settings={settings} />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-5 rounded-3xl glass-card space-y-4 shadow-md cv-auto">
            <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
              <HardDrive size={16} className={getAccentTextClass(settings)} /> {t('storageSettings')}
            </h3>

            <div className="space-y-2">
                <span className="text-xs lf-text-secondary font-medium">{t('destinationFolder')}</span>                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.defaultDir}
                    onChange={(e) => updateSettings({ defaultDir: e.target.value })}
                    className={`flex-1 min-w-0 px-3 py-2 rounded-xl lf-surface border border-zinc-800 text-xs lf-text-secondary font-mono focus:outline-none focus:ring-2 ${getAccentRingClass(settings)}`}
                    placeholder={settings.language === 'en' ? 'Download folder path...' : 'Caminho da pasta de downloads...'}
                  />
                  <button
                    onClick={handleSelectFolder}
                    className="px-3 py-2 rounded-xl lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-zinc-700/50 transition-all whitespace-nowrap"
                    title={settings.language === 'en' ? 'Choose folder (native dialog)' : 'Escolher pasta (diálogo nativo)'}
                  >
                    <FolderPlus size={12} />
                    {settings.language === 'en' ? 'Choose' : 'Escolher'}
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    className="px-3 py-2 rounded-xl lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-zinc-700/50 transition-all whitespace-nowrap"
                  >
                    <FolderOpen size={12} />
                    {settings.language === 'en' ? 'Open' : 'Abrir'}
                  </button>
                </div>
                <p className="text-[10px] lf-text-faint flex items-start gap-1">
                  <span className="shrink-0">🖥️</span>
                  <span className="min-w-0 break-words">
                  {settings.language === 'en'
                    ? 'Native folder dialogs available'
                    : 'Diálogos de pasta nativos disponíveis'}
                  </span>
                </p>
              </div>

            <div className="space-y-2">
              <span className="text-xs lf-text-secondary font-medium flex items-center gap-1">
                <Globe size={14} /> {t('appLanguage')}
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl lf-surface lf-border">
                {[
                  { id: 'pt', name: 'Português (BR)' },
                  { id: 'en', name: 'English (US)' }
                ].map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => updateSettings({ language: lang.id as any })}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all ${settings.language === lang.id ? 'lf-surface text-white shadow-md border lf-border' : 'lf-text-muted hover:text-zinc-300 border border-transparent'}`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold lf-text-secondary">{t('notifLabel')}</span>
                  <p className="text-[10px] lf-text-muted">{t('notifDesc')}</p>
                </div>
                <Toggle value={settings.notifications} onChange={() => updateSettings({ notifications: !settings.notifications })} settings={settings} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl lf-surface-40 lf-border">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold lf-text-secondary">{t('updatesLabel')}</span>
                  <p className="text-[10px] lf-text-muted">{t('updatesDesc')}</p>
                </div>
                <Toggle value={settings.updates} onChange={() => updateSettings({ updates: !settings.updates })} settings={settings} />
              </div>

              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold lf-text-secondary flex items-center gap-1.5">
                      <Cookie size={14} className="text-amber-400" />
                      {settings.language === 'en' ? 'Browser Cookies' : 'Cookies do Navegador'}
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                        {settings.language === 'en' ? 'Recommended' : 'Recomendado'}
                      </span>
                    </span>
                    <p className="text-[10px] lf-text-muted">
                      {settings.language === 'en'
                        ? 'Use browser cookies on all downloads to bypass bot detection (403)'
                        : 'Usar cookies do navegador em todos os downloads para contornar detecção de bot (403)'}
                    </p>
                  </div>
                  <Toggle
                    value={!!settings.cookiesFromBrowser}
                    onChange={() => updateSettings({ cookiesFromBrowser: settings.cookiesFromBrowser ? '' : 'chrome' })}
                    settings={settings}
                  />
                </div>
                {!!settings.cookiesFromBrowser && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'chrome', name: 'Chrome', icon: '🟢' },
                      { id: 'edge', name: 'Edge', icon: '🔵' },
                      { id: 'firefox', name: 'Firefox', icon: '🟠' },
                      { id: 'brave', name: 'Brave', icon: '🦁' },
                      { id: 'chromium', name: 'Chromium', icon: '🔷' },
                      { id: 'opera', name: 'Opera', icon: '🔴' },
                    ].map((b) => (
                      <button
                        key={b.id}
                        onClick={() => updateSettings({ cookiesFromBrowser: b.id })}
                        className={`py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${settings.cookiesFromBrowser === b.id ? 'lf-surface text-white shadow-md border lf-border' : 'lf-text-muted hover:text-zinc-300 border border-transparent'}`}
                      >
                        <span>{b.icon}</span>
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-3xl glass-card space-y-4 shadow-md cv-auto">
            <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
              <RefreshCw size={16} className={getAccentTextClass(settings)} /> {t('backupSettings')}
            </h3>
            <p className="text-[10px] lf-text-muted">
              {settings.language === 'en'
                ? 'Export/import only links (favorites, downloads, download later). Lightweight format for easy sharing.'
                : 'Exportar/importar apenas links (favoritos, downloads, baixar depois). Formato leve para fácil compartilhamento.'}
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 px-4 py-2.5 rounded-xl lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700/50 transition-all"
              >
                <Upload size={14} /> {t('exportBackup')}
              </button>
              <button
                onClick={() => setShowImportArea(!showImportArea)}
                className="flex-1 px-4 py-2.5 rounded-xl lf-surface-raised hover:bg-zinc-800 lf-text hover:text-white text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700/50 transition-all"
              >
                <Download size={14} /> {t('importBackup')}
              </button>
            </div>

            {showImportArea && (
              <AnimatedCard
                animateKey="import-area"
                variant={fadeIn}
                className="space-y-2 pt-2"
              >
                <span className="text-[10px] lf-text-muted font-mono block">
                  {settings.language === 'en' ? 'Paste the links JSON below:' : 'Cole o JSON de links abaixo:'}
                </span>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"favorites": [...], "downloadLater": [...], "downloads": [...]}'
                  rows={4}
                  className={`w-full p-2.5 rounded-lg lf-surface border border-zinc-800 text-xs lf-text-secondary font-mono placeholder-zinc-700 focus:outline-none focus:ring-2 ${getAccentRingClass(settings)}`}
                />
                <button
                  onClick={handleImport}
                  className={`w-full py-2 rounded-lg text-white font-semibold text-xs shadow-md ${getAccentBgClass(settings)}`}
                >
                  {settings.language === 'en' ? 'Confirm Import' : 'Confirmar Importação'}
                </button>
              </AnimatedCard>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-red-500/5 border border-red-500/10 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div>
          <h4 className="font-semibold text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle size={14} /> {settings.language === 'en' ? 'Dangerous Storage Management' : 'Gerenciamento de Armazenamento Perigoso'}
          </h4>
          <p className="text-[10px] lf-text-muted mt-1 max-w-sm">
            {settings.language === 'en' 
              ? 'These actions irreversibly clear local browser lists. Use with extreme caution.' 
              : 'Estas ações limpam as listas locais armazenadas no navegador de forma irreversível. Use com bastante cautela.'}
          </p>
        </div>
        <div className="flex gap-2 justify-start md:justify-end">
          <button
            onClick={handleClearCache}
            className="px-4 py-2.5 rounded-xl border border-red-500/10 bg-red-950/20 text-red-300 hover:text-red-200 hover:bg-red-900/20 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          >
            {settings.language === 'en' ? 'Clear Temp Cache' : 'Limpar Cache Temporário'}
          </button>
          <button
            onClick={handleResetData}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/10"
          >
            <Trash2 size={14} /> {settings.language === 'en' ? 'Reset All' : 'Redefinir Tudo'}
          </button>
        </div>
      </div>

      <button
        onClick={() => setActiveTab('privacy')}
        className="w-full p-4 rounded-2xl glass-card hover:bg-white/5 transition-all flex items-center gap-3 group cv-auto"
      >
        <div className={`p-2 rounded-xl ${getAccentBgClass(settings)} text-white shadow-lg`}>
          <ShieldCheck size={18} />
        </div>
        <div className="text-left">
          <span className="text-xs font-semibold text-white block">
            {settings.language === 'en' ? 'Privacy Policy' : 'Política de Privacidade'}
          </span>
          <span className="text-[10px] lf-text-muted">
            {settings.language === 'en' ? 'View how we handle your data' : 'Veja como tratamos seus dados'}
          </span>
        </div>
      </button>

    </div>
  );
};