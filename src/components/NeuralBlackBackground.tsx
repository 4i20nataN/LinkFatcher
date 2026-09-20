import React, { useRef, useEffect } from 'react';
import { RENDER_PROFILE } from '../core/perf/renderProfile';

/**
 * NeuralBlackBackground — Dark/Gray theme ambient particle animation.
 * Production-optimized: zero mouse/touch interaction, frame budget limiting.
 *
 * Performance profile:
 * - Float32Array typed arrays (zero GC)
 * - Spatial grid hashing O(N·k) neighbor lookups
 * - Pre-rendered sprite atlas per color
 * - Frame budget limiting (60fps / 30fps reduced-motion)
 * - Visibility API pause on hidden tab
 * - Debounced resize (200ms)
 * - No mouse/touch interaction (pure ambient)
 */

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NODE_COUNT = prefersReducedMotion ? 40 : RENDER_PROFILE === 'efficient' ? 45 : 70;
const CONNECTION_DIST = 140;
const CONNECTION_DIST_SQ = CONNECTION_DIST * CONNECTION_DIST;
const BG_COLOR = '#030406';
const VELOCITY = 0.35;
const TWO_PI = Math.PI * 2;
const GLOW_RADIUS_MULT = 4.5;
const FRAME_BUDGET = prefersReducedMotion || RENDER_PROFILE === 'efficient' ? 33.33 : 16.67;
// STATIC: efficient profile paints a single settled frame and stops the loop.
// A full-screen canvas repainted every frame — even at 30fps — keeps every
// backdrop-blur surface above it re-sampling on software-rendered webviews.

const COLORS = [
  { rgb: '255, 59, 48', r: 255, g: 59, b: 48 },
  { rgb: '48, 209, 88', r: 48, g: 209, b: 88 },
  { rgb: '0, 118, 255', r: 0, g: 118, b: 255 },
];

const CELL_SIZE = CONNECTION_DIST;

