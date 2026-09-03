import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { RunState } from '../../src/core/state.ts';
import { UPGRADE_COUNT } from '../../src/data/upgrades.ts';
import { CARD_COUNT } from '../../src/data/cards.ts';
import { Rng } from '../../src/core/rng.ts';
import { ProjectileSystem, segmentCircleT } from '../../src/systems/projectiles.ts';
import { integrateProjectiles } from '../../src/systems/movement.ts';
import { updateWeapons } from '../../src/systems/weapons.ts';
import { resolveDamage } from '../../src/systems/damage.ts';
import { PF } from '../../src/entities/projectilePool.ts';
import { PROJ_SPRITE_BOLT } from '../../src/entities/world.ts';
import { ST, TF } from '../../src/entities/tower.ts';
import { BAL } from '../../src/data/balance.ts';
import { enemyIndex, ENEMY_LIST, ENEMY_TUNING } from '../../src/data/enemies.ts';
import { FIXED_DT } from '../../src/core/constants.ts';

function spawn(world: World, id: string, x: number, y: number, hp = 1e6): number {
  const idx = enemyIndex(id as never);
  const def = ENEMY_LIST[idx]!;
  const i = world.enemies.spawn(x, y, idx, idx, hp, def.radius);
  world.enemies.applyArchetype(i, def);
  return i;
}

describe('segmentCircleT', () => {
  it('returns 0 when the segment starts inside the circle', () => {
    expect(segmentCircleT(0, 0, 10, 0, 0, 0, 5)).toBe(0);
  });

  it('finds the entry point of a crossing segment', () => {
    // From x=-10 to x=10 through a circle of radius 2 at the origin.
    const t = segmentCircleT(-10, 0, 10, 0, 0, 0, 2);
    expect(t).toBeCloseTo(0.4, 5);
  });

  it('misses when the segment passes beside the circle', () => {
    expect(segmentCircleT(-10, 5, 10, 5, 0, 0, 2)).toBe(-1);
  });

  it('misses when the circle is beyond the end of the segment', () => {
    expect(segmentCircleT(0, 0, 5, 0, 100, 0, 2)).toBe(-1);
  });

  it('handles a zero-length segment', () => {
    expect(segmentCircleT(0, 0, 0, 0, 100, 0, 2)).toBe(-1);
    expect(segmentCircleT(0, 0, 0, 0, 1, 0, 2)).toBe(0);
  });
});

describe('projectile collision', () => {
  it('a fast projectile does not tunnel through a small enemy', () => {
    const world = new World();
    const sys = new ProjectileSystem();
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const rng = new Rng(7);

    // Swarmling radius 10; a 900 u/s bolt covers 15 u per tick, so a point test
    // at the new position would miss it entirely.
    const target = spawn(world, 'swarmling', 300, 0, 1e6);
    const speed = BAL.tower.projSpeed;
    const i = world.projectiles.spawn(0, 0, speed, 0, 25, BAL.tower.projRadius, 2, PROJ_SPRITE_BOLT, 0);
    expect(i).toBeGreaterThanOrEqual(0);

    let hit = false;
    for (let t = 0; t < 60 && !hit; t++) {
      integrateProjectiles(world.projectiles, FIXED_DT);
      world.rebuildHash();
      sys.update(world);
      if (world.queue.length > 0) hit = true;
      resolveDamage(world, run, rng, FIXED_DT);
    }
    expect(hit).toBe(true);
    expect(world.enemies.hp[target]).toBeLessThan(1e6);
  });

  it('a spent projectile is freed after its single hit', () => {
    const world = new World();
    const sys = new ProjectileSystem();
    spawn(world, 'grunt', 60, 0);
    const i = world.projectiles.spawn(0, 0, 900, 0, 10, 6, 2, PROJ_SPRITE_BOLT, 0);
    for (let t = 0; t < 10 && world.projectiles.alive[i] === 1; t++) {
      integrateProjectiles(world.projectiles, FIXED_DT);
      world.rebuildHash();
      sys.update(world);
    }
    expect(world.projectiles.alive[i]).toBe(0);
  });

  it('pierce lets one shot hit several enemies and never the same one twice', () => {
    const world = new World();
    const sys = new ProjectileSystem();
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const rng = new Rng(3);

    for (let k = 0; k < 3; k++) spawn(world, 'grunt', 80 + k * 60, 0);
    const i = world.projectiles.spawn(0, 0, 900, 0, 10, 6, 2, PROJ_SPRITE_BOLT, 0);
    world.projectiles.pierce[i] = 2; // 1 + 2 = three enemies

    let hits = 0;
    for (let t = 0; t < 30; t++) {
      integrateProjectiles(world.projectiles, FIXED_DT);
      world.rebuildHash();
      sys.update(world);
      hits += world.queue.length;
      resolveDamage(world, run, rng, FIXED_DT);
    }
    expect(hits).toBe(3);
  });

  it('a hostile projectile damages the tower and nothing else', () => {
    const world = new World();
    const sys = new ProjectileSystem();
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const rng = new Rng(5);

    const bystander = spawn(world, 'grunt', world.tower.x, world.tower.y - 120);
    const i = world.projectiles.spawn(
      world.tower.x,
      world.tower.y - 200,
      0,
      300,
      9,
      ENEMY_TUNING.projectileRadius,
      3,
      1,
      PF.Hostile,
    );
    for (let t = 0; t < 90 && world.projectiles.alive[i] === 1; t++) {
      integrateProjectiles(world.projectiles, FIXED_DT);
      world.rebuildHash();
      sys.update(world);
      resolveDamage(world, run, rng, FIXED_DT);
    }
    expect(world.tower.hp).toBeCloseTo(world.tower.hpMax - 9);
    expect(world.enemies.hp[bystander]).toBe(1e6);
  });

  it('chain redirects a spent shot at a new target with reduced damage', () => {
    const world = new World();
    const sys = new ProjectileSystem();
    const stats = world.tower.stats;
    stats.flags |= TF.Chain;
    stats.chainJumps = 1;
    stats.chainRadius = 140;
    stats.chainFalloff = 0.6;

    spawn(world, 'grunt', 80, 0);
    spawn(world, 'grunt', 140, 0);
    const i = world.projectiles.spawn(0, 0, 900, 0, 100, 6, 2, PROJ_SPRITE_BOLT, PF.Chaining);
    world.projectiles.chain[i] = stats.chainJumps;
    for (let t = 0; t < 10; t++) {
      integrateProjectiles(world.projectiles, FIXED_DT);
      world.rebuildHash();
      sys.update(world);
      if (world.projectiles.alive[i] === 0) break;
      if ((world.projectiles.chain[i] ?? 1) === 0) break;
    }
    expect(world.projectiles.alive[i]).toBe(1);
    expect(world.projectiles.chain[i]).toBe(0);
    expect(world.projectiles.damage[i]).toBeCloseTo(60);
  });

  it('deathmark executes a wounded non-boss', () => {
    const world = new World();
    const sys = new ProjectileSystem();
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const rng = new Rng(11);
    const stats = world.tower.stats;
    stats.flags |= TF.Deathmark;
    stats.deathmarkEvery = 12;
    stats.deathmarkThreshold = 0.15;
    stats.deathmarkBossMult = 4;

    const i = spawn(world, 'brute', 80, 0, 1000);
    world.enemies.hp[i] = 100; // 10% of max: below the execute threshold
    const p = world.projectiles.spawn(0, 0, 900, 0, 1, 6, 2, PROJ_SPRITE_BOLT, PF.Deathmarked);
    void p;
    for (let t = 0; t < 10 && world.enemies.alive[i] === 1; t++) {
      integrateProjectiles(world.projectiles, FIXED_DT);
      world.rebuildHash();
      sys.update(world);
      resolveDamage(world, run, rng, FIXED_DT);
    }
    expect(world.enemies.alive[i]).toBe(0);
  });
});

