import type { World } from '../entities/world.ts';
import { TF } from '../entities/tower.ts';
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
export class StatusSystem {
  private readonly buf = new Int32Array(ENEMY_CAP);
  private acc = 0;
  private novaCd = 0;

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
    // TF.Orbital arrives with the epic cards in M6; the flag exists now only so
    // the card contract in tower.ts is complete.
  }

  reset(): void {
    this.acc = 0;
    this.novaCd = 0;
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
