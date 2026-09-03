/**
 * Pre-rendered glyph sheet for floating numbers (SPEC §16.4 rule 6).
 *
 * `fillText` per damage number is one of the most expensive things you can do
 * on a 2D canvas — 120 of them a frame would eat the whole budget. We rasterise
 * the glyph set once and blit.
 *
 * This file and `drawSprite.ts` / `vfx.ts` are the only places allowed to call
 * `ctx.drawImage` on the game context; the enforcing test lives in
 * `tests/render/spriteContract.test.ts`.
 */

const GLYPHS = '0123456789.,+-KMBTQ!x%';
const GLYPH_H = 22;
const PAD = 2;

/** Row index per colour. Kept as constants so callers never build strings. */
export const DIGIT_WHITE = 0;
export const DIGIT_CRIT = 1;
export const DIGIT_DAMAGE = 2;
export const DIGIT_HEAL = 3;
export const DIGIT_GOLD = 4;

const ROW_COLORS = ['#ffffff', '#ffe08a', '#ff8a80', '#9dfacd', '#f2c14e'] as const;
const ROW_OUTLINE = '#0a0d13';

type Sheet = {
  canvas: HTMLCanvasElement;
  /** Per-glyph x offset and width in sheet pixels, indexed by GLYPHS position. */
  xs: Float32Array;
  ws: Float32Array;
  h: number;
};

let sheet: Sheet | null = null;

/** Builds the sheet on first use. Safe to call repeatedly. */
export function ensureDigitAtlas(): Sheet | null {
  if (sheet !== null) return sheet;
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  if (pctx === null) return null;

  const font = `700 ${GLYPH_H}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  pctx.font = font;

  const xs = new Float32Array(GLYPHS.length);
  const ws = new Float32Array(GLYPHS.length);
  let x = PAD;
  for (let i = 0; i < GLYPHS.length; i++) {
    const w = Math.ceil(pctx.measureText(GLYPHS[i] ?? '0').width) + PAD * 2;
    xs[i] = x;
    ws[i] = w;
    x += w;
  }

  const rowH = GLYPH_H + PAD * 4;
  const canvas = document.createElement('canvas');
  canvas.width = x + PAD;
  canvas.height = rowH * ROW_COLORS.length;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;

  for (let r = 0; r < ROW_COLORS.length; r++) {
    const cy = r * rowH + rowH / 2;
    ctx.strokeStyle = ROW_OUTLINE;
    ctx.fillStyle = ROW_COLORS[r] ?? '#fff';
    for (let i = 0; i < GLYPHS.length; i++) {
      const g = GLYPHS[i] ?? '0';
      const gx = (xs[i] ?? 0) + PAD;
      ctx.strokeText(g, gx, cy);
      ctx.fillText(g, gx, cy);
    }
  }

  sheet = { canvas, xs, ws, h: rowH };
  return sheet;
}

/** Test hook: forget the cached sheet (e.g. after a font/UI-scale change). */
export function invalidateDigitAtlas(): void {
  sheet = null;
}

/** Scratch buffer for digit extraction — reused so drawNumber never allocates. */
const scratch = new Int32Array(24);

/**
 * Blits `text` centred at (x, y) in the *current* transform's space.
 * `text` must contain only characters present in GLYPHS.
 */
export function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  row: number,
): void {
  const s = ensureDigitAtlas();
  if (s === null) return;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const gi = GLYPHS.indexOf(text[i] ?? '');
    if (gi >= 0) total += s.ws[gi] ?? 0;
  }
  let cx = x - (total * scale) / 2;
  const sy = row * s.h;
  const dh = s.h * scale;
  const dy = y - dh / 2;
  for (let i = 0; i < text.length; i++) {
    const gi = GLYPHS.indexOf(text[i] ?? '');
    if (gi < 0) continue;
    const gw = s.ws[gi] ?? 0;
    ctx.drawImage(s.canvas, s.xs[gi] ?? 0, sy, gw, s.h, cx, dy, gw * scale, dh);
    cx += gw * scale;
  }
}

/**
 * Blits a non-negative integer without building a string — the hot path for
 * damage numbers. Values >= 100000 are shown abbreviated with a K/M suffix.
 */
export function drawInt(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
  scale: number,
  row: number,
  prefixPlus = false,
): void {
  const s = ensureDigitAtlas();
  if (s === null) return;

  let v = Math.max(0, Math.round(value));
  let suffixIdx = -1;
  if (v >= 1_000_000_000) {
    v = Math.round(v / 1_000_000_000);
    suffixIdx = GLYPHS.indexOf('B');
  } else if (v >= 1_000_000) {
    v = Math.round(v / 1_000_000);
    suffixIdx = GLYPHS.indexOf('M');
  } else if (v >= 100_000) {
    v = Math.round(v / 1000);
    suffixIdx = GLYPHS.indexOf('K');
  }

  let n = 0;
  if (v === 0) scratch[n++] = GLYPHS.indexOf('0');
  while (v > 0 && n < scratch.length - 2) {
    scratch[n++] = v % 10; // digit glyph indices are 0..9 by construction
    v = Math.floor(v / 10);
  }
  // scratch currently holds the digits reversed.
  let total = 0;
  const plusIdx = prefixPlus ? GLYPHS.indexOf('+') : -1;
  if (plusIdx >= 0) total += s.ws[plusIdx] ?? 0;
  for (let i = 0; i < n; i++) total += s.ws[scratch[i] ?? 0] ?? 0;
  if (suffixIdx >= 0) total += s.ws[suffixIdx] ?? 0;

  let cx = x - (total * scale) / 2;
  const sy = row * s.h;
  const dh = s.h * scale;
  const dy = y - dh / 2;

  if (plusIdx >= 0) {
    const gw = s.ws[plusIdx] ?? 0;
    ctx.drawImage(s.canvas, s.xs[plusIdx] ?? 0, sy, gw, s.h, cx, dy, gw * scale, dh);
    cx += gw * scale;
  }
  for (let i = n - 1; i >= 0; i--) {
    const gi = scratch[i] ?? 0;
    const gw = s.ws[gi] ?? 0;
    ctx.drawImage(s.canvas, s.xs[gi] ?? 0, sy, gw, s.h, cx, dy, gw * scale, dh);
    cx += gw * scale;
  }
  if (suffixIdx >= 0) {
    const gw = s.ws[suffixIdx] ?? 0;
    ctx.drawImage(s.canvas, s.xs[suffixIdx] ?? 0, sy, gw, s.h, cx, dy, gw * scale, dh);
  }
}
