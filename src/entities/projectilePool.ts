import { Pool } from '../core/pool.ts';
import { PROJ_CAP } from '../core/constants.ts';
import type { SpriteKey } from '../render/spriteKeys.gen.ts';

export const PF = {
  /** Fired by an enemy: hits the tower instead of enemies. */
  Hostile: 1 << 0,
  Explosive: 1 << 1,
  Chaining: 1 << 2,
  /** Orbital sentinel: follows the tower rather than travelling. */
  Orbital: 1 << 3,
  /** Carries the deathmark execute (SPEC §8.2 card 18). */
  Deathmarked: 1 << 4,
} as const;

/** Projectile pool (SPEC §12.4). Same SoA shape as EnemyPool. */
export class ProjectilePool extends Pool {
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

  readonly damage = new Float32Array(this.cap);
  readonly radius = new Float32Array(this.cap);
  readonly life = new Float32Array(this.cap);
  /** Remaining enemies this shot may pass through. */
  readonly pierce = new Int16Array(this.cap);
  /** Remaining chain jumps. */
  readonly chain = new Int16Array(this.cap);
  readonly flags = new Uint16Array(this.cap);
  readonly spriteIdx = new Uint16Array(this.cap);
  /** Handle of the last enemy hit, so a piercing shot cannot re-hit it. */
  readonly lastHit = new Int32Array(this.cap);
  /** Orbital angle, radians. Unused by travelling shots. */
  readonly orbitA = new Float32Array(this.cap);

  keys: readonly SpriteKey[] = [];

  constructor(cap = PROJ_CAP) {
    super(cap);
    this.scale.fill(1);
    this.alpha.fill(1);
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    radius: number,
    life: number,
    spriteIdx: number,
    flags: number,
  ): number {
    const i = this.alloc();
    if (i < 0) return -1;
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = x;
    this.prevY[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.rot[i] = Math.atan2(vy, vx);
    this.scale[i] = 1;
    this.alpha[i] = 1;
    this.flash[i] = 0;
    this.damage[i] = damage;
    this.radius[i] = radius;
    this.life[i] = life;
    this.pierce[i] = 0;
    this.chain[i] = 0;
    this.flags[i] = flags;
    this.spriteIdx[i] = spriteIdx;
    this.lastHit[i] = -1;
    this.orbitA[i] = 0;
    return i;
  }
}
