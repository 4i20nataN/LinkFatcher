import { useEffect, useRef } from 'react';
import { RENDER_PROFILE } from '../core/perf/renderProfile';

/**
 * NeuralConstellationBackground — Light/White theme ambient particle animation.
 * Production-optimized: zero mouse interaction, zero CSS filters on depth waves.
 *
 * Performance profile:
 * - Float32Array typed arrays (zero GC, cache-friendly)
 * - Spatial grid hashing O(N·k) neighbor queries
 * - Single composite canvas (eliminates dual-canvas overhead)
 * - Pre-rendered sprite atlas (single drawImage per node)
 * - Frame budget limiting (60fps / 30fps reduced-motion)
 * - Visibility API pause on hidden tab
 * - Debounced resize (150ms)
 * - prefers-reduced-motion support
 * - No mouse/touch interaction (pure ambient animation)
 */

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFIG = {
  nodeCount: prefersReducedMotion ? 40 : RENDER_PROFILE === 'efficient' ? 45 : 75,
  connectionDist: 155,
  connectionDistSq: 155 * 155,
  velocity: 0.35,
  nodeBaseRadius: 1.8,
  nodeRadiusVariance: 2.2,
  twoPi: Math.PI * 2,
  glowRadiusMult: 6.5,
  structuralLineWidth: 1.3,
  glowLineWidthMult: 2.2,
  frameBudget: prefersReducedMotion || RENDER_PROFILE === 'efficient' ? 33.33 : 16.67,
  // STATIC: efficient profile paints a single settled frame and stops (see NeuralBlackBackground).
};

const CORE_COLOR = 'rgba(255, 255, 255, 1)';
const HALO_COLOR = 'rgba(255, 255, 255, 0.6)';

// Typed array layout per node: [x, y, vx, vy, baseRadius, radius, glowIntensity, pulseDir]
const NODE_STRIDE = 8;
const OFF_X = 0, OFF_Y = 1, OFF_VX = 2, OFF_VY = 3, OFF_BR = 4, OFF_R = 5, OFF_GLOW = 6, OFF_PULSE = 7;

const CELL_SIZE = CONFIG.connectionDist;

class SpatialGrid {
  private cellMap = new Map<number, number[]>();
  private w = 0;
  private h = 0;

  setDimensions(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  clear() { this.cellMap.clear(); }

  private key(gx: number, gy: number): number {
    return (gy * this.w + gx) | 0;
  }

  insert(idx: number, x: number, y: number) {
    const gx = (x / CELL_SIZE) | 0;
    const gy = (y / CELL_SIZE) | 0;
    const k = this.key(gx, gy);
    let cell = this.cellMap.get(k);
    if (!cell) { cell = []; this.cellMap.set(k, cell); }
    cell.push(idx);
  }

  queryNeighbors(x: number, y: number, fn: (idx: number) => void) {
    const gx = (x / CELL_SIZE) | 0;
    const gy = (y / CELL_SIZE) | 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cellMap.get(this.key(gx + dx, gy + dy));
        if (cell) {
          for (let k = 0, len = cell.length; k < len; k++) fn(cell[k]);
        }
      }
    }
  }
}

function createSpriteAtlas(baseRadius: number, glowRadiusMult: number): HTMLCanvasElement {
  const nodePad = (baseRadius + 3) * glowRadiusMult + 8;
  const nodeSize = Math.ceil(nodePad * 2);
  const glowR = baseRadius * glowRadiusMult;
  const glowSize = Math.ceil(glowR * 2 + 4);
  const atlasW = nodeSize + glowSize;
  const atlasH = Math.max(nodeSize, glowSize);

  const atlas = document.createElement('canvas');
  atlas.width = atlasW;
  atlas.height = atlasH;
  const ctx = atlas.getContext('2d')!;

  const cx = nodePad;
  const cy = atlasH / 2;

  ctx.fillStyle = HALO_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius + 1.8, 0, CONFIG.twoPi);
  ctx.fill();

  ctx.fillStyle = CORE_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, CONFIG.twoPi);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(cx - baseRadius * 0.2, cy - baseRadius * 0.2, baseRadius * 0.3, 0, CONFIG.twoPi);
  ctx.fill();

  const gx = nodeSize + glowSize / 2;
  const gy = atlasH / 2;

  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
  grad.addColorStop(0, 'rgba(255, 246, 230, 0.90)');
  grad.addColorStop(0.2, 'rgba(255, 246, 230, 0.45)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(gx, gy, glowR, 0, CONFIG.twoPi);
  ctx.fill();

  return atlas;
}

