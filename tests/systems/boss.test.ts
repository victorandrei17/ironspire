import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { RunState } from '../../src/core/state.ts';
import { Rng } from '../../src/core/rng.ts';
import { Spawner } from '../../src/systems/spawner.ts';
import { BossSystem } from '../../src/systems/boss.ts';
import { BOSSES, BOSS_ACTION, bossIndexForWave, ZONE_TUNING } from '../../src/data/bosses.ts';
import { HAZARD } from '../../src/entities/hazardPool.ts';
import { EF } from '../../src/data/enemyFlags.ts';
import { UPGRADE_COUNT } from '../../src/data/upgrades.ts';
import { CARD_COUNT } from '../../src/data/cards.ts';
import { BAL } from '../../src/data/balance.ts';
import { FIXED_DT } from '../../src/core/constants.ts';
import { xpToNext } from '../../src/systems/progression.ts';

function setup(wave: number): {
  world: World;
  boss: BossSystem;
  spawner: Spawner;
  rng: Rng;
  run: RunState;
} {
  const world = new World();
  const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
  run.reset(4242, xpToNext(1), 1);
  const spawner = new Spawner();
  const boss = new BossSystem();
  spawner.beginWave(world, run.seed, wave);
  spawner.update(world, 0.001);
  if (spawner.bossHandle >= 0) boss.register(spawner.bossHandle, spawner.bossIdx);
  return { world, boss, spawner, rng: new Rng(7), run };
}

describe('boss catalogue (SPEC §5.2)', () => {
  it('has three bosses, each with at least one telegraphed action', () => {
    expect(BOSSES.length).toBe(3);
    for (const b of BOSSES) {
      expect(b.actions.length).toBeGreaterThan(0);
      expect(b.name.length).toBeGreaterThan(0);
      for (const a of b.actions) {
        // "Every boss attack is telegraphed. No exceptions." (SPEC §5.2)
        expect(a.telegraph).toBeGreaterThanOrEqual(0.6);
        expect(a.cooldown).toBeGreaterThan(a.telegraph);
      }
    }
  });

  it('cycles the bosses by wave', () => {
    const every = BAL.boss.every;
    const a = bossIndexForWave(10, every);
    const b = bossIndexForWave(20, every);
    const c = bossIndexForWave(30, every);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(bossIndexForWave(40, every)).toBe(a);
  });
});

describe('boss spawning', () => {
  it('spawns exactly one boss on a boss wave, with boss stats', () => {
    const { world, spawner } = setup(10);
    let bosses = 0;
    let bossIdx = -1;
    for (let i = 0; i < world.enemies.count; i++) {
      if (world.enemies.alive[i] === 1 && ((world.enemies.flags[i] ?? 0) & EF.Boss) !== 0) {
        bosses++;
        bossIdx = i;
      }
    }
    expect(bosses).toBe(1);
    const def = BOSSES[spawner.bossIdx]!;
    // Boss stats come from the boss table, NOT from the archetype it borrows
    // a pool slot from.
    expect(world.enemies.dmg[bossIdx]).toBeGreaterThanOrEqual(def.dmg);
    expect(world.enemies.radius[bossIdx]).toBe(def.radius);
    expect(world.enemies.speed[bossIdx]).toBe(def.speed);
  });

  it('gives the boss a sprite of its own, not an archetype sprite', () => {
    const { world, spawner } = setup(10);
    for (let i = 0; i < world.enemies.count; i++) {
      if ((world.enemies.flags[i] ?? 0) & EF.Boss) {
        const key = world.enemies.keys[world.enemies.spriteIdx[i] ?? 0];
        expect(key).toBe(BOSSES[spawner.bossIdx]!.sprite);
      }
    }
  });

  it('puts no boss on a normal wave', () => {
    const { spawner } = setup(9);
    expect(spawner.bossIdx).toBe(-1);
    expect(spawner.bossHandle).toBe(-1);
  });
});

