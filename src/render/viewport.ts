import { VW, VH, MAX_DPR } from '../core/constants.ts';

/**
 * Maps the virtual 720x1280 world onto whatever screen we got, letterboxed.
 *
 * Layout is read ONCE per resize and cached — reading offsetWidth inside the
 * frame forces a synchronous layout and costs more than the draw (CLAUDE.md §9).
 */
export class Viewport {
  /** CSS pixels of the canvas element. */
  cssW = 0;
  cssH = 0;
  /** Backing store size = css * dpr. */
  pixelW = 0;
  pixelH = 0;
  dpr = 1;
  /** World unit → CSS pixel factor. */
  scale = 1;
  /** Letterbox offset in CSS pixels (world origin lands here). */
  offsetX = 0;
  offsetY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Recomputes from the current window size. Call on resize/orientationchange only. */
  resize(w: number, h: number, devicePixelRatio: number): boolean {
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    const scale = Math.min(w / VW, h / VH);
    const pixelW = Math.round(w * dpr);
    const pixelH = Math.round(h * dpr);
    if (
      this.cssW === w &&
      this.cssH === h &&
      this.dpr === dpr &&
      this.pixelW === pixelW &&
      this.pixelH === pixelH
    ) {
      return false;
    }
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.scale = scale;
    this.pixelW = pixelW;
    this.pixelH = pixelH;
    this.offsetX = (w - VW * scale) * 0.5;
    this.offsetY = (h - VH * scale) * 0.5;

    // Sizing the backing store via CSS would blur the game; set width/height.
    this.canvas.width = pixelW;
    this.canvas.height = pixelH;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    return true;
  }

  /** Screen (CSS px, relative to canvas) → world units. */
  screenToWorldX(sx: number): number {
    return (sx - this.offsetX) / this.scale;
  }

  screenToWorldY(sy: number): number {
    return (sy - this.offsetY) / this.scale;
  }

  worldToScreenX(wx: number): number {
    return wx * this.scale + this.offsetX;
  }

  worldToScreenY(wy: number): number {
    return wy * this.scale + this.offsetY;
  }
}
