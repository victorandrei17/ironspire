import { Pool } from '../core/pool.ts';
import { PARTICLE_CAP } from '../core/constants.ts';
import type { SpriteKey } from '../render/spriteKeys.gen.ts';

/**
 * Cosmetic-only pool. When it is full the oldest particle is stolen rather than
 * the spawn refused: a missing spark nobody notices beats a growing pool
 * (SPEC §12.4).
 */
export class ParticlePool extends Pool {
  readonly x = new Float32Array(this.cap);
  readonly y = new Float32Array(this.cap);
  readonly prevX = new Float32Array(this.cap);
  readonly prevY = new Float32Array(this.cap);
  readonly vx = new Float32Array(this.cap);
  readonly vy = new Float32Array(this.cap);
  readonly rot = new Float32Array(this.cap);
  readonly rotVel = new Float32Array(this.cap);
  readonly scale = new Float32Array(this.cap);
  readonly scaleVel = new Float32Array(this.cap);
  readonly alpha = new Float32Array(this.cap);
  readonly flash = new Float32Array(this.cap);
  readonly life = new Float32Array(this.cap);
  readonly lifeMax = new Float32Array(this.cap);
  readonly drag = new Float32Array(this.cap);
  readonly spriteIdx = new Uint16Array(this.cap);

  keys: readonly SpriteKey[] = [];

  /** Round-robin cursor for stealing a slot when the pool is saturated. */
  private stealCursor = 0;

  /**
   * Share of requested particles actually created, driven by the quality
   * monitor. Enforced HERE rather than at each effect, so no VFX site can
   * forget it and no gameplay code ever learns quality settings exist.
   */
  share = 1;
  /** Deterministic dither: 3 of every 10 at share 0.3, not a coin flip. */
  private dither = 0;

  constructor(cap = PARTICLE_CAP) {
    super(cap);
    this.scale.fill(1);
    this.alpha.fill(1);
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    scale: number,
    spriteIdx: number,
  ): number {
    if (this.share < 1) {
      this.dither += this.share;
      if (this.dither < 1) return -1;
      this.dither -= 1;
    }
    let i = this.alloc();
    if (i < 0) {
      i = this.stealCursor % this.cap;
      this.stealCursor = (this.stealCursor + 1) % this.cap;
      this.free(i);
      i = this.alloc();
      if (i < 0) return -1;
    }
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = x;
    this.prevY[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.rot[i] = 0;
    this.rotVel[i] = 0;
    this.scale[i] = scale;
    this.scaleVel[i] = 0;
    this.alpha[i] = 1;
    this.flash[i] = 0;
    this.life[i] = life;
    this.lifeMax[i] = life;
    this.drag[i] = 0;
    this.spriteIdx[i] = spriteIdx;
    return i;
  }
}
