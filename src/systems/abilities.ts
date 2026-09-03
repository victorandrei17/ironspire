import type { World } from '../entities/world.ts';
import { ABILITIES, ABILITY, ABILITY_COUNT, NOVA_PUSH, FURY_DAMAGE_BONUS } from '../data/abilities.ts';
import { ST } from '../data/stats.ts';
import { DMG_TARGET_ENEMY, DMG_FLAG } from '../core/damageQueue.ts';
import { ENEMY_CAP } from '../core/constants.ts';
import { bus, EV } from '../core/events.ts';
import { SFX } from '../data/audio.ts';

/**
 * Active abilities (SPEC §12.3 step 9).
 *
 * Cooldowns and durations live here; the effects go through the same damage
 * queue and stat layers as everything else, so an ability cannot become a
 * second, parallel set of rules.
 */
export class AbilitySystem {
  /** Seconds until each ability is ready. */
  readonly cooldown = new Float32Array(ABILITY_COUNT);
  /** Seconds of remaining effect, for the timed ones. */
  readonly active = new Float32Array(ABILITY_COUNT);
  /** Which abilities the player has unlocked. */
  readonly unlocked = new Uint8Array(ABILITY_COUNT);
  /** Whether the Automation talent fires them without a tap. */
  autoCast = false;

  private readonly buf = new Int32Array(ENEMY_CAP);
  /** True while fury's stat bonus is applied, so it is removed exactly once. */
  private furyApplied = false;

  /**
   * Clears cooldowns and any live buff.
   *
   * Takes the world on purpose: clearing `active` without also removing the
   * stat contribution would leave fury's bonus applied forever, because
   * `syncFury` only acts on a CHANGE and would see none.
   */
  reset(world: World): void {
    this.active.fill(0);
    this.syncFury(world);
    this.cooldown.fill(0);
    this.furyApplied = false;
  }

  /** Cooldown progress in 0..1, for the HUD ring. */
  readiness(id: number): number {
    const def = ABILITIES[id];
    if (def === undefined) return 0;
    const cd = this.cooldown[id] ?? 0;
    return cd <= 0 ? 1 : 1 - cd / def.cooldown;
  }

  canCast(id: number): boolean {
    return this.unlocked[id] === 1 && (this.cooldown[id] ?? 0) <= 0;
  }

  update(world: World, dt: number): void {
    for (let i = 0; i < ABILITY_COUNT; i++) {
      const cd = this.cooldown[i] ?? 0;
      if (cd > 0) this.cooldown[i] = Math.max(0, cd - dt);
      const act = this.active[i] ?? 0;
      if (act > 0) this.active[i] = Math.max(0, act - dt);
    }

    this.syncFury(world);

    if (this.autoCast) {
      for (let i = 0; i < ABILITY_COUNT; i++) {
        if (this.canCast(i) && this.autoConditionMet(world, i)) this.cast(world, i);
      }
    }
  }

  private autoConditionMet(world: World, id: number): boolean {
    const def = ABILITIES[id];
    if (def === undefined) return false;
    switch (def.auto) {
      case 'always':
        return true;
      case 'lowHp':
        return world.tower.hp / Math.max(1, world.tower.hpMax) <= def.autoThreshold;
      case 'crowd': {
        const n = world.hash.query(world.tower.x, world.tower.y, def.radius, this.buf);
        let alive = 0;
        for (let k = 0; k < n; k++) if (world.enemies.alive[this.buf[k] ?? 0] === 1) alive++;
        return alive >= def.autoThreshold;
      }
      default:
        return false;
    }
  }

  /** Returns true when the ability actually fired. */
  cast(world: World, id: number): boolean {
    if (!this.canCast(id)) return false;
    const def = ABILITIES[id];
    if (def === undefined) return false;
    this.cooldown[id] = def.cooldown;
    this.active[id] = def.duration;

    switch (id) {
      case ABILITY.Nova:
        this.castNova(world, def.radius, def.power);
        break;
      case ABILITY.Bulwark:
        world.tower.shieldHp = world.tower.hpMax * def.power;
        world.tower.shieldT = def.duration;
        break;
      default:
        // Fury is entirely a stat effect; syncFury applies it next tick.
        break;
    }
    bus.emit(EV.Sfx, SFX.Ability, id);
    return true;
  }

  private castNova(world: World, radius: number, damageMult: number): void {
    const e = world.enemies;
    const damage = world.tower.stats.get(ST.Dmg) * damageMult;
    const r2 = radius * radius;
    const n = world.hash.query(world.tower.x, world.tower.y, radius, this.buf);
    for (let k = 0; k < n; k++) {
      const i = this.buf[k] ?? 0;
      if (e.alive[i] === 0) continue;
      const dx = (e.x[i] ?? 0) - world.tower.x;
      const dy = (e.y[i] ?? 0) - world.tower.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      world.queue.push(
        DMG_TARGET_ENEMY,
        e.handle(i),
        damage,
        DMG_FLAG.Area | DMG_FLAG.CanCrit,
        world.tower.x,
        world.tower.y,
      );
      // Knockback: bosses are immovable, or a nova would trivialise the dash.
      if (((e.flags[i] ?? 0) & 2) !== 0) continue;
      const d = Math.sqrt(d2) || 1;
      e.x[i] = (e.x[i] ?? 0) + (dx / d) * NOVA_PUSH;
      e.y[i] = (e.y[i] ?? 0) + (dy / d) * NOVA_PUSH;
    }
    const p = world.particles.spawn(world.tower.x, world.tower.y, 0, 0, 0.4, radius / 32, 1);
    if (p >= 0) world.particles.scaleVel[p] = radius / 20;
    bus.emit(EV.Shake, 0.4);
  }

  /**
   * Fury writes into the run stat layer and takes it back out.
   *
   * It uses the dedicated temp layer, not the run layer: buying an upgrade
   * rebuilds the run layer from levels and would silently eat the buff.
   * Applied here rather than in the cast so a reload, a pause or an expiry can
   * never leave a permanent buff behind.
   */
  private syncFury(world: World): void {
    const def = ABILITIES[ABILITY.Fury];
    if (def === undefined) return;
    const shouldBeOn = (this.active[ABILITY.Fury] ?? 0) > 0;
    if (shouldBeOn === this.furyApplied) return;
    const stats = world.tower.stats;
    const rateDelta = shouldBeOn ? def.power : -def.power;
    const dmgDelta = shouldBeOn ? FURY_DAMAGE_BONUS : -FURY_DAMAGE_BONUS;
    stats.pctTemp[ST.FireRate] = (stats.pctTemp[ST.FireRate] ?? 0) + rateDelta;
    stats.pctTemp[ST.Dmg] = (stats.pctTemp[ST.Dmg] ?? 0) + dmgDelta;
    stats.markDirty();
    this.furyApplied = shouldBeOn;
  }
}
