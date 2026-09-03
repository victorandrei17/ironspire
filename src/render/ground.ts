import { VW, VH, TOWER_X, TOWER_Y, ARENA_TINT_R } from '../core/constants.ts';

/**
 * The arena floor, drawn once into an offscreen canvas and blitted every frame
 * (SPEC §16.4 rule 4). Redrawing a grid plus a radial gradient per frame is
 * hundreds of path operations for a picture that never changes.
 */
export class Ground {
  private canvas: HTMLCanvasElement | null = null;
  private builtScale = 0;

  /** Rebuilds only when the device pixel scale actually changed. */
  ensure(pixelScale: number): HTMLCanvasElement | null {
    if (this.canvas !== null && this.builtScale === pixelScale) return this.canvas;
    const w = Math.ceil(VW * pixelScale);
    const h = Math.ceil(VH * pixelScale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx === null) return null;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);

    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, VW, VH);

    // Radial tint centred on the tower: draws the eye inward and marks the
    // arena edge without a hard line.
    const g = ctx.createRadialGradient(TOWER_X, TOWER_Y, 40, TOWER_X, TOWER_Y, ARENA_TINT_R);
    g.addColorStop(0, 'rgba(46,62,86,0.55)');
    g.addColorStop(0.55, 'rgba(24,32,46,0.35)');
    g.addColorStop(1, 'rgba(8,10,15,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    ctx.strokeStyle = 'rgba(120,150,190,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= VW; x += 60) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VH);
    }
    for (let y = 0; y <= VH; y += 60) {
      ctx.moveTo(0, y);
      ctx.lineTo(VW, y);
    }
    ctx.stroke();

    // Concentric rings around the tower: free depth cue and a distance ruler
    // the player reads without being told.
    ctx.strokeStyle = 'rgba(140,180,230,0.06)';
    for (let r = 100; r <= ARENA_TINT_R; r += 100) {
      ctx.beginPath();
      ctx.arc(TOWER_X, TOWER_Y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Vignette at the screen edge, so enemies entering are silhouetted.
    const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VW, VH);

    this.canvas = c;
    this.builtScale = pixelScale;
    return c;
  }
}
