/**
 * Procedural placeholders (SPEC §13.2).
 *
 * These are not grey boxes: each one carries the archetype's silhouette and
 * colour from SPEC §5.1, so pillar P5 (instant readability) holds before a
 * single PNG exists.
 *
 * Each shape is rasterised ONCE into an offscreen canvas and blitted from then
 * on. That keeps vector path work out of the frame entirely and makes the
 * "no art" path exactly as cheap as the "art" path.
 */

export type PlaceholderDraw = (ctx: CanvasRenderingContext2D, size: number) => void;

export type PlaceholderDef = {
  /** Nominal footprint in world units (SPEC §13.7 grid). */
  size: number;
  draw: PlaceholderDraw;
};

/** Raster resolution: 2 device px per world unit, matching MAX_DPR. */
const RASTER = 2;
/** Room for the outline and any glow to not clip at the canvas edge. */
const PAD = 4;

const exact = new Map<string, PlaceholderDef>();
const prefixed: { prefix: string; def: PlaceholderDef }[] = [];

/**
 * Registers a placeholder. A trailing `*` makes it a prefix pattern:
 * `'enemy/grunt/*'` covers every frame of every grunt animation.
 */
export function registerPlaceholder(pattern: string, size: number, draw: PlaceholderDraw): void {
  const def: PlaceholderDef = { size, draw };
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    const existing = prefixed.findIndex((p) => p.prefix === prefix);
    if (existing >= 0) prefixed[existing] = { prefix, def };
    else prefixed.push({ prefix, def });
    // Longest prefix wins, so keep the list sorted once instead of per lookup.
    prefixed.sort((a, b) => b.prefix.length - a.prefix.length);
  } else {
    exact.set(pattern, def);
  }
}

/** Exact match first, then the longest matching prefix. Pure — safe to unit test. */
export function resolvePlaceholder(key: string): PlaceholderDef | undefined {
  const hit = exact.get(key);
  if (hit !== undefined) return hit;
  for (let i = 0; i < prefixed.length; i++) {
    const p = prefixed[i];
    if (p !== undefined && key.startsWith(p.prefix)) return p.def;
  }
  return undefined;
}

/** Test-only: forgets every registration. */
export function clearPlaceholders(): void {
  exact.clear();
  prefixed.length = 0;
}

export function placeholderCount(): number {
  return exact.size + prefixed.length;
}

// ---------------------------------------------------------------------------
// Raster cache
// ---------------------------------------------------------------------------

export type RasterisedPlaceholder = {
  canvas: HTMLCanvasElement;
  /** Solid-white silhouette of the same shape, used for the hit flash. */
  mask: HTMLCanvasElement;
  /** Nominal world size. */
  size: number;
  /** Canvas pixel size (square). */
  px: number;
};

const rasterCache = new Map<string, RasterisedPlaceholder | null>();

/** Rasterises (once) and returns the bitmap for `key`, or null if unregistered. */
export function getRasterisedPlaceholder(key: string): RasterisedPlaceholder | null {
  const cached = rasterCache.get(key);
  if (cached !== undefined) return cached;

  const def = resolvePlaceholder(key);
  if (def === undefined) {
    rasterCache.set(key, null);
    return null;
  }

  const px = Math.ceil(def.size * RASTER) + PAD * 2;
  const canvas = makeCanvas(px);
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    rasterCache.set(key, null);
    return null;
  }
  ctx.setTransform(RASTER, 0, 0, RASTER, px / 2, px / 2);
  def.draw(ctx, def.size);

  // White silhouette: reuse the drawn alpha instead of asking every shape to
  // know how to draw itself in white.
  const mask = makeCanvas(px);
  const mctx = mask.getContext('2d');
  if (mctx !== null) {
    mctx.drawImage(canvas, 0, 0);
    mctx.globalCompositeOperation = 'source-in';
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(0, 0, px, px);
  }

  const out: RasterisedPlaceholder = { canvas, mask, size: def.size, px };
  rasterCache.set(key, out);
  return out;
}

/** Drops every rasterised bitmap — called when the UI scale or palette changes. */
export function invalidatePlaceholderRaster(): void {
  rasterCache.clear();
}

function makeCanvas(px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  return c;
}

// ---------------------------------------------------------------------------
// Shape helpers — all draw centred on the origin, in world units
// ---------------------------------------------------------------------------

/** Outline width in world units. Reads as the 2px outline of SPEC §13.7 at 1x. */
const OUTLINE = 1.8;

function stroked(ctx: CanvasRenderingContext2D, fill: string, line: string): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.stroke();
}

export function circle(ctx: CanvasRenderingContext2D, r: number, fill: string, line: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  stroked(ctx, fill, line);
}

/** Regular polygon with `sides` vertices, circumradius `r`. */
export function poly(
  ctx: CanvasRenderingContext2D,
  sides: number,
  r: number,
  fill: string,
  line: string,
  rot = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  stroked(ctx, fill, line);
}

/** Isoceles triangle pointing right (0 rad), as the art direction requires. */
export function tri(ctx: CanvasRenderingContext2D, r: number, fill: string, line: string): void {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, r * 0.8);
  ctx.lineTo(-r * 0.7, -r * 0.8);
  ctx.closePath();
  stroked(ctx, fill, line);
}

export function rect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fill: string,
  line: string,
  radius = 0,
): void {
  ctx.beginPath();
  if (radius > 0) ctx.roundRect(-w / 2, -h / 2, w, h, radius);
  else ctx.rect(-w / 2, -h / 2, w, h);
  stroked(ctx, fill, line);
}

export function diamond(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fill: string,
  line: string,
): void {
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(0, h / 2);
  ctx.lineTo(-w / 2, 0);
  ctx.lineTo(0, -h / 2);
  ctx.closePath();
  stroked(ctx, fill, line);
}

export function cross(
  ctx: CanvasRenderingContext2D,
  arm: number,
  thick: number,
  fill: string,
  line: string,
): void {
  const t = thick / 2;
  ctx.beginPath();
  ctx.moveTo(-t, -arm);
  ctx.lineTo(t, -arm);
  ctx.lineTo(t, -t);
  ctx.lineTo(arm, -t);
  ctx.lineTo(arm, t);
  ctx.lineTo(t, t);
  ctx.lineTo(t, arm);
  ctx.lineTo(-t, arm);
  ctx.lineTo(-t, t);
  ctx.lineTo(-arm, t);
  ctx.lineTo(-arm, -t);
  ctx.lineTo(-t, -t);
  ctx.closePath();
  stroked(ctx, fill, line);
}

/** Rounded top, scalloped bottom — reads as a ghost at a glance. */
export function ghost(ctx: CanvasRenderingContext2D, r: number, fill: string, line: string): void {
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r * 0.85, Math.PI, 0);
  const bottom = r * 0.9;
  const lobes = 3;
  const span = (r * 1.7) / lobes;
  let x = r * 0.85;
  ctx.lineTo(x, bottom - span * 0.4);
  for (let i = 0; i < lobes; i++) {
    ctx.quadraticCurveTo(x - span * 0.5, bottom + span * 0.5, x - span, bottom - span * 0.4);
    x -= span;
  }
  ctx.closePath();
  stroked(ctx, fill, line);
}

/** Filled ring — cheap glow substitute, since shadowBlur is banned (SPEC §16.4). */
export function ring(
  ctx: CanvasRenderingContext2D,
  r: number,
  thick: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = thick;
  ctx.strokeStyle = color;
  ctx.stroke();
}
