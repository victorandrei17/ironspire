import { Pool } from '../core/pool.ts';
import { ENEMY_CAP } from '../core/constants.ts';
import { ES, EF } from '../data/enemyFlags.ts';
import type { EnemyDef } from '../data/enemies.ts';

// Re-exported so pool consumers do not need to know where the constants live.
export { ES, EF };
import type { SpriteKey } from '../render/spriteKeys.gen.ts';

/**
 * Enemy pool, struct-of-arrays (SPEC §12.4).
 *
 * Field types are chosen by range, not by habit: positions need float
 * precision, a state id fits in a byte, and a generation fits in 16 bits. On a
 * 400-slot pool that is the difference between ~19 KB and ~64 KB touched per
 * tick, which is the difference between staying in L2 and not.
 */
export class EnemyPool extends Pool {
  // Hot: read or written every tick.
  readonly x = new Float32Array(this.cap);
  readonly y = new Float32Array(this.cap);
  readonly prevX = new Float32Array(this.cap);
  readonly prevY = new Float32Array(this.cap);
  readonly vx = new Float32Array(this.cap);
  readonly vy = new Float32Array(this.cap);
  readonly hp = new Float32Array(this.cap);
  readonly hpMax = new Float32Array(this.cap);
  readonly radius = new Float32Array(this.cap);
  readonly speed = new Float32Array(this.cap);
  /**
   * Combat stats are per-entity, not looked up from the archetype table.
   * A boss draws its numbers from a different table entirely, and reading them
   * from the pool also keeps a table indirection out of the hot loop.
   */
  readonly dmg = new Float32Array(this.cap);
  readonly attackInterval = new Float32Array(this.cap);
  /** Ranged types hold at this distance; 0 means melee. */
  readonly preferredRange = new Float32Array(this.cap);
  readonly rot = new Float32Array(this.cap);
  readonly scale = new Float32Array(this.cap);
  readonly alpha = new Float32Array(this.cap);

  // Warm: read every tick, written rarely.
  readonly defIdx = new Uint8Array(this.cap);
  readonly state = new Uint8Array(this.cap);
  readonly flags = new Uint16Array(this.cap);
  readonly spriteIdx = new Uint16Array(this.cap);

  // Timers.
  readonly animT = new Float32Array(this.cap);
  readonly animFrame = new Uint8Array(this.cap);
  readonly flash = new Float32Array(this.cap);
  readonly attackCd = new Float32Array(this.cap);
  /** Remaining slow duration; `slowMul` is the multiplier while it lasts. */
  readonly slowT = new Float32Array(this.cap);
  readonly slowMul = new Float32Array(this.cap);
  readonly freezeT = new Float32Array(this.cap);
  /** Phase timer for `wraith`: counts down through immune/vulnerable windows. */
  readonly phaseT = new Float32Array(this.cap);

  // Economy carried by the enemy so drops do not need a def lookup on death.
  readonly goldValue = new Float32Array(this.cap);
  readonly xpValue = new Float32Array(this.cap);

  /** Sprite keys this pool can reference, indexed by `spriteIdx`. */
  keys: readonly SpriteKey[] = [];

  constructor(cap = ENEMY_CAP) {
    super(cap);
    this.scale.fill(1);
    this.alpha.fill(1);
  }

  /** Claims a slot and resets every per-entity field. Returns -1 when full. */
  spawn(x: number, y: number, defIdx: number, spriteIdx: number, hp: number, radius: number): number {
    const i = this.alloc();
    if (i < 0) return -1;
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = x;
    this.prevY[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.hp[i] = hp;
    this.hpMax[i] = hp;
    this.radius[i] = radius;
    this.speed[i] = 0;
    this.dmg[i] = 0;
    this.attackInterval[i] = 1;
    this.preferredRange[i] = 0;
    this.rot[i] = 0;
    this.scale[i] = 1;
    this.alpha[i] = 1;
    this.defIdx[i] = defIdx;
    this.state[i] = ES.Seek;
    this.flags[i] = 0;
    this.spriteIdx[i] = spriteIdx;
    this.animT[i] = 0;
    this.animFrame[i] = 0;
    this.flash[i] = 0;
    this.attackCd[i] = 0;
    this.slowT[i] = 0;
    this.slowMul[i] = 1;
    this.freezeT[i] = 0;
    this.phaseT[i] = 0;
    this.goldValue[i] = 0;
    this.xpValue[i] = 0;
    return i;
  }

  /**
   * Copies an archetype's combat stats into slot `i`.
   *
   * One place, so a new spawn path (a test, the stress filler, a summon) cannot
   * forget a field and quietly give an enemy a grunt's damage.
   */
  applyArchetype(i: number, def: EnemyDef, speedMul = 1): void {
    this.speed[i] = def.speed * speedMul;
    this.dmg[i] = def.dmg;
    this.attackInterval[i] = def.attackInterval;
    this.preferredRange[i] = def.preferredRange;
    this.flags[i] = def.flags;
    this.scale[i] = def.scale;
    this.radius[i] = def.radius;
  }

  hasFlag(i: number, flag: number): boolean {
    return ((this.flags[i] ?? 0) & flag) !== 0;
  }

  /** Effective speed after slow/freeze, in world units per second. */
  currentSpeed(i: number): number {
    if ((this.freezeT[i] ?? 0) > 0) return 0;
    const slow = (this.slowT[i] ?? 0) > 0 ? (this.slowMul[i] ?? 1) : 1;
    return (this.speed[i] ?? 0) * slow;
  }
}
