import type { World } from '../entities/world.ts';
import type { Rng } from '../core/rng.ts';
import { BOSSES, BOSS_ACTION, ZONE_TUNING, type BossDef } from '../data/bosses.ts';
import { HAZARD } from '../entities/hazardPool.ts';
import { EF } from '../data/enemyFlags.ts';
import { ENEMY_LIST, enemyIndex } from '../data/enemies.ts';
import { DMG_TARGET_TOWER, DMG_FLAG } from '../core/damageQueue.ts';
import { R_SPAWN, R_TOWER_BODY } from '../core/constants.ts';
import { bus, EV } from '../core/events.ts';

/**
 * Boss behaviour (SPEC §5.2).
 *
 * There is at most one boss alive, so its state lives here rather than in the
 * enemy pool: adding six columns to a 400-slot pool to serve one entity is the
 * wrong trade.
 *
 * Every special is a two-phase affair — a telegraph hazard appears first, then
 * the effect lands. Nothing a boss does arrives unannounced.
 */
export class BossSystem {
  /** Handle of the live boss, or -1. */
  handle = -1;
  defIdx = -1;

  private readonly cooldowns = new Float32Array(4);
  /** Which action is winding up, or -1. */
  private pendingAction = -1;
  private pendingT = 0;
  /** Cached target of the wind-up, so a dash commits to where it aimed. */
  private aimX = 0;
  private aimY = 0;
  /** Remaining dash time; the boss ignores steering while this runs. */
  private dashT = 0;
  private dashVx = 0;
  private dashVy = 0;

  reset(): void {
    this.handle = -1;
    this.defIdx = -1;
    this.cooldowns.fill(0);
    this.pendingAction = -1;
    this.pendingT = 0;
    this.dashT = 0;
  }

  /** Called by the spawner when a boss enters the arena. */
  register(handle: number, defIdx: number): void {
    this.reset();
    this.handle = handle;
    this.defIdx = defIdx;
    const def = BOSSES[defIdx];
    if (def === undefined) return;
    // Stagger the opening cooldowns so a boss does not fire everything at once
    // the moment it spawns.
    for (let a = 0; a < def.actions.length; a++) {
      this.cooldowns[a] = (def.actions[a]?.cooldown ?? 5) * 0.5 + a * 1.2;
    }
  }

  get def(): BossDef | undefined {
    return this.defIdx >= 0 ? BOSSES[this.defIdx] : undefined;
  }

