import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { TargetingSystem } from '../../src/systems/targeting.ts';
import { POLICY } from '../../src/core/state.ts';
import { ST } from '../../src/entities/tower.ts';
import { EF } from '../../src/data/enemyFlags.ts';
import { enemyIndex, ENEMY_LIST, ENEMY_TUNING } from '../../src/data/enemies.ts';
import { FIXED_DT, TARGETING_HZ } from '../../src/core/constants.ts';

function spawn(world: World, id: string, x: number, y: number, hp = 100): number {
  const idx = enemyIndex(id as never);
  const def = ENEMY_LIST[idx]!;
  const i = world.enemies.spawn(x, y, idx, idx, hp, def.radius);
  world.enemies.applyArchetype(i, def);
  return i;
}

/** Runs targeting long enough for the 10 Hz acquisition to fire. */
function acquire(world: World, t: TargetingSystem, policy: number): number {
  world.rebuildHash();
  for (let k = 0; k < Math.ceil(60 / TARGETING_HZ) + 2; k++) {
    t.update(world.tower, world.enemies, world.hash, policy as never, FIXED_DT);
  }
  return world.enemies.resolve(world.tower.targetHandle);
}

describe('targeting policies (SPEC §4.2)', () => {
  it('CLOSEST picks the nearest enemy in range', () => {
    const world = new World();
    const t = new TargetingSystem();
    const far = spawn(world, 'grunt', world.tower.x + 250, world.tower.y);
    const near = spawn(world, 'grunt', world.tower.x + 80, world.tower.y);
    expect(acquire(world, t, POLICY.Closest)).toBe(near);
    expect(far).not.toBe(near);
  });

  it('STRONGEST picks the highest current HP', () => {
    const world = new World();
    const t = new TargetingSystem();
    spawn(world, 'grunt', world.tower.x + 80, world.tower.y, 50);
    const big = spawn(world, 'grunt', world.tower.x + 250, world.tower.y, 900);
    expect(acquire(world, t, POLICY.Strongest)).toBe(big);
  });

  it('WEAKEST finishes off the lowest HP', () => {
    const world = new World();
    const t = new TargetingSystem();
    spawn(world, 'grunt', world.tower.x + 80, world.tower.y, 900);
    const weak = spawn(world, 'grunt', world.tower.x + 250, world.tower.y, 5);
    expect(acquire(world, t, POLICY.Weakest)).toBe(weak);
  });

  it('FASTEST picks the highest current speed', () => {
    const world = new World();
    const t = new TargetingSystem();
    spawn(world, 'brute', world.tower.x + 80, world.tower.y);
    const runner = spawn(world, 'runner', world.tower.x + 250, world.tower.y);
    expect(acquire(world, t, POLICY.Fastest)).toBe(runner);
  });

  it('FASTEST accounts for a slow, not just the base speed', () => {
    const world = new World();
    const t = new TargetingSystem();
    const runner = spawn(world, 'runner', world.tower.x + 250, world.tower.y);
    const grunt = spawn(world, 'grunt', world.tower.x + 80, world.tower.y);
    world.enemies.slowT[runner] = 5;
    world.enemies.slowMul[runner] = 0.1; // 105 * 0.1 = 10.5, slower than a grunt
    expect(acquire(world, t, POLICY.Fastest)).toBe(grunt);
  });

  it('BOSS_FIRST outranks everything, then falls back to closest', () => {
    const world = new World();
    const t = new TargetingSystem();
    spawn(world, 'grunt', world.tower.x + 40, world.tower.y);
    const boss = spawn(world, 'brute', world.tower.x + 260, world.tower.y);
    world.enemies.flags[boss] = (world.enemies.flags[boss] ?? 0) | EF.Boss;
    expect(acquire(world, t, POLICY.BossFirst)).toBe(boss);

    world.enemies.free(boss);
    world.tower.targetHandle = -1;
    const nearer = spawn(world, 'grunt', world.tower.x + 30, world.tower.y);
    expect(acquire(world, t, POLICY.BossFirst)).toBe(nearer);
  });

  it('ignores enemies beyond range', () => {
    const world = new World();
    const t = new TargetingSystem();
    const range = world.tower.stats.get(ST.Range);
    spawn(world, 'grunt', world.tower.x + range + 60, world.tower.y);
    expect(acquire(world, t, POLICY.Closest)).toBe(-1);
  });

  it('ignores a wraith while it is phased out', () => {
    const world = new World();
    const t = new TargetingSystem();
    const w = spawn(world, 'wraith', world.tower.x + 80, world.tower.y);
    world.enemies.phaseT[w] = 0; // inside the immune window
    expect(acquire(world, t, POLICY.Closest)).toBe(-1);

    world.enemies.phaseT[w] = ENEMY_TUNING.phaseOn + 0.1; // vulnerable again
    expect(acquire(world, t, POLICY.Closest)).toBe(w);
  });

  it('CLOSEST abandons its target the moment a nearer enemy appears', () => {
    const world = new World();
    const t = new TargetingSystem();
    const first = spawn(world, 'grunt', world.tower.x + 200, world.tower.y);
    expect(acquire(world, t, POLICY.Closest)).toBe(first);
    const nearer = spawn(world, 'grunt', world.tower.x + 30, world.tower.y);
    // The point of the policy: "closest" that keeps shooting whatever WAS
    // closest is not doing what its name says.
    expect(acquire(world, t, POLICY.Closest)).toBe(nearer);
  });

  it('CLOSEST follows a target that walks in, without waiting for a death', () => {
    const world = new World();
    const t = new TargetingSystem();
    const near = spawn(world, 'grunt', world.tower.x + 60, world.tower.y);
    const far = spawn(world, 'grunt', world.tower.x + 220, world.tower.y);
    expect(acquire(world, t, POLICY.Closest)).toBe(near);
    // The far one closes in and overtakes; nobody died in between.
    world.enemies.x[far] = world.tower.x + 20;
    expect(acquire(world, t, POLICY.Closest)).toBe(far);
  });

  it('every other policy stays sticky, so the cannon does not jitter', () => {
    const world = new World();
    const t = new TargetingSystem();
    const first = spawn(world, 'grunt', world.tower.x + 200, world.tower.y, 100);
    expect(acquire(world, t, POLICY.Strongest)).toBe(first);
    // A stronger enemy shows up; STRONGEST keeps its target until it is gone.
    spawn(world, 'grunt', world.tower.x + 30, world.tower.y, 500);
    expect(acquire(world, t, POLICY.Strongest)).toBe(first);
  });

  it('drops a target that dies or leaves range', () => {
    const world = new World();
    const t = new TargetingSystem();
    const i = spawn(world, 'grunt', world.tower.x + 100, world.tower.y);
    expect(acquire(world, t, POLICY.Closest)).toBe(i);
    world.enemies.free(i);
    t.update(world.tower, world.enemies, world.hash, POLICY.Closest, FIXED_DT);
    expect(world.tower.targetHandle).toBe(-1);

    const j = spawn(world, 'grunt', world.tower.x + 100, world.tower.y);
    expect(acquire(world, t, POLICY.Closest)).toBe(j);
    world.enemies.x[j] = world.tower.x + 9999;
    t.update(world.tower, world.enemies, world.hash, POLICY.Closest, FIXED_DT);
    expect(world.tower.targetHandle).toBe(-1);
  });
});
