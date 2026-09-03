import type { EnemyPool } from '../entities/enemyPool.ts';
import { ES, EF } from '../data/enemyFlags.ts';
import type { SpatialHash } from '../core/spatialHash.ts';
import { ENEMY_TUNING } from '../data/enemies.ts';
import { R_TOWER_BODY } from '../core/constants.ts';

/**
 * Steering and state decisions (SPEC §12.3 step 3).
 *
 * Enemies seek the tower and softly separate from each other. There is no
 * enemy-enemy collision response: pushing bodies apart properly costs an
 * iterative solver, while a gentle separation force reads the same on screen
 * for a fraction of the work (SPEC §4.3).
 */
export class AiSystem {
  /** Preallocated neighbour buffer — one query's worth, reused every enemy. */
  private readonly neighbours = new Int32Array(64);

  /**
   * @param scriptedHandle handle of an enemy whose velocity is being driven by
   *   another system this tick (a dashing boss); steering leaves it alone.
   */
  update(
    e: EnemyPool,
    hash: SpatialHash,
    towerX: number,
    towerY: number,
    dt: number,
    scriptedHandle = -1,
  ): void {
    const sepR = ENEMY_TUNING.separationRadius;
    const sepR2 = sepR * sepR;
    const sepForce = ENEMY_TUNING.separationForce;
    const accel = ENEMY_TUNING.steerAccel * dt;

    const scriptedIdx = scriptedHandle >= 0 ? e.resolve(scriptedHandle) : -1;

    for (let i = 0; i < e.count; i++) {
      if (e.alive[i] === 0) continue;
      if (i === scriptedIdx) continue;

      const ex = e.x[i] ?? 0;
      const ey = e.y[i] ?? 0;
      const dx = towerX - ex;
      const dy = towerY - ey;
      const d2 = dx * dx + dy * dy;

      // One sqrt per enemy per tick: we need the actual distance for the
      // approach band and the unit vector, and 400 of them is ~4 us.
      const dist = Math.sqrt(d2) || 1;
      const invD = 1 / dist;

      // How close this entity wants to be. Read from the pool, so a boss with
      // its own table is handled by the same code as an archetype.
      const preferred = e.preferredRange[i] ?? 0;
      const isRanged = preferred > 0;
      const stopAt = isRanged
        ? preferred
        : R_TOWER_BODY + (e.radius[i] ?? 0) + ENEMY_TUNING.contactSlack;

      let seekX = dx * invD;
      let seekY = dy * invD;
      const gap = dist - stopAt;

      if (gap <= 0) {
        e.state[i] = isRanged ? ES.Shoot : ES.Attack;
        // Ranged types back off if they drifted inside their band.
        if (isRanged && gap < -ENEMY_TUNING.rangeBand) {
          seekX = -seekX;
          seekY = -seekY;
        } else {
          seekX = 0;
          seekY = 0;
        }
      } else {
        e.state[i] = isRanged ? ES.Approach : ES.Seek;
      }

      // Soft separation from nearby bodies.
      let sepX = 0;
      let sepY = 0;
      const n = hash.query(ex, ey, sepR, this.neighbours);
      for (let k = 0; k < n; k++) {
        const j = this.neighbours[k] ?? 0;
        if (j === i) continue;
        const ox = ex - (e.x[j] ?? 0);
        const oy = ey - (e.y[j] ?? 0);
        const od2 = ox * ox + oy * oy;
        if (od2 <= 0.0001 || od2 > sepR2) continue;
        // Weight by 1/d2 so only genuinely overlapping bodies push hard, and
        // skip the sqrt: the vector is normalised in aggregate below.
        const w = (sepR2 - od2) / sepR2;
        const od = Math.sqrt(od2);
        sepX += (ox / od) * w;
        sepY += (oy / od) * w;
      }

      const speed = e.currentSpeed(i);
      const desiredX = seekX * speed + sepX * sepForce;
      const desiredY = seekY * speed + sepY * sepForce;

      // Clamp the desired velocity to the enemy's speed so separation can
      // nudge direction but never make anything outrun its archetype.
      const dm2 = desiredX * desiredX + desiredY * desiredY;
      let dvx = desiredX;
      let dvy = desiredY;
      if (dm2 > speed * speed && dm2 > 0.0001) {
        const k = speed / Math.sqrt(dm2);
        dvx *= k;
        dvy *= k;
      }

      // Approach the desired velocity instead of snapping to it: instant
      // direction changes read as teleporting at 60 Hz.
      let vx = approachTo(e.vx[i] ?? 0, dvx, accel);
      let vy = approachTo(e.vy[i] ?? 0, dvy, accel);

      // Approaching each component independently can leave the vector slightly
      // outside the speed circle while it swings direction. Rescale — the sqrt
      // only runs on the frames where it actually happens.
      const m2 = vx * vx + vy * vy;
      const sp2 = speed * speed;
      if (m2 > sp2 && m2 > 0.0001) {
        const k = speed / Math.sqrt(m2);
        vx *= k;
        vy *= k;
      }
      e.vx[i] = vx;
      e.vy[i] = vy;
      if (vx * vx + vy * vy > 1) e.rot[i] = Math.atan2(vy, vx);
      else e.rot[i] = Math.atan2(dy, dx);

      // Wraith phase cycle: immune to projectiles for `phaseOn` of every cycle.
      if ((e.flags[i] ?? 0) & EF.Phasing) {
        const t = ((e.phaseT[i] ?? 0) + dt) % ENEMY_TUNING.phaseCycle;
        e.phaseT[i] = t;
        const phased = t < ENEMY_TUNING.phaseOn;
        e.alpha[i] = phased ? 0.35 : 0.78;
      }
    }
  }
}

function approachTo(cur: number, target: number, maxDelta: number): number {
  const d = target - cur;
  if (d > maxDelta) return cur + maxDelta;
  if (d < -maxDelta) return cur - maxDelta;
  return target;
}

/** True while a phasing enemy is in its immune window. */
export function isPhasedOut(e: EnemyPool, i: number): boolean {
  if (((e.flags[i] ?? 0) & EF.Phasing) === 0) return false;
  return (e.phaseT[i] ?? 0) < ENEMY_TUNING.phaseOn;
}
