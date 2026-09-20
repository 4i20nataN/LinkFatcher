/**
 * clipboard.ts — leitura da área de transferência no desktop Tauri.
 * Usa o plugin nativo (sem prompt de permissão do navegador); cai para
 * `navigator.clipboard` quando o plugin não está disponível.
 */

export async function readClipboardText(): Promise<string> {
  try {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
    return (await readText()) || '';
  } catch {
    // ignore — tenta a API do navegador
  }
  try {
    if (navigator.clipboard?.readText) {
      return (await navigator.clipboard.readText()) || '';
    }
  } catch {
    // permissão negada ou indisponível
  }
  return '';
}

/** Heurística simples: texto parece um link http(s) colável. */
export function looksLikeUrl(text: string): boolean {
  const t = (text || '').trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  try {
    const u = new URL(t);
    return !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}
