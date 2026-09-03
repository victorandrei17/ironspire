import { Pool } from '../core/pool.ts';

/**
 * Telegraphs and ground hazards (SPEC §5.2).
 *
 * One pool covers both because they are the same thing at different times: a
 * hazard spends its first `telegraphT` seconds harmless and visible, then
 * becomes active. Keeping them together means a telegraph can never be drawn
 * without the effect that follows it existing.
 */
export const HAZARD = {
  /** Warning only; disappears when its timer runs out. */
  Telegraph: 0,
  /** Damages the tower while it overlaps. */
  Zone: 1,
} as const;

export const HAZARD_CAP = 24;

export class HazardPool extends Pool {
  readonly x = new Float32Array(this.cap);
  readonly y = new Float32Array(this.cap);
  readonly radius = new Float32Array(this.cap);
  readonly life = new Float32Array(this.cap);
  readonly lifeMax = new Float32Array(this.cap);
  /** Seconds of warning left before the hazard turns live. */
  readonly telegraphT = new Float32Array(this.cap);
  readonly telegraphMax = new Float32Array(this.cap);
  readonly damage = new Float32Array(this.cap);
  readonly tickT = new Float32Array(this.cap);
  readonly kind = new Uint8Array(this.cap);

  constructor(cap = HAZARD_CAP) {
    super(cap);
  }

  spawn(
    x: number,
    y: number,
    radius: number,
    telegraph: number,
    life: number,
    damage: number,
    kind: number,
  ): number {
    const i = this.alloc();
    if (i < 0) return -1;
    this.x[i] = x;
    this.y[i] = y;
    this.radius[i] = radius;
    this.telegraphT[i] = telegraph;
    this.telegraphMax[i] = telegraph;
    this.life[i] = life;
    this.lifeMax[i] = life;
    this.damage[i] = damage;
    this.tickT[i] = 0;
    this.kind[i] = kind;
    return i;
  }

  /** True while the hazard is still only a warning. */
  isTelegraphing(i: number): boolean {
    return (this.telegraphT[i] ?? 0) > 0;
  }
}
