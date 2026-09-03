import type { World } from '../entities/world.ts';
import { PF } from '../entities/projectilePool.ts';
import { EF } from '../data/enemyFlags.ts';
import { DMG_TARGET_ENEMY, DMG_TARGET_TOWER, DMG_FLAG } from '../core/damageQueue.ts';
import { ST, TF } from '../entities/tower.ts';
import { ENEMY_CAP, R_TOWER_BODY } from '../core/constants.ts';
import { isPhasedOut } from './ai.ts';

const MAX_CANDIDATES = 96;

/**
 * Projectile flight and impact (SPEC §12.3 step 8).
 *
 * Collision is a SWEPT segment-circle test, not a point check at the new
 * position: a 900 u/s bolt covers 15 units per tick and would tunnel straight
 * through a 10-unit swarmling on a point test (SPEC §12.5).
 *
 * Nothing here changes HP — every hit goes into the damage queue.
 */
export class ProjectileSystem {
  private readonly candidates = new Int32Array(MAX_CANDIDATES);
  private readonly hitT = new Float32Array(MAX_CANDIDATES);
  private readonly hitIdx = new Int32Array(MAX_CANDIDATES);
  /** Scratch for the explosion query; sized for the worst case. */
  private readonly areaBuf = new Int32Array(ENEMY_CAP);

  update(world: World): void {
    const p = world.projectiles;
    const e = world.enemies;
    const hash = world.hash;

    for (let i = 0; i < p.count; i++) {
      if (p.alive[i] === 0) continue;

      const x0 = p.prevX[i] ?? 0;
      const y0 = p.prevY[i] ?? 0;
      const x1 = p.x[i] ?? 0;
      const y1 = p.y[i] ?? 0;
      const pr = p.radius[i] ?? 4;
      const hostile = ((p.flags[i] ?? 0) & PF.Hostile) !== 0;

      if (hostile) {
        // Enemy fire only ever has one target, so no broad phase is needed.
        if (segmentHitsCircle(x0, y0, x1, y1, world.tower.x, world.tower.y, R_TOWER_BODY + pr)) {
          world.queue.push(
            DMG_TARGET_TOWER,
            0,
            p.damage[i] ?? 0,
            DMG_FLAG.Projectile,
            x0,
            y0,
          );
          spawnImpact(world, x1, y1);
          p.free(i);
        }
        continue;
      }

      // Broad phase over the swept segment, padded by the largest enemy radius.
      const midX = (x0 + x1) * 0.5;
      const midY = (y0 + y1) * 0.5;
      const halfLen = Math.hypot(x1 - x0, y1 - y0) * 0.5;
      const queryR = halfLen + pr + 40;
      const n = Math.min(hash.query(midX, midY, queryR, this.candidates), MAX_CANDIDATES);

      let hits = 0;
      for (let k = 0; k < n; k++) {
        const j = this.candidates[k] ?? 0;
        if (e.alive[j] === 0) continue;
        if (isPhasedOut(e, j)) continue; // wraith immunity window
        if (p.lastHit[i] === e.handle(j)) continue;
        const t = segmentCircleT(x0, y0, x1, y1, e.x[j] ?? 0, e.y[j] ?? 0, (e.radius[j] ?? 8) + pr);
        if (t < 0) continue;
        this.hitT[hits] = t;
        this.hitIdx[hits] = j;
        hits++;
        if (hits >= MAX_CANDIDATES) break;
      }
      if (hits === 0) continue;

      // Resolve nearest-first so pierce consumes enemies in flight order.
      // Selection sort over a handful of hits beats allocating and sorting.
      //
      // `pierce` counts EXTRA enemies passed through, so pierce=2 means three
      // hits: the shot is spent on the hit taken while pierce is already 0.
      // An orbital is a persistent hazard, not a shot: it hits and keeps going.
      const orbital = ((p.flags[i] ?? 0) & PF.Orbital) !== 0;
      let spent = false;
      let resolved = 0;
      while (resolved < hits && !spent) {
        let bestK = -1;
        let bestT = Infinity;
        for (let k = 0; k < hits; k++) {
          if (this.hitIdx[k] === -1) continue;
          const t = this.hitT[k] ?? Infinity;
          if (t < bestT) {
            bestT = t;
            bestK = k;
          }
        }
        if (bestK < 0) break;
        const j = this.hitIdx[bestK] ?? 0;
        this.hitIdx[bestK] = -1;
        resolved++;

        this.applyHit(world, i, j, x1, y1);
        if (p.alive[i] === 0) break;

        if (orbital) break; // one enemy per orb per tick, and it survives
        if ((p.pierce[i] ?? 0) > 0) p.pierce[i] = (p.pierce[i] ?? 0) - 1;
        else spent = true;
      }

      if (p.alive[i] === 0 || orbital) continue;
      // Out of pierce: chain if the build has it, otherwise the shot is done.
      if (spent && !this.tryChain(world, i)) p.free(i);
    }
  }