describe('weapons', () => {
  it('fires at the configured interval, no faster', () => {
    const world = new World();
    const i = spawn(world, 'grunt', world.tower.x + 100, world.tower.y);
    world.tower.targetHandle = world.enemies.handle(i);

    const shotTicks: number[] = [];
    for (let t = 0; t < 600; t++) {
      const before = world.projectiles.liveCount;
      updateWeapons(world, FIXED_DT);
      if (world.projectiles.liveCount > before) shotTicks.push(t);
      world.projectiles.reset();
    }
    const expectedGap = 60 / BAL.tower.fireRate; // 50 ticks at 1.2/s
    expect(shotTicks.length).toBeGreaterThan(10);
    for (let k = 1; k < shotTicks.length; k++) {
      expect(shotTicks[k]! - shotTicks[k - 1]!).toBe(Math.round(expectedGap));
    }
  });

  it('spreads multiple projectiles into a fan centred on the aim', () => {
    const world = new World();
    world.tower.stats.flatRun[ST.Projectiles] = 2; // 3 total
    world.tower.stats.markDirty();
    const i = spawn(world, 'grunt', world.tower.x + 100, world.tower.y);
    world.tower.targetHandle = world.enemies.handle(i);
    updateWeapons(world, FIXED_DT);

    expect(world.projectiles.liveCount).toBe(3);
    const angles: number[] = [];
    for (let k = 0; k < world.projectiles.count; k++) {
      if (world.projectiles.alive[k] === 0) continue;
      angles.push(Math.atan2(world.projectiles.vy[k]!, world.projectiles.vx[k]!));
    }
    angles.sort((a, b) => a - b);
    expect(angles[1]).toBeCloseTo(0, 5); // centred on the target
    expect(angles[2]! - angles[1]!).toBeCloseTo(BAL.tower.spreadRad, 5);
    expect(angles[1]! - angles[0]!).toBeCloseTo(BAL.tower.spreadRad, 5);
  });

  it('does not fire without a target', () => {
    const world = new World();
    for (let t = 0; t < 120; t++) updateWeapons(world, FIXED_DT);
    expect(world.projectiles.liveCount).toBe(0);
  });

  it('a long stall does not queue a burst of shots', () => {
    const world = new World();
    const i = spawn(world, 'grunt', world.tower.x + 100, world.tower.y);
    world.tower.targetHandle = world.enemies.handle(i);
    updateWeapons(world, 10); // ten seconds in one step
    expect(world.projectiles.liveCount).toBe(1);
  });
});
