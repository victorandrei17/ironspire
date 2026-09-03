import { Pool } from '../core/pool.ts';
import { PICKUP_CAP } from '../core/constants.ts';
import type { SpriteKey } from '../render/spriteKeys.gen.ts';

export const PICKUP_GOLD = 0;
export const PICKUP_XP = 1;

/** Dropped gold and XP, magnetised toward the tower (SPEC §7.1). */
export class PickupPool extends Pool {
  readonly x = new Float32Array(this.cap);
  readonly y = new Float32Array(this.cap);
  readonly prevX = new Float32Array(this.cap);
  readonly prevY = new Float32Array(this.cap);
  readonly vx = new Float32Array(this.cap);
  readonly vy = new Float32Array(this.cap);
  readonly rot = new Float32Array(this.cap);
  readonly scale = new Float32Array(this.cap);
  readonly alpha = new Float32Array(this.cap);
  readonly flash = new Float32Array(this.cap);
  readonly value = new Float32Array(this.cap);
  readonly kind = new Uint8Array(this.cap);
  readonly spriteIdx = new Uint16Array(this.cap);
  /** Seconds before the magnet can grab it — lets the pop-out arc read. */
  readonly settleT = new Float32Array(this.cap);
  readonly life = new Float32Array(this.cap);

  keys: readonly SpriteKey[] = [];

  constructor(cap = PICKUP_CAP) {
    super(cap);
    this.scale.fill(1);
    this.alpha.fill(1);
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    kind: number,
    value: number,
    spriteIdx: number,
  ): number {
    const i = this.alloc();
    if (i < 0) return -1;
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = x;
    this.prevY[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.rot[i] = 0;
    this.scale[i] = 1;
    this.alpha[i] = 1;
    this.flash[i] = 0;
    this.value[i] = value;
    this.kind[i] = kind;
    this.spriteIdx[i] = spriteIdx;
    this.settleT[i] = 0.18;
    this.life[i] = 30;
    return i;
  }
}
