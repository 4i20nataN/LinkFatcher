export {};

declare global {
  const __APP_VERSION__: string;

  interface Window {
    __TAURI__?: unknown;
    electron?: {
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
      off: (channel: string, listener: (...args: unknown[]) => void) => void;

      // ── Auto-Update API ───────────────────────────────────────────────────
      checkForUpdate: () => Promise<{
        updateAvailable: boolean;
        version?: string;
        currentVersion?: string;
        error?: string;
      }>;
      applyUpdate: (opts?: { version?: string }) => Promise<{
        ok: boolean;
        installerPath?: string;
        version?: string;
        error?: string;
      }>;
      installUpdate: (opts: { installerPath: string }) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      onUpdateProgress: (cb: (data: {
        stage: 'verifying' | 'downloading' | 'ready' | 'error';
        percent?: number;
        received?: number;
        total?: number;
        error?: string;
      }) => void) => () => void;
      onUpdateAvailable: (cb: (data: { version: string }) => void) => () => void;
      setAutoCheck: (enabled: boolean) => void;
      getAutoCheck: () => Promise<boolean>;

      // ── Clipboard monitoring API ─────────────────────────────────────────
      clipboardStartMonitoring: () => void;
      clipboardStopMonitoring: () => void;
      clipboardGetText: () => Promise<string>;
      onClipboardUrlDetected: (cb: (url: string) => void) => () => void;

      // ── Browser extension status ─────────────────────────────────────────
      isExtensionConnected: () => Promise<boolean>;
      onExtensionStatus: (cb: (connected: boolean) => void) => () => void;
    };
  }

  namespace NodeJS {
    interface Process {
      resourcesPath?: string;
    }
  }
}
