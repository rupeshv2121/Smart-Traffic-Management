import * as THREE from 'three';

// Procedural canvas textures so the scene ships with no image assets while
// still looking far more realistic than flat-coloured boxes. Each builder is
// memoised by the modules that use it; textures are cheap to clone (they share
// the underlying canvas image) when per-mesh repeat counts are needed.

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Deterministic pseudo-random so textures are stable across reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let asphaltCache: THREE.Texture | null = null;
export function asphaltTexture(): THREE.Texture {
  if (asphaltCache) return asphaltCache;
  const { canvas, ctx } = makeCanvas(256);
  const rand = mulberry32(7);
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(0, 0, 256, 256);
  // Fine aggregate speckle.
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.floor(rand() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v + 3},${0.25 + rand() * 0.35})`;
    const x = rand() * 256;
    const y = rand() * 256;
    const s = rand() * 1.6 + 0.3;
    ctx.fillRect(x, y, s, s);
  }
  // Subtle oil/wear patches.
  for (let i = 0; i < 18; i++) {
    const g = ctx.createRadialGradient(rand() * 256, rand() * 256, 2, rand() * 256, rand() * 256, 20 + rand() * 40);
    g.addColorStop(0, 'rgba(20,20,22,0.18)');
    g.addColorStop(1, 'rgba(20,20,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  asphaltCache = toTexture(canvas);
  return asphaltCache;
}

let groundCache: THREE.Texture | null = null;
export function groundTexture(): THREE.Texture {
  if (groundCache) return groundCache;
  const { canvas, ctx } = makeCanvas(256);
  const rand = mulberry32(19);
  ctx.fillStyle = '#5d7a3a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const greens = [
      [78, 104, 48],
      [92, 120, 56],
      [66, 90, 42],
      [104, 128, 62],
    ][Math.floor(rand() * 4)];
    ctx.fillStyle = `rgba(${greens[0]},${greens[1]},${greens[2]},${0.4 + rand() * 0.4})`;
    ctx.fillRect(rand() * 256, rand() * 256, rand() * 2 + 0.5, rand() * 2 + 0.5);
  }
  // A few dusty bare patches (Delhi summer ground).
  for (let i = 0; i < 10; i++) {
    const g = ctx.createRadialGradient(rand() * 256, rand() * 256, 2, rand() * 256, rand() * 256, 18 + rand() * 30);
    g.addColorStop(0, 'rgba(150,130,90,0.28)');
    g.addColorStop(1, 'rgba(150,130,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  groundCache = toTexture(canvas);
  return groundCache;
}

let sidewalkCache: THREE.Texture | null = null;
export function sidewalkTexture(): THREE.Texture {
  if (sidewalkCache) return sidewalkCache;
  const { canvas, ctx } = makeCanvas(128);
  ctx.fillStyle = '#9a9a93';
  ctx.fillRect(0, 0, 128, 128);
  // Paver grout lines.
  ctx.strokeStyle = 'rgba(70,70,66,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const rand = mulberry32(3);
  for (let i = 0; i < 1500; i++) {
    const v = 130 + Math.floor(rand() * 40);
    ctx.fillStyle = `rgba(${v},${v},${v - 6},0.3)`;
    ctx.fillRect(rand() * 128, rand() * 128, 1, 1);
  }
  sidewalkCache = toTexture(canvas);
  return sidewalkCache;
}

// A reusable facade tile: a grid of glass windows on a neutral (white) wall so
// the building's material `color` tints the wall while glass stays bluish.
// Returns a fresh texture each call so callers can set per-building `repeat`.
export function facadeTexture(opts?: { lit?: boolean; seed?: number }): THREE.Texture {
  const lit = opts?.lit ?? false;
  const { canvas, ctx } = makeCanvas(256);
  const rand = mulberry32(opts?.seed ?? 42);

  // Wall base — near white so material.color does the tinting.
  ctx.fillStyle = '#f2f2f0';
  ctx.fillRect(0, 0, 256, 256);

  const cols = 4;
  const rows = 4;
  const cellW = 256 / cols;
  const cellH = 256 / rows;
  const winMarginX = cellW * 0.22;
  const winMarginY = cellH * 0.2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + winMarginX;
      const y = r * cellH + winMarginY;
      const w = cellW - winMarginX * 2;
      const h = cellH - winMarginY * 2;

      // Frame.
      ctx.fillStyle = '#cfcfca';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

      // Glass — slight per-window variation; some lit (warm) when `lit`.
      const isLit = lit && rand() > 0.45;
      if (isLit) {
        const warm = 200 + Math.floor(rand() * 55);
        ctx.fillStyle = `rgb(${warm},${Math.floor(warm * 0.82)},${Math.floor(warm * 0.45)})`;
      } else {
        const b = 70 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgb(${Math.floor(b * 0.7)},${Math.floor(b * 0.85)},${b + 25})`;
      }
      ctx.fillRect(x, y, w, h);

      // Mullion cross.
      ctx.strokeStyle = 'rgba(180,180,178,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w / 2 + w / 2, y + h / 2);
      ctx.stroke();
    }
  }

  return toTexture(canvas);
}
