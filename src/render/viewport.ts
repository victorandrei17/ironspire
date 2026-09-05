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

  /**
   * Slides the world vertically so `worldY` lands on `screenY` (CSS px).
   *
   * Used to sit the tower in the middle of the strip the HUD leaves free, which
   * is not the middle of the screen: the panel owns the bottom third. Clamped so
   * the arena never pulls away from an edge it was covering — on a screen short
   * enough to show the whole world, it stays centred and this does nothing.
   */
  setVerticalFocus(worldY: number, screenY: number): void {
    const worldH = VH * this.scale;
    const want = screenY - worldY * this.scale;
    // The slack runs one way or the other depending on which is taller. A world
    // taller than the screen may only slide up (offsets in [cssH - worldH, 0]);
    // a shorter one may only slide down, inside its own letterbox.
    const lo = Math.min(0, this.cssH - worldH);
    const hi = Math.max(0, this.cssH - worldH);
    this.offsetY = Math.min(hi, Math.max(lo, want));
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
