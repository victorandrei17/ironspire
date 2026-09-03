import type { World } from '../entities/world.ts';
import { TF, ST } from '../entities/tower.ts';
import { PF } from '../entities/projectilePool.ts';
import { ENEMY_CAP } from '../core/constants.ts';

/**
 * Status effects and auras (SPEC §12.3 steps 10 and 13).
 *
 * Runs at AURA_HZ rather than every tick: a slow field re-evaluated 60 times a
 * second costs a grid query per tick and looks identical at 10.
 *
 * The timers themselves (slowT, freezeT) count down in `movement.ts`, so an
 * enemy that walks out of the aura keeps the remaining slow instead of snapping
 * back to full speed mid-stride.
 */
/** Radians per second the sentinels sweep. */
const ORBIT_SPEED = 2.2;
/** Contact damage per hit, as a share of tower damage. */
const ORBIT_DAMAGE_PCT = 0.5;

export class StatusSystem {
  private readonly buf = new Int32Array(ENEMY_CAP);
  private acc = 0;
  private novaCd = 0;
  private orbitAngle = 0;
  /** Handles of the live orbs, so they are moved rather than respawned. */
  private readonly orbitalHandles = new Int32Array(8).fill(-1);

  update(world: World, dt: number, hz: number): void {
    const stats = world.tower.stats;

    if (stats.flags & TF.FrostNova) {
      this.novaCd -= dt;
      if (this.novaCd <= 0) {
        this.novaCd = stats.frostNovaCd;
        this.castFrostNova(world);
      }
    }

    this.acc += dt;
    const period = 1 / hz;
    if (this.acc < period) return;
    const elapsed = this.acc;
    this.acc = 0;

    if (stats.flags & TF.SlowAura) this.applySlowAura(world, elapsed);
  }

  /**
   * Orbital sentinels (SPEC §8.2 card 14).
   *
   * Run every tick, not at aura rate: they are physical objects the eye tracks,
   * and 10 Hz movement reads as stuttering.
   */
  updateOrbitals(world: World, dt: number): void {
    const stats = world.tower.stats;
    const p = world.projectiles;
    if ((stats.flags & TF.Orbital) === 0 || stats.orbitalCount <= 0) {
      // Card lost (a new run): retire any orbs still in the pool.
      for (let i = 0; i < p.count; i++) {
        if (p.alive[i] === 1 && ((p.flags[i] ?? 0) & PF.Orbital) !== 0) p.free(i);
      }
      this.orbitalHandles.fill(-1);
      return;
    }

    this.orbitAngle = (this.orbitAngle + dt * ORBIT_SPEED) % (Math.PI * 2);
    const damage = stats.get(ST.Dmg) * ORBIT_DAMAGE_PCT;

    for (let k = 0; k < stats.orbitalCount && k < this.orbitalHandles.length; k++) {
      let i = p.resolve(this.orbitalHandles[k] ?? -1);
      if (i < 0) {
        i = p.spawn(world.tower.x, world.tower.y, 0, 0, damage, 14, Infinity, 2, PF.Orbital);
        if (i < 0) continue;
        this.orbitalHandles[k] = p.handle(i);
      }
      const a = this.orbitAngle + (k / stats.orbitalCount) * Math.PI * 2;
      p.prevX[i] = p.x[i] ?? 0;
      p.prevY[i] = p.y[i] ?? 0;
      p.x[i] = world.tower.x + Math.cos(a) * stats.orbitalRadius;
      p.y[i] = world.tower.y + Math.sin(a) * stats.orbitalRadius;
      p.rot[i] = a;
      p.damage[i] = damage;
      // Orbs never expire; life is refreshed so the shared integrator, which
      // decrements it, cannot retire them.
      p.life[i] = 10;
    }
  }

  reset(): void {
    this.acc = 0;
    this.novaCd = 0;
    this.orbitAngle = 0;
    this.orbitalHandles.fill(-1);
  }

  private applySlowAura(world: World, elapsed: number): void {
    const e = world.enemies;
    const stats = world.tower.stats;
    const r = stats.slowAuraRadius;
    const r2 = r * r;
    const n = world.hash.query(world.tower.x, world.tower.y, r, this.buf);
    for (let k = 0; k < n; k++) {
      const i = this.buf[k] ?? 0;
      if (e.alive[i] === 0) continue;
      const dx = (e.x[i] ?? 0) - world.tower.x;
      const dy = (e.y[i] ?? 0) - world.tower.y;
      if (dx * dx + dy * dy > r2) continue;
      e.slowMul[i] = stats.slowAuraMul;
      // Refreshed slightly longer than the aura period so a body inside the
      // field never flickers back to full speed between updates.
      e.slowT[i] = elapsed * 1.5;
    }
  }

  private castFrostNova(world: World): void {
    const e = world.enemies;
    const stats = world.tower.stats;
    const r = stats.frostNovaRadius;
    const r2 = r * r;
    const n = world.hash.query(world.tower.x, world.tower.y, r, this.buf);
    for (let k = 0; k < n; k++) {
      const i = this.buf[k] ?? 0;
      if (e.alive[i] === 0) continue;
      const dx = (e.x[i] ?? 0) - world.tower.x;
      const dy = (e.y[i] ?? 0) - world.tower.y;
      if (dx * dx + dy * dy > r2) continue;
      e.freezeT[i] = stats.frostNovaFreeze;
      e.vx[i] = 0;
      e.vy[i] = 0;
    }
    const p = world.particles.spawn(world.tower.x, world.tower.y, 0, 0, 0.45, r / 32, 1);
    if (p >= 0) world.particles.scaleVel[p] = r / 22;
  }
}