  private applyHit(world: World, i: number, j: number, hx: number, hy: number): void {
    const p = world.projectiles;
    const e = world.enemies;
    const stats = world.tower.stats;
    const flags = p.flags[i] ?? 0;
    let damage = p.damage[i] ?? 0;

    p.lastHit[i] = e.handle(j);

    // Deathmark executes a wounded non-boss outright; on a boss it is raw
    // damage instead. Resolved as a damage value so the one damage path still
    // owns the kill, the drop and the event.
    if (flags & PF.Deathmarked && stats.deathmarkEvery > 0) {
      const isBoss = ((e.flags[j] ?? 0) & EF.Boss) !== 0;
      const frac = (e.hp[j] ?? 0) / Math.max(1, e.hpMax[j] ?? 1);
      if (isBoss) damage *= stats.deathmarkBossMult;
      else if (frac <= stats.deathmarkThreshold) damage = e.hp[j] ?? 0;
    }

    world.queue.push(
      DMG_TARGET_ENEMY,
      e.handle(j),
      damage,
      DMG_FLAG.CanCrit | DMG_FLAG.Projectile,
      p.prevX[i] ?? 0,
      p.prevY[i] ?? 0,
    );
    spawnImpact(world, hx, hy);

    if (flags & PF.Explosive && stats.flags & TF.Explosive) {
      this.explode(world, e.x[j] ?? hx, e.y[j] ?? hy, damage * stats.explosivePct, e.handle(j));
    }
  }

  /** Area damage around a point, skipping the enemy that already took the hit. */
  private explode(world: World, x: number, y: number, damage: number, skip: number): void {
    if (damage <= 0) return;
    const e = world.enemies;
    const r = world.tower.stats.explosiveRadius;
    const r2 = r * r;
    const n = world.hash.query(x, y, r, this.areaBuf);
    for (let k = 0; k < n; k++) {
      const j = this.areaBuf[k] ?? 0;
      if (e.alive[j] === 0) continue;
      const h = e.handle(j);
      if (h === skip) continue;
      const dx = (e.x[j] ?? 0) - x;
      const dy = (e.y[j] ?? 0) - y;
      if (dx * dx + dy * dy > r2) continue;
      world.queue.push(DMG_TARGET_ENEMY, h, damage, DMG_FLAG.Area, x, y);
    }
    const i = world.particles.spawn(x, y, 0, 0, 0.24, r / 32, 2);
    if (i >= 0) world.particles.scaleVel[i] = r / 24;
  }

  /**
   * Redirects a spent projectile at a new nearby enemy instead of spawning a
   * fresh one — same visual, no extra pool pressure.
   */
  private tryChain(world: World, i: number): boolean {
    const p = world.projectiles;
    const stats = world.tower.stats;
    if ((p.chain[i] ?? 0) <= 0 || (stats.flags & TF.Chain) === 0) return false;

    const e = world.enemies;
    const x = p.x[i] ?? 0;
    const y = p.y[i] ?? 0;
    const r = stats.chainRadius;
    const r2 = r * r;
    const last = p.lastHit[i] ?? -1;
    const n = world.hash.query(x, y, r, this.areaBuf);
    let best = -1;
    let bestD2 = r2;
    for (let k = 0; k < n; k++) {
      const j = this.areaBuf[k] ?? 0;
      if (e.alive[j] === 0 || e.handle(j) === last || isPhasedOut(e, j)) continue;
      const dx = (e.x[j] ?? 0) - x;
      const dy = (e.y[j] ?? 0) - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = j;
      }
    }
    if (best < 0) return false;

    const d = Math.sqrt(bestD2) || 1;
    const speed = stats.get(ST.ProjSpeed);
    p.vx[i] = (((e.x[best] ?? 0) - x) / d) * speed;
    p.vy[i] = (((e.y[best] ?? 0) - y) / d) * speed;
    p.rot[i] = Math.atan2(p.vy[i] ?? 0, p.vx[i] ?? 0);
    p.damage[i] = (p.damage[i] ?? 0) * stats.chainFalloff;
    p.chain[i] = (p.chain[i] ?? 0) - 1;
    p.pierce[i] = 0;
    // Enough life to actually reach the new target.
    p.life[i] = Math.max(p.life[i] ?? 0, (d / speed) * 1.6 + 0.05);
    return true;
  }
}

function spawnImpact(world: World, x: number, y: number): void {
  const i = world.particles.spawn(x, y, 0, 0, 0.12, 0.6, 0);
  if (i >= 0) world.particles.scaleVel[i] = -3;
}

/**
 * Parameter t in [0,1] of the first intersection of segment AB with a circle,
 * or -1 if it misses. Squared distances throughout — no sqrt in the reject path.
 */
export function segmentCircleT(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const r2 = r * r;

  // Already overlapping at the start of the step: hit at t = 0.
  if (fx * fx + fy * fy <= r2) return 0;

  const a = dx * dx + dy * dy;
  if (a <= 1e-9) return -1; // no movement and not already overlapping
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  const t2 = (-b + sq) / (2 * a);
  if (t2 >= 0 && t2 <= 1) return t2;
  return -1;
}

export function segmentHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  return segmentCircleT(ax, ay, bx, by, cx, cy, r) >= 0;
}
