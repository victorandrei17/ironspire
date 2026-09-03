import type { SpriteKey } from './spriteKeys.gen.ts';
import type { Atlas } from './atlas.ts';
import { getRasterisedPlaceholder } from './placeholders.ts';

/**
 * The ONE function that puts a sprite on screen (SPEC §13.1).
 *
 * Resolution order: atlas frame → procedural placeholder → magenta box with a
 * single warning. No gameplay code may call ctx.drawImage; it calls this.
 *
 * The world transform is held here as six numbers and composed per draw with a
 * single setTransform. save()/restore() would cost more than the blit itself
 * (SPEC §16.4 rule 3).
 */

let atlas: Atlas | null = null;

/** World→device matrix, set once per frame by the renderer. */
let wa = 1;
let wb = 0;
let wc = 0;
let wd = 1;
let we = 0;
let wf = 0;

const missing = new Set<string>();

export function setAtlas(next: Atlas | null): void {
  atlas = next;
}

export function getAtlas(): Atlas | null {
  return atlas;
}

/** Sets the world→device transform for subsequent draws. */
export function setWorldTransform(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): void {
  wa = a;
  wb = b;
  wc = c;
  wd = d;
  we = e;
  wf = f;
}

/** Restores the plain world transform on the context (for non-sprite drawing). */
export function applyWorldTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(wa, wb, wc, wd, we, wf);
}

/**
 * Draws `key` at world position (x, y).
 *
 * @param rot   radians; sprites are authored pointing right (SPEC §13.7)
 * @param scale multiplier on the sprite's nominal size
 * @param alpha 0..1
 * @param flash 0..1 white overlay, used for hit feedback
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  key: SpriteKey,
  x: number,
  y: number,
  rot = 0,
  scale = 1,
  alpha = 1,
  flash = 0,
): void {
  if (alpha <= 0) return;

  // Local TRS, then composed with the world matrix by hand.
  const cos = rot === 0 ? 1 : Math.cos(rot);
  const sin = rot === 0 ? 0 : Math.sin(rot);
  const la = cos * scale;
  const lb = sin * scale;
  const lc = -sin * scale;
  const ld = cos * scale;

  const ma = wa * la + wc * lb;
  const mb = wb * la + wd * lb;
  const mc = wa * lc + wc * ld;
  const md = wb * lc + wd * ld;
  const me = wa * x + wc * y + we;
  const mf = wb * x + wd * y + wf;

  ctx.setTransform(ma, mb, mc, md, me, mf);
  if (alpha !== 1) ctx.globalAlpha = alpha;

  const frame = atlas !== null && atlas.image !== null ? atlas.get(key) : undefined;
  if (frame !== undefined && atlas !== null && atlas.image !== null) {
    const inv = 1 / atlas.scale;
    const dw = frame.sw * inv;
    const dh = frame.sh * inv;
    const dx = frame.ox * inv - frame.px * frame.w * inv;
    const dy = frame.oy * inv - frame.py * frame.h * inv;
    ctx.drawImage(atlas.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
    if (flash > 0 && atlas.maskImage !== null) {
      ctx.globalAlpha = alpha * flash;
      ctx.drawImage(atlas.maskImage, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
    }
  } else {
    const ph = getRasterisedPlaceholder(key);
    if (ph !== null) {
      // The raster canvas is 2 device px per world unit plus padding on each side.
      const dw = ph.px * 0.5;
      const half = dw * 0.5;
      ctx.drawImage(ph.canvas, 0, 0, ph.px, ph.px, -half, -half, dw, dw);
      if (flash > 0) {
        ctx.globalAlpha = alpha * flash;
        ctx.drawImage(ph.mask, 0, 0, ph.px, ph.px, -half, -half, dw, dw);
      }
    } else {
      warnMissing(key);
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(-8, -8, 16, 16);
    }
  }

  if (alpha !== 1 || flash > 0) ctx.globalAlpha = 1;
}

function warnMissing(key: string): void {
  if (missing.has(key)) return;
  missing.add(key);
  console.warn(`[sprite] no atlas frame and no placeholder for "${key}"`);
}

/** Keys that fell through to the magenta box. Read by the sprite-contract test. */
export function missingSpriteKeys(): string[] {
  return [...missing];
}

export function resetMissingSpriteKeys(): void {
  missing.clear();
}