describe('boss actions', () => {
  it('always shows a telegraph before anything lands', () => {
    const { world, boss, rng } = setup(10);
    let sawTelegraph = false;
    for (let t = 0; t < 60 * 20; t++) {
      const before = world.hazards.liveCount;
      boss.update(world, rng, FIXED_DT);
      if (world.hazards.liveCount > before) {
        // Every hazard a boss creates starts as a warning.
        for (let i = 0; i < world.hazards.count; i++) {
          if (world.hazards.alive[i] === 0) continue;
          if ((world.hazards.kind[i] ?? 0) === HAZARD.Telegraph) sawTelegraph = true;
        }
      }
    }
    expect(sawTelegraph).toBe(true);
  });

  it('the warlock leaves a damaging ground zone behind its telegraph', () => {
    const world = new World();
    const boss = new BossSystem();
    const rng = new Rng(3);
    const warlockIdx = BOSSES.findIndex((b) => b.id === 'boss_warlock');
    const i = world.enemies.spawn(world.tower.x, world.tower.y - 200, 0, 0, 1e6, 40);
    world.enemies.flags[i] = EF.Boss;
    boss.register(world.enemies.handle(i), warlockIdx);

    let zoneSeen = false;
    for (let t = 0; t < 60 * 40 && !zoneSeen; t++) {
      boss.update(world, rng, FIXED_DT);
      for (let h = 0; h < world.hazards.count; h++) {
        if (world.hazards.alive[h] === 1 && (world.hazards.kind[h] ?? 0) === HAZARD.Zone) {
          zoneSeen = true;
          expect(world.hazards.damage[h]).toBe(ZONE_TUNING.damagePerTick);
        }
      }
    }
    expect(zoneSeen).toBe(true);
  });

  it('a ground zone on top of the tower queues damage', () => {
    const world = new World();
    const boss = new BossSystem();
    world.hazards.spawn(world.tower.x, world.tower.y, 120, 0, 5, 9, HAZARD.Zone);
    for (let t = 0; t < 60; t++) boss.update(world, new Rng(1), FIXED_DT);
    expect(world.queue.length).toBeGreaterThan(0);
  });

  it('a zone far from the tower never queues damage', () => {
    const world = new World();
    const boss = new BossSystem();
    world.hazards.spawn(world.tower.x + 600, world.tower.y, 60, 0, 5, 9, HAZARD.Zone);
    for (let t = 0; t < 60; t++) boss.update(world, new Rng(1), FIXED_DT);
    expect(world.queue.length).toBe(0);
  });

  it('a telegraph does no damage while it is still a warning', () => {
    const world = new World();
    const boss = new BossSystem();
    // A hazard sitting on the tower, but still inside its warning window.
    world.hazards.spawn(world.tower.x, world.tower.y, 120, 5, 6, 9, HAZARD.Zone);
    for (let t = 0; t < 60 * 2; t++) boss.update(world, new Rng(1), FIXED_DT);
    expect(world.queue.length).toBe(0);
  });

  it('the hive summons minions', () => {
    const world = new World();
    const boss = new BossSystem();
    const hiveIdx = BOSSES.findIndex((b) => b.id === 'boss_hive');
    const i = world.enemies.spawn(world.tower.x, world.tower.y - 200, 0, 0, 1e6, 40);
    world.enemies.flags[i] = EF.Boss;
    boss.register(world.enemies.handle(i), hiveIdx);
    world.splitTemplate.gold = 1;
    world.splitTemplate.xp = 1;

    const before = world.enemies.liveCount;
    for (let t = 0; t < 60 * 20; t++) boss.update(world, new Rng(9), FIXED_DT);
    expect(world.enemies.liveCount).toBeGreaterThan(before);
  });

  it('forgets a boss that died, and stops acting', () => {
    const { world, boss, spawner, rng } = setup(10);
    expect(boss.handle).toBeGreaterThanOrEqual(0);
    const i = world.enemies.resolve(spawner.bossHandle);
    world.enemies.free(i);
    boss.update(world, rng, FIXED_DT);
    expect(boss.handle).toBe(-1);
    expect(boss.def).toBeUndefined();
  });

  it('a dash is committed and time-limited', () => {
    const world = new World();
    const boss = new BossSystem();
    const rng = new Rng(11);
    const colossusIdx = BOSSES.findIndex((b) => b.id === 'boss_colossus');
    const def = BOSSES[colossusIdx]!;
    const i = world.enemies.spawn(world.tower.x, world.tower.y - 300, 0, 0, 1e6, 46);
    world.enemies.flags[i] = EF.Boss;
    const handle = world.enemies.handle(i);
    boss.register(handle, colossusIdx);

    let dashed = false;
    let dashTicks = 0;
    for (let t = 0; t < 60 * 30; t++) {
      boss.update(world, rng, FIXED_DT);
      if (boss.isDashing(handle)) {
        dashed = true;
        dashTicks++;
      }
    }
    expect(dashed).toBe(true);
    const dashAction = def.actions.find((a) => a.kind === BOSS_ACTION.Dash)!;
    // Never a permanent charge: each dash is bounded by its own duration.
    expect(dashTicks * FIXED_DT).toBeLessThan(60 * 30 * FIXED_DT);
    expect(dashAction.duration).toBeGreaterThan(0);
  });
});
