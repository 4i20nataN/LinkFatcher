/**
 * notify.ts — aviso de sistema ao concluir/falhar download.
 * Caminho primário: `tauri-plugin-notification` (desktop + Android; no
 * Android 13+ pede POST_NOTIFICATIONS em runtime). Fallback: Web
 * Notification API (quando o plugin não está disponível).
 * Tudo best-effort: notificação nunca quebra o fluxo do download.
 */

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

export async function sendDownloadNotification(title: string, body: string): Promise<void> {
  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } =
        await import('@tauri-apps/plugin-notification');
      let granted = await isPermissionGranted();
      if (!granted) {
        const req = await requestPermission();
        granted = req === 'granted';
      }
      if (granted) {
        sendNotification({ title, body });
        return;
      }
    } catch {
      // plugin indisponível — tenta a API Web abaixo
    }
  }
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') new Notification(title, { body });
      }
    }
  } catch {
    // ambiente sem notificações — silencioso
  }
}
