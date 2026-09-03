import type { EnemyPool } from '../entities/enemyPool.ts';
import type { SpatialHash } from '../core/spatialHash.ts';
import type { Tower } from '../entities/tower.ts';
import { ST } from '../entities/tower.ts';
import { POLICY, type TargetPolicy } from '../core/state.ts';
import { EF } from '../data/enemyFlags.ts';
import { TARGETING_HZ, ENEMY_CAP } from '../core/constants.ts';
import { isPhasedOut } from './ai.ts';

/**
 * Target acquisition (SPEC §4.2).
 *
 * Runs at 10 Hz, not per frame: re-picking 60 times a second gains nothing and
 * costs a grid query per tick. The target is also STICKY — it is kept until it
 * dies or leaves range — because a policy re-evaluated continuously makes the
 * cannon jitter between two equidistant enemies and reads as a bug.
 */
export class TargetingSystem {
  private acc = 0;
  private readonly candidates = new Int32Array(ENEMY_CAP);

  update(tower: Tower, e: EnemyPool, hash: SpatialHash, policy: TargetPolicy, dt: number): void {
    const range = tower.stats.get(ST.Range);
    const range2 = range * range;

    // Drop a target that died, phased out, or walked out of range — checked
    // every tick, since holding a dead target would stall the weapon.
    if (tower.targetHandle >= 0) {
      const i = e.resolve(tower.targetHandle);
      if (i < 0 || !targetable(e, i, tower.x, tower.y, range2)) tower.targetHandle = -1;
    }

    this.acc += dt;
    const period = 1 / TARGETING_HZ;
    if (tower.targetHandle >= 0 && this.acc < period) return;
    if (this.acc >= period) this.acc = 0;
    if (tower.targetHandle >= 0) return;

    const n = hash.query(tower.x, tower.y, range, this.candidates);
    let best = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = this.candidates[k] ?? 0;
      if (!targetable(e, i, tower.x, tower.y, range2)) continue;
      const score = scoreFor(e, i, tower.x, tower.y, policy);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    tower.targetHandle = best >= 0 ? e.handle(best) : -1;
  }
}

function targetable(
  e: EnemyPool,
  i: number,
  tx: number,
  ty: number,
  range2: number,
): boolean {
  if (e.alive[i] === 0) return false;
  // A phased wraith cannot be hit by projectiles, so aiming at it wastes shots.
  if (isPhasedOut(e, i)) return false;
  const dx = (e.x[i] ?? 0) - tx;
  const dy = (e.y[i] ?? 0) - ty;
  return dx * dx + dy * dy <= range2;
}

/** Higher is better. Every policy reduces to one comparable number. */
function scoreFor(
  e: EnemyPool,
  i: number,
  tx: number,
  ty: number,
  policy: TargetPolicy,
): number {
  const dx = (e.x[i] ?? 0) - tx;
  const dy = (e.y[i] ?? 0) - ty;
  const d2 = dx * dx + dy * dy;
  switch (policy) {
    case POLICY.Closest:
      return -d2;
    case POLICY.Strongest:
      return e.hp[i] ?? 0;
    case POLICY.Weakest:
      return -(e.hp[i] ?? 0);
    case POLICY.Fastest:
      return e.currentSpeed(i);
    case POLICY.BossFirst: {
      // Bosses and elites outrank everything; among equals, fall back to
      // closest so the policy still behaves sensibly on a normal wave.
      const flags = e.flags[i] ?? 0;
      const rank = flags & EF.Boss ? 2 : flags & EF.Elite ? 1 : 0;
      return rank * 1e12 - d2;
    }
    default:
      return -d2;
  }
}