function createNodeSprite(color: { rgb: string; r: number; g: number; b: number }, baseRadius: number): HTMLCanvasElement {
  const pad = (baseRadius + 2) * GLOW_RADIUS_MULT + 4;
  const size = Math.ceil(pad * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const cx = pad;
  const cy = pad;
  const r = baseRadius;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * GLOW_RADIUS_MULT);
  grad.addColorStop(0, `rgba(${color.rgb}, 0.30)`);
  grad.addColorStop(0.4, `rgba(${color.rgb}, 0.08)`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * GLOW_RADIUS_MULT, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = `rgba(${color.rgb}, 0.5)`;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = `rgb(${color.rgb})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.3, 0, TWO_PI);
  ctx.fill();

  return c;
}

function buildSpriteSheet(): Map<string, HTMLCanvasElement> {
  const map = new Map<string, HTMLCanvasElement>();
  for (let ci = 0; ci < COLORS.length; ci++) {
    for (let ri = 0; ri <= 4; ri++) {
      const r = 2 + ri * 0.5;
      const key = `${ci}_${r.toFixed(1)}`;
      map.set(key, createNodeSprite(COLORS[ci], r));
    }
  }
  return map;
}

function quantizeRadius(r: number): string {
  const q = Math.round((r - 2) * 2) / 2;
  const clamped = Math.max(2, Math.min(4, q));
  return clamped.toFixed(1);
}

class SpatialGrid {
  private cellMap = new Map<number, number[]>();
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  clear() { this.cellMap.clear(); }

  private cellKey(cx: number, cy: number): number {
    return cy * this.w + cx;
  }

  insert(idx: number, x: number, y: number) {
    const gx = Math.floor(x / CELL_SIZE);
    const gy = Math.floor(y / CELL_SIZE);
    const key = this.cellKey(gx, gy);
    let cell = this.cellMap.get(key);
    if (!cell) { cell = []; this.cellMap.set(key, cell); }
    cell.push(idx);
  }

  queryNeighbors(x: number, y: number, fn: (idx: number) => void) {
    const gx = Math.floor(x / CELL_SIZE);
    const gy = Math.floor(y / CELL_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = this.cellKey(gx + dx, gy + dy);
        const cell = this.cellMap.get(key);
        if (cell) {
          for (let k = 0; k < cell.length; k++) fn(cell[k]);
        }
      }
    }
  }
}

export const NeuralBlackBackground: React.FC<{ themeMode?: string }> = ({ themeMode = 'dark' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const nodesRef = useRef<Float32Array>(new Float32Array(NODE_COUNT * 5));
  const colorIdxRef = useRef<Uint8Array>(new Uint8Array(NODE_COUNT));
  const brightnessRef = useRef<Float32Array>(new Float32Array(NODE_COUNT));
  const gridRef = useRef<SpatialGrid | null>(null);
  const spriteRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true })!;
    let w = 0;
    let h = 0;
    let painted = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    spriteRef.current = buildSpriteSheet();

    function initNodes() {
      const nodes = nodesRef.current;
      const ci = colorIdxRef.current;
      const br = brightnessRef.current;
      for (let i = 0; i < NODE_COUNT; i++) {
        const base = i * 5;
        nodes[base] = Math.random() * w;
        nodes[base + 1] = Math.random() * h;
        nodes[base + 2] = (Math.random() - 0.5) * VELOCITY;
        nodes[base + 3] = (Math.random() - 0.5) * VELOCITY;
        nodes[base + 4] = Math.random() * 2.2 + 1.8;
        ci[i] = Math.floor(Math.random() * COLORS.length);
        br[i] = 0.7 + Math.random() * 0.3;
      }
    }

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      gridRef.current = new SpatialGrid(w, h);
      initNodes();
      painted = false;
      animRef.current = requestAnimationFrame(animate);
    }

    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    }

    resize();

    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    function animate(timestamp: number) {
      if (RENDER_PROFILE === 'efficient') {
        if (painted) return;
        painted = true;
      } else {
        const elapsed = timestamp - lastFrameRef.current;
        if (elapsed < FRAME_BUDGET) {
          animRef.current = requestAnimationFrame(animate);
          return;
        }
        lastFrameRef.current = timestamp;

        if (!visibleRef.current || document.hidden) {
          animRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      // NOTE: no willChange promotion — on software-rendered webviews a
      // composited full-screen canvas layer costs an upload per frame.
      ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current;
      const ci = colorIdxRef.current;
      const br = brightnessRef.current;
      const grid = gridRef.current!;

      // Phase 1: Update positions
      for (let i = 0; i < NODE_COUNT; i++) {
        const base = i * 5;
        let x = nodes[base];
        let y = nodes[base + 1];
        let vx = nodes[base + 2];
        let vy = nodes[base + 3];

        x += vx;
        y += vy;
        if (x < 0 || x > w) { vx *= -1; x = Math.max(0, Math.min(w, x)); }
        if (y < 0 || y > h) { vy *= -1; y = Math.max(0, Math.min(h, y)); }

        nodes[base] = x;
        nodes[base + 1] = y;
        nodes[base + 2] = vx;
        nodes[base + 3] = vy;
      }

      // Phase 2: Build spatial grid
      grid.clear();
      for (let i = 0; i < NODE_COUNT; i++) {
        grid.insert(i, nodes[i * 5], nodes[i * 5 + 1]);
      }

      // Phase 3: Draw connections
      ctx.lineWidth = 1.2;

      for (let i = 0; i < NODE_COUNT; i++) {
        const baseI = i * 5;
        const ax = nodes[baseI];
        const ay = nodes[baseI + 1];
        const ac = COLORS[ci[i]];

        grid.queryNeighbors(ax, ay, (j) => {
          if (j <= i) return;
          const baseJ = j * 5;
          const dx = ax - nodes[baseJ];
          const dy = ay - nodes[baseJ + 1];
          const distSq = dx * dx + dy * dy;
          if (distSq < CONNECTION_DIST_SQ) {
            const dist = Math.sqrt(distSq);
            const factor = 1 - dist / CONNECTION_DIST;
            const bc = COLORS[ci[j]];
            const mixR = (ac.r + bc.r) >> 1;
            const mixG = (ac.g + bc.g) >> 1;
            const mixB = (ac.b + bc.b) >> 1;
            ctx.strokeStyle = `rgba(${mixR},${mixG},${mixB},${(factor * 0.7).toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(nodes[baseJ], nodes[baseJ + 1]);
            ctx.stroke();
          }
        });
      }

      // Phase 4: Draw nodes using pre-rendered sprites
      for (let i = 0; i < NODE_COUNT; i++) {
        const base = i * 5;
        const x = nodes[base];
        const y = nodes[base + 1];
        const r = nodes[base + 4];
        const key = `${ci[i]}_${quantizeRadius(r)}`;
        const sprite = spriteRef.current.get(key);
        if (sprite) {
          ctx.globalAlpha = br[i];
          const half = sprite.width / 2;
          ctx.drawImage(sprite, x - half, y - half);
        }
      }
      ctx.globalAlpha = 1;

      if (RENDER_PROFILE !== 'efficient') {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    if (RENDER_PROFILE !== 'efficient') {
      animRef.current = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const isGray = themeMode === 'gray';

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{ backgroundColor: isGray ? '#1c2128' : BG_COLOR }}
    >
      {/* Ambient gradients — reduced from 7 to 4, no animation */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: '-10%',
          background: isGray
            ? `
              radial-gradient(circle at 5% 5%, rgba(0, 118, 255, 0.06) 0%, transparent 60%),
              radial-gradient(circle at 95% 5%, rgba(255, 59, 48, 0.06) 0%, transparent 60%),
              radial-gradient(circle at 5% 95%, rgba(48, 209, 88, 0.06) 0%, transparent 60%),
              radial-gradient(circle at 95% 95%, rgba(0, 180, 255, 0.05) 0%, transparent 60%)
            `
            : `
              radial-gradient(circle at 5% 5%, rgba(0, 118, 255, 0.10) 0%, transparent 60%),
              radial-gradient(circle at 95% 5%, rgba(255, 59, 48, 0.10) 0%, transparent 60%),
              radial-gradient(circle at 5% 95%, rgba(48, 209, 88, 0.10) 0%, transparent 60%),
              radial-gradient(circle at 95% 95%, rgba(0, 180, 255, 0.08) 0%, transparent 60%)
            `,
        }} />
      </div>

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          zIndex: 2, pointerEvents: 'none',
          opacity: 0.7,
        }}
      />
    </div>
  );
};