  update(world: World, rng: Rng, dt: number): void {
    this.updateHazards(world, dt);
    if (this.handle < 0) return;

    const i = world.enemies.resolve(this.handle);
    if (i < 0) {
      this.reset();
      return;
    }
    const def = this.def;
    if (def === undefined) return;

    if (this.dashT > 0) {
      this.runDash(world, i, dt);
      return;
    }

    if (this.pendingAction >= 0) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) {
        this.fire(world, i, def, this.pendingAction, rng);
        this.pendingAction = -1;
      }
      return;
    }

    for (let a = 0; a < def.actions.length; a++) {
      const action = def.actions[a];
      if (action === undefined) continue;
      const cd = (this.cooldowns[a] ?? 0) - dt;
      this.cooldowns[a] = cd;
      if (cd > 0) continue;
      this.cooldowns[a] = action.cooldown;
      this.beginTelegraph(world, i, a, action.telegraph, action.kind, action.power);
      return; // one wind-up at a time
    }
  }

  private beginTelegraph(
    world: World,
    i: number,
    actionIdx: number,
    telegraph: number,
    kind: number,
    power: number,
  ): void {
    const e = world.enemies;
    this.pendingAction = actionIdx;
    this.pendingT = telegraph;
    this.aimX = world.tower.x;
    this.aimY = world.tower.y;

    // The warning is a real hazard entity so it is drawn, timed and cleaned up
    // by the same code that owns the effect.
    if (kind === BOSS_ACTION.GroundZone) {
      world.hazards.spawn(this.aimX, this.aimY, power, telegraph, telegraph, 0, HAZARD.Telegraph);
    } else if (kind === BOSS_ACTION.Dash) {
      world.hazards.spawn(e.x[i] ?? 0, e.y[i] ?? 0, 70, telegraph, telegraph, 0, HAZARD.Telegraph);
    } else {
      world.hazards.spawn(e.x[i] ?? 0, e.y[i] ?? 0, 90, telegraph, telegraph, 0, HAZARD.Telegraph);
    }
  }

  private fire(world: World, i: number, def: BossDef, actionIdx: number, rng: Rng): void {
    const action = def.actions[actionIdx];
    if (action === undefined) return;
    const e = world.enemies;

    switch (action.kind) {
      case BOSS_ACTION.Dash: {
        const dx = this.aimX - (e.x[i] ?? 0);
        const dy = this.aimY - (e.y[i] ?? 0);
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        this.dashVx = (dx / d) * action.power;
        this.dashVy = (dy / d) * action.power;
        this.dashT = action.duration;
        break;
      }
      case BOSS_ACTION.Summon: {
        const swarm = enemyIndex('swarmling');
        const swarmDef = ENEMY_LIST[swarm];
        if (swarmDef === undefined) break;
        const count = Math.round(action.power);
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2 + rng.next();
          const j = e.spawn(
            (e.x[i] ?? 0) + Math.cos(a) * 50,
            (e.y[i] ?? 0) + Math.sin(a) * 50,
            swarm,
            swarm,
            (e.hpMax[i] ?? 100) * 0.02,
            swarmDef.radius,
          );
          if (j < 0) break;
          e.applyArchetype(j, swarmDef);
          e.goldValue[j] = world.splitTemplate.gold;
          e.xpValue[j] = world.splitTemplate.xp;
        }
        break;
      }
      case BOSS_ACTION.Teleport: {
        const a = rng.angle();
        const r = action.power;
        e.x[i] = world.tower.x + Math.cos(a) * r;
        e.y[i] = world.tower.y + Math.sin(a) * r;
        e.prevX[i] = e.x[i] ?? 0;
        e.prevY[i] = e.y[i] ?? 0;
        break;
      }
      case BOSS_ACTION.GroundZone: {
        world.hazards.spawn(
          this.aimX,
          this.aimY,
          action.power,
          0,
          action.duration,
          ZONE_TUNING.damagePerTick,
          HAZARD.Zone,
        );
        break;
      }
      case BOSS_ACTION.Shield: {
        // Boss shielding is stored as bonus HP with a visible flash, rather
        // than a separate bar the HUD would have to explain.
        e.hp[i] = Math.min(e.hpMax[i] ?? 0, (e.hp[i] ?? 0) + (e.hpMax[i] ?? 0) * action.power);
        e.flash[i] = 1;
        break;
      }
      default:
        break;
    }
  }

  private runDash(world: World, i: number, dt: number): void {
    const e = world.enemies;
    this.dashT -= dt;
    e.vx[i] = this.dashVx;
    e.vy[i] = this.dashVy;
    if (this.dashT <= 0) {
      e.vx[i] = 0;
      e.vy[i] = 0;
    }
  }

  /** Ticks telegraphs and live zones, and damages the tower inside one. */
  private updateHazards(world: World, dt: number): void {
    const h = world.hazards;
    for (let i = 0; i < h.count; i++) {
      if (h.alive[i] === 0) continue;
      const tel = h.telegraphT[i] ?? 0;
      if (tel > 0) h.telegraphT[i] = Math.max(0, tel - dt);

      const life = (h.life[i] ?? 0) - dt;
      if (life <= 0) {
        h.free(i);
        continue;
      }
      h.life[i] = life;

      if ((h.kind[i] ?? 0) !== HAZARD.Zone || (h.telegraphT[i] ?? 0) > 0) continue;

      const tickT = (h.tickT[i] ?? 0) - dt;
      if (tickT > 0) {
        h.tickT[i] = tickT;
        continue;
      }
      h.tickT[i] = ZONE_TUNING.tickInterval;

      const dx = world.tower.x - (h.x[i] ?? 0);
      const dy = world.tower.y - (h.y[i] ?? 0);
      const r = (h.radius[i] ?? 0) + R_TOWER_BODY;
      if (dx * dx + dy * dy <= r * r) {
        world.queue.push(
          DMG_TARGET_TOWER,
          0,
          h.damage[i] ?? 0,
          DMG_FLAG.Area,
          h.x[i] ?? 0,
          h.y[i] ?? 0,
        );
      }
    }
  }

  /** True while the boss is dashing, so the AI leaves its velocity alone. */
  isDashing(handle: number): boolean {
    return this.dashT > 0 && this.handle === handle;
  }
}

/** Where a boss enters from. Kept here so the spawner has one place to ask. */
export function bossSpawnPoint(towerX: number, towerY: number, angle: number): {
  x: number;
  y: number;
} {
  return { x: towerX + Math.cos(angle) * R_SPAWN, y: towerY + Math.sin(angle) * R_SPAWN };
}

/** Announces a boss so the HUD can name it. */
export function announceBoss(defIdx: number): void {
  bus.emit(EV.BossSpawned, defIdx, 0, 0);
}

/** Kept for the flag check in the HUD without importing the whole enemy module. */
export const BOSS_FLAG = EF.Boss;
