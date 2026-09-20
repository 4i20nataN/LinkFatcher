/**
 * renderProfile — single renderer capability probe for ambient effects.
 *
 * Tauri on Linux renders in WebKitGTK (usually without GPU compositing):
 * full-screen canvas @60fps + full-screen blur() + backdrop-blur glass on
 * top pins a CPU core at ~100% while idle (measured: WebKitWebProcess 99%
 * vs Rust shell 2.3%). Chromium shells (Electron, Tauri/Windows WebView2)
 * composite those layers on GPU and stay smooth.
 *
 * 'full'      → effects exactly as authored (Chromium).
 * 'efficient' → same visuals, cheaper motion (30fps canvas, fewer nodes,
 *               static glow). No UI element is added, removed or restyled.
 */

const isTauri =
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
// `window.chrome` exists in Chromium-derived engines (Chrome, Edge, WebView2)
// and is absent in WebKitGTK/Firefox.
const isChromium =
  typeof window !== 'undefined' && !!(window as unknown as { chrome?: unknown }).chrome;

export const RENDER_PROFILE: 'full' | 'efficient' = isTauri && !isChromium ? 'efficient' : 'full';
