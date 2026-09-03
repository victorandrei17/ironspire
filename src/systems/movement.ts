import type { EnemyPool } from '../entities/enemyPool.ts';
import type { ProjectilePool } from '../entities/projectilePool.ts';
import type { ParticlePool } from '../entities/particlePool.ts';
import type { PickupPool } from '../entities/pickupPool.ts';
import type { DamageNumberPool } from '../entities/damageNumberPool.ts';
import { R_DESPAWN } from '../core/constants.ts';

/**
 * Integration pass (SPEC §12.3 step 4).
 *
 * Every mover records prevX/prevY *before* moving; the renderer interpolates
 * between the two by the loop's alpha, which is what makes 60 Hz simulation
 * look smooth on a display that does not line up with it.
 */
export function integrateEnemies(e: EnemyPool, dt: number): void {
  for (let i = 0; i < e.count; i++) {
    if (e.alive[i] === 0) continue;
    e.prevX[i] = e.x[i] ?? 0;
    e.prevY[i] = e.y[i] ?? 0;
    e.x[i] = (e.x[i] ?? 0) + (e.vx[i] ?? 0) * dt;
    e.y[i] = (e.y[i] ?? 0) + (e.vy[i] ?? 0) * dt;

    // Timers decay here so no other system has to remember to tick them.
    const flash = e.flash[i] ?? 0;
    if (flash > 0) e.flash[i] = flash > dt * 6 ? flash - dt * 6 : 0;
    const slow = e.slowT[i] ?? 0;
    if (slow > 0) e.slowT[i] = slow > dt ? slow - dt : 0;
    const freeze = e.freezeT[i] ?? 0;
    if (freeze > 0) e.freezeT[i] = freeze > dt ? freeze - dt : 0;
    const cd = e.attackCd[i] ?? 0;
    if (cd > 0) e.attackCd[i] = cd > dt ? cd - dt : 0;
  }
}

/** Recycles anything that wandered past the despawn ring (SPEC §3.3). */
export function despawnStrays(e: EnemyPool, towerX: number, towerY: number): void {
  const r2 = R_DESPAWN * R_DESPAWN;
  for (let i = 0; i < e.count; i++) {
    if (e.alive[i] === 0) continue;
    const dx = (e.x[i] ?? 0) - towerX;
    const dy = (e.y[i] ?? 0) - towerY;
    if (dx * dx + dy * dy > r2) e.free(i);
  }
}

export function integrateProjectiles(p: ProjectilePool, dt: number): void {
  for (let i = 0; i < p.count; i++) {
    if (p.alive[i] === 0) continue;
    p.prevX[i] = p.x[i] ?? 0;
    p.prevY[i] = p.y[i] ?? 0;
    p.x[i] = (p.x[i] ?? 0) + (p.vx[i] ?? 0) * dt;
    p.y[i] = (p.y[i] ?? 0) + (p.vy[i] ?? 0) * dt;
    const life = (p.life[i] ?? 0) - dt;
    if (life <= 0) p.free(i);
    else p.life[i] = life;
  }
}

export function integrateParticles(pa: ParticlePool, dt: number): void {
  for (let i = 0; i < pa.count; i++) {
    if (pa.alive[i] === 0) continue;
    pa.prevX[i] = pa.x[i] ?? 0;
    pa.prevY[i] = pa.y[i] ?? 0;
    const drag = pa.drag[i] ?? 0;
    if (drag > 0) {
      // Exponential damping written as a multiply, not Math.pow per particle.
      const k = 1 - drag * dt;
      const damp = k < 0 ? 0 : k;
      pa.vx[i] = (pa.vx[i] ?? 0) * damp;
      pa.vy[i] = (pa.vy[i] ?? 0) * damp;
    }
    pa.x[i] = (pa.x[i] ?? 0) + (pa.vx[i] ?? 0) * dt;
    pa.y[i] = (pa.y[i] ?? 0) + (pa.vy[i] ?? 0) * dt;
    pa.rot[i] = (pa.rot[i] ?? 0) + (pa.rotVel[i] ?? 0) * dt;
    pa.scale[i] = Math.max(0, (pa.scale[i] ?? 1) + (pa.scaleVel[i] ?? 0) * dt);
    const life = (pa.life[i] ?? 0) - dt;
    if (life <= 0) {
      pa.free(i);
    } else {
      pa.life[i] = life;
      // Fade over the last 40% of life, so particles do not pop out.
      const t = life / (pa.lifeMax[i] ?? 1);
      pa.alpha[i] = t < 0.4 ? t / 0.4 : 1;
    }
  }
}

export function integrateDamageNumbers(d: DamageNumberPool, dt: number): void {
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 0) continue;
    d.prevX[i] = d.x[i] ?? 0;
    d.prevY[i] = d.y[i] ?? 0;
    d.x[i] = (d.x[i] ?? 0) + (d.vx[i] ?? 0) * dt;
    d.y[i] = (d.y[i] ?? 0) + (d.vy[i] ?? 0) * dt;
    // Rising then slowing gives the number an arc without a curve lookup.
    d.vy[i] = (d.vy[i] ?? 0) + 120 * dt;
    const life = (d.life[i] ?? 0) - dt;
    if (life <= 0) d.free(i);
    else d.life[i] = life;
  }
}

/** Pickups drift, then home in once the magnet grabs them (SPEC §7.1). */
export function integratePickups(
  pk: PickupPool,
  dt: number,
  towerX: number,
  towerY: number,
  magnetRadius: number,
): void {
  const magnet2 = magnetRadius * magnetRadius;
  for (let i = 0; i < pk.count; i++) {
    if (pk.alive[i] === 0) continue;
    pk.prevX[i] = pk.x[i] ?? 0;
    pk.prevY[i] = pk.y[i] ?? 0;

    const settle = pk.settleT[i] ?? 0;
    if (settle > 0) {
      pk.settleT[i] = settle - dt;
      pk.vx[i] = (pk.vx[i] ?? 0) * 0.9;
      pk.vy[i] = (pk.vy[i] ?? 0) * 0.9;
    } else {
      const dx = towerX - (pk.x[i] ?? 0);
      const dy = towerY - (pk.y[i] ?? 0);
      const d2 = dx * dx + dy * dy;
      if (d2 <= magnet2) {
        // Accelerating pull: slow start, fast finish, no sqrt until we must.
        const d = Math.sqrt(d2) || 1;
        const pull = 900 + (1 - d / magnetRadius) * 1400;
        pk.vx[i] = (dx / d) * pull * 0.02 + (pk.vx[i] ?? 0) * 0.86;
        pk.vy[i] = (dy / d) * pull * 0.02 + (pk.vy[i] ?? 0) * 0.86;
      } else {
        pk.vx[i] = (pk.vx[i] ?? 0) * 0.92;
        pk.vy[i] = (pk.vy[i] ?? 0) * 0.92;
      }
    }

    pk.x[i] = (pk.x[i] ?? 0) + (pk.vx[i] ?? 0) * dt;
    pk.y[i] = (pk.y[i] ?? 0) + (pk.vy[i] ?? 0) * dt;
    // Grow into full size over the pop-out arc.
    const sc = pk.scale[i] ?? 1;
    if (sc < 1) pk.scale[i] = Math.min(1, sc + dt * 4);
    const life = (pk.life[i] ?? 0) - dt;
    if (life <= 0) pk.free(i);
    else pk.life[i] = life;
  }
}
