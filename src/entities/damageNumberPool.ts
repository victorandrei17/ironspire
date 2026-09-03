import { Pool } from '../core/pool.ts';
import { DMGNUM_CAP } from '../core/constants.ts';

/**
 * Colour rows in the digit atlas. They live here, not in `render/`, because
 * `systems/damage.ts` picks the colour when it queues a number and systems must
 * not import from render (CLAUDE.md §3).
 */
export const DIGIT_WHITE = 0;
export const DIGIT_CRIT = 1;
export const DIGIT_DAMAGE = 2;
export const DIGIT_HEAL = 3;
export const DIGIT_GOLD = 4;

/**
 * Floating damage numbers. Values are kept as numbers, never strings — the
 * digit atlas blits from the integer directly (SPEC §16.4 rule 6).
 */
export class DamageNumberPool extends Pool {
  readonly x = new Float32Array(this.cap);
  readonly y = new Float32Array(this.cap);
  readonly prevX = new Float32Array(this.cap);
  readonly prevY = new Float32Array(this.cap);
  readonly vx = new Float32Array(this.cap);
  readonly vy = new Float32Array(this.cap);
  readonly value = new Float32Array(this.cap);
  readonly life = new Float32Array(this.cap);
  readonly lifeMax = new Float32Array(this.cap);
  readonly scale = new Float32Array(this.cap);
  /** Row in the digit atlas: white / crit / damage-taken / heal / gold. */
  readonly row = new Uint8Array(this.cap);

  constructor(cap = DMGNUM_CAP) {
    super(cap);
    this.scale.fill(1);
  }

  spawn(x: number, y: number, value: number, row: number, scale: number): number {
    const i = this.alloc();
    if (i < 0) return -1;
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = x;
    this.prevY[i] = y;
    // Slight sideways drift so a burst of hits fans out instead of stacking.
    this.vx[i] = 0;
    this.vy[i] = -46;
    this.value[i] = value;
    this.life[i] = 0.85;
    this.lifeMax[i] = 0.85;
    this.scale[i] = scale;
    this.row[i] = row;
    return i;
  }
}