export function NeuralConstellationBackground({ themeMode = 'light' }: { themeMode?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const nodesRef = useRef<Float32Array>(new Float32Array());
  const gridRef = useRef<SpatialGrid>(new SpatialGrid());
  const atlasRef = useRef<HTMLCanvasElement | null>(null);
  const wRef = useRef(0);
  const hRef = useRef(0);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })!;

    let w = 0;
    let h = 0;
    let painted = false;

    atlasRef.current = createSpriteAtlas(CONFIG.nodeBaseRadius, CONFIG.glowRadiusMult);
    const atlas = atlasRef.current;
    const nodeSpriteW = Math.ceil((CONFIG.nodeBaseRadius + 3) * CONFIG.glowRadiusMult * 2 + 16);
    const nodeSpriteH = atlas.height;
    const glowSpriteX = nodeSpriteW;
    const glowSpriteW = atlas.width - nodeSpriteW;
    const glowSpriteH = atlas.height;

    function initNodes(count: number): Float32Array {
      const arr = new Float32Array(count * NODE_STRIDE);
      for (let i = 0; i < count; i++) {
        const base = i * NODE_STRIDE;
        arr[base + OFF_X] = Math.random() * w;
        arr[base + OFF_Y] = Math.random() * h;
        arr[base + OFF_VX] = (Math.random() - 0.5) * CONFIG.velocity;
        arr[base + OFF_VY] = (Math.random() - 0.5) * CONFIG.velocity;
        const r = Math.random() * CONFIG.nodeRadiusVariance + CONFIG.nodeBaseRadius;
        arr[base + OFF_BR] = r;
        arr[base + OFF_R] = r;
        arr[base + OFF_GLOW] = Math.random() * 0.5 + 0.5;
        arr[base + OFF_PULSE] = Math.random() > 0.5 ? 0.01 : -0.01;
      }
      return arr;
    }

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      wRef.current = w;
      hRef.current = h;
      gridRef.current.setDimensions(w, h);
      nodesRef.current = initNodes(CONFIG.nodeCount);
      painted = false;
      animRef.current = requestAnimationFrame(animate);
    }

    function scheduleResize() {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(resize, 150);
    }

    resize();

    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
    };

    window.addEventListener('resize', scheduleResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    function drawStructuralLines(ctx: CanvasRenderingContext2D, nodes: Float32Array, count: number) {
      const cdSq = CONFIG.connectionDistSq;
      const grid = gridRef.current;

      for (let i = 0; i < count; i++) {
        const baseI = i * NODE_STRIDE;
        const ax = nodes[baseI + OFF_X];
        const ay = nodes[baseI + OFF_Y];

        grid.queryNeighbors(ax, ay, (j) => {
          if (j <= i) return;
          const baseJ = j * NODE_STRIDE;
          const dx = ax - nodes[baseJ + OFF_X];
          const dy = ay - nodes[baseJ + OFF_Y];
          const distSq = dx * dx + dy * dy;
          if (distSq < cdSq) {
            const dist = Math.sqrt(distSq);
            const factor = 1 - dist / CONFIG.connectionDist;
            const alpha = factor * 0.4;
            const lineWidth = factor * 1.3;

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(nodes[baseJ + OFF_X], nodes[baseJ + OFF_Y]);
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = `rgba(105, 118, 138, ${alpha})`;
            ctx.stroke();
          }
        });
      }
    }

    function drawGlowLines(ctx: CanvasRenderingContext2D, nodes: Float32Array, count: number) {
      const cdSq = CONFIG.connectionDistSq;
      const grid = gridRef.current;

      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < count; i++) {
        const baseI = i * NODE_STRIDE;
        const ax = nodes[baseI + OFF_X];
        const ay = nodes[baseI + OFF_Y];

        grid.queryNeighbors(ax, ay, (j) => {
          if (j <= i) return;
          const baseJ = j * NODE_STRIDE;
          const dx = ax - nodes[baseJ + OFF_X];
          const dy = ay - nodes[baseJ + OFF_Y];
          const distSq = dx * dx + dy * dy;
          if (distSq < cdSq) {
            const dist = Math.sqrt(distSq);
            const factor = 1 - dist / CONFIG.connectionDist;
            const alpha = factor * 0.55;
            const lineWidth = factor * 1.3 * 2.2;

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(nodes[baseJ + OFF_X], nodes[baseJ + OFF_Y]);
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = `rgba(255, 246, 230, ${alpha})`;
            ctx.stroke();
          }
        });
      }

      ctx.globalCompositeOperation = 'source-over';
    }

    function drawNodes(ctx: CanvasRenderingContext2D, nodes: Float32Array, count: number) {
      if (!atlas) return;

      for (let i = 0; i < count; i++) {
        const base = i * NODE_STRIDE;
        const x = nodes[base + OFF_X];
        const y = nodes[base + OFF_Y];
        const r = nodes[base + OFF_R];
        const scale = r / CONFIG.nodeBaseRadius;
        const drawW = nodeSpriteW * scale;
        const drawH = nodeSpriteH * scale;
        ctx.drawImage(atlas, 0, 0, nodeSpriteW, nodeSpriteH, x - drawW / 2, y - drawH / 2, drawW, drawH);
      }
    }

    function drawGlows(ctx: CanvasRenderingContext2D, nodes: Float32Array, count: number) {
      if (!atlas) return;

      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < count; i++) {
        const base = i * NODE_STRIDE;
        const x = nodes[base + OFF_X];
        const y = nodes[base + OFF_Y];
        const r = nodes[base + OFF_R];
        const glowIntensity = nodes[base + OFF_GLOW];
        const scale = (r / CONFIG.nodeBaseRadius) * (r / CONFIG.nodeBaseRadius);
        const drawW = glowSpriteW * scale;
        const drawH = glowSpriteH * scale;

        ctx.globalAlpha = 0.9 * glowIntensity;
        ctx.drawImage(atlas, glowSpriteX, 0, glowSpriteW, glowSpriteH, x - drawW / 2, y - drawH / 2, drawW, drawH);

        ctx.globalAlpha = 0.12 * glowIntensity;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.8, 0, CONFIG.twoPi);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function animate(timestamp: number) {
      if (RENDER_PROFILE === 'efficient') {
        if (painted) return;
        painted = true;
      } else {
        const elapsed = timestamp - lastFrameRef.current;
        if (elapsed < CONFIG.frameBudget) {
          animRef.current = requestAnimationFrame(animate);
          return;
        }
        lastFrameRef.current = timestamp;

        if (!visibleRef.current) {
          animRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      // NOTE: no willChange promotion — see NeuralBlackBackground.
      const nodes = nodesRef.current;
      const count = CONFIG.nodeCount;
      const grid = gridRef.current;
      w = wRef.current;
      h = hRef.current;

      ctx.clearRect(0, 0, w, h);

      // Phase 1: Update positions + pulse
      for (let i = 0; i < count; i++) {
        const base = i * NODE_STRIDE;

        let x = nodes[base + OFF_X] + nodes[base + OFF_VX];
        let y = nodes[base + OFF_Y] + nodes[base + OFF_VY];
        let vx = nodes[base + OFF_VX];
        let vy = nodes[base + OFF_VY];

        if (x < 0 || x > w) { vx *= -1; x = x < 0 ? 0 : w; }
        if (y < 0 || y > h) { vy *= -1; y = y < 0 ? 0 : h; }

        let glow = nodes[base + OFF_GLOW] + nodes[base + OFF_PULSE];
        if (glow > 1 || glow < 0.4) {
          nodes[base + OFF_PULSE] *= -1;
          glow = Math.max(0.4, Math.min(1, glow));
        }

        nodes[base + OFF_X] = x;
        nodes[base + OFF_Y] = y;
        nodes[base + OFF_VX] = vx;
        nodes[base + OFF_VY] = vy;
        nodes[base + OFF_GLOW] = glow;
      }

      // Phase 2: Build spatial grid
      grid.clear();
      for (let i = 0; i < count; i++) {
        const base = i * NODE_STRIDE;
        grid.insert(i, nodes[base + OFF_X], nodes[base + OFF_Y]);
      }

      // Phase 3-6: Draw
      drawStructuralLines(ctx, nodes, count);
      drawGlowLines(ctx, nodes, count);
      drawNodes(ctx, nodes, count);
      drawGlows(ctx, nodes, count);

      if (RENDER_PROFILE !== 'efficient') animRef.current = requestAnimationFrame(animate);
    }

    if (RENDER_PROFILE !== 'efficient') {
      animRef.current = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      window.removeEventListener('resize', scheduleResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const isBeige = themeMode === 'light';

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: isBeige
            ? `radial-gradient(circle at 10% 10%, #FAF6E8 0%, rgba(250,246,232,0) 70%), radial-gradient(circle at 90% 80%, #D8CEAF 0%, #C8BFA0 100%), #E8E0C8`
            : `radial-gradient(circle at 10% 10%, #f5f7fa 0%, rgba(245,247,250,0) 70%), radial-gradient(circle at 90% 80%, #c0c7d0 0%, #b5bdc8 100%), #d0d5de`,
        }}
      />

      {/* Depth waves — no drop-shadow, no clipPath, pure radial gradients */}
      <div className="absolute inset-0 z-[1]">
        <div
          className="absolute"
          style={{
            width: '150%', height: '150%', top: '-25%', left: '-25%',
            transform: 'rotate(-12deg)',
            opacity: 0.85,
            background: isBeige
              ? 'radial-gradient(ellipse at 30% 40%, rgba(250, 246, 232, 0.93) 0%, rgba(240, 234, 210, 0.88) 50%, rgba(210, 200, 175, 0.3) 100%)'
              : 'radial-gradient(ellipse at 30% 40%, rgba(242, 245, 250, 0.93) 0%, rgba(228, 232, 240, 0.88) 50%, rgba(185, 195, 208, 0.3) 100%)',
          }}
        />
        <div
          className="absolute"
          style={{
            width: '150%', height: '150%', top: '-25%', left: '-25%',
            transform: 'rotate(-12deg)',
            opacity: 0.85,
            background: isBeige
              ? 'radial-gradient(ellipse at 70% 60%, rgba(245, 240, 220, 0.82) 0%, rgba(232, 225, 200, 0.78) 60%, rgba(195, 185, 160, 0.4) 100%)'
              : 'radial-gradient(ellipse at 70% 60%, rgba(235, 240, 248, 0.82) 0%, rgba(218, 225, 236, 0.78) 60%, rgba(172, 184, 200, 0.4) 100%)',
          }}
        />
        <div
          className="absolute"
          style={{
            width: '150%', height: '150%', top: '-25%', left: '-25%',
            transform: 'rotate(-12deg)',
            opacity: 0.65,
            background: isBeige
              ? 'radial-gradient(ellipse at 50% 50%, rgba(250, 246, 235, 0.95) 0%, rgba(240, 234, 218, 0.88) 70%, rgba(215, 208, 188, 0.5) 100%)'
              : 'radial-gradient(ellipse at 50% 50%, rgba(245, 248, 252, 0.95) 0%, rgba(232, 238, 246, 0.88) 70%, rgba(200, 210, 222, 0.5) 100%)',
          }}
        />
      </div>

      {/* Canvas — particles only */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{ opacity: 0.95 }}
      />
    </div>
  );
}
