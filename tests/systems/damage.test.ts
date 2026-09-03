import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { RunState } from '../../src/core/state.ts';
import { UPGRADE_COUNT } from '../../src/data/upgrades.ts';
import { CARD_COUNT } from '../../src/data/cards.ts';
import { Rng } from '../../src/core/rng.ts';
import { resolveDamage, killEnemy } from '../../src/systems/damage.ts';
import { DMG_TARGET_ENEMY, DMG_TARGET_TOWER, DMG_FLAG } from '../../src/core/damageQueue.ts';
import { ST, TF } from '../../src/entities/tower.ts';
import { EF } from '../../src/data/enemyFlags.ts';
import { ENEMY_TUNING, enemyIndex, ENEMY_LIST } from '../../src/data/enemies.ts';
import { BAL } from '../../src/data/balance.ts';
import { FIXED_DT } from '../../src/core/constants.ts';

function makeWorld(): { world: World; run: RunState; rng: Rng } {
  const world = new World();
  const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
  run.reset(1, BAL.progression.xpBase, 1);
  return { world, run, rng: new Rng(1234) };
}

function spawnEnemy(world: World, id: string, hp: number, x = 100, y = 100): number {
  const idx = enemyIndex(id as never);
  const def = ENEMY_LIST[idx]!;
  const i = world.enemies.spawn(x, y, idx, idx, hp, def.radius);
  world.enemies.applyArchetype(i, def);
  return i;
}

describe('damage resolution (the only place HP changes)', () => {
  it('subtracts plain damage and spawns a number', () => {
    const { world, run, rng } = makeWorld();
    const i = spawnEnemy(world, 'grunt', 100);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 30, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.enemies.hp[i]).toBeCloseTo(70);
    expect(world.damageNumbers.liveCount).toBe(1);
    expect(run.damageDealt).toBeCloseTo(30);
  });

  it('empties the queue after resolving', () => {
    const { world, run, rng } = makeWorld();
    const i = spawnEnemy(world, 'grunt', 100);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 10, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.queue.length).toBe(0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.enemies.hp[i]).toBeCloseTo(90); // not applied twice
  });

  it('ignores a hit aimed at a recycled slot', () => {
    const { world, run, rng } = makeWorld();
    const i = spawnEnemy(world, 'grunt', 100);
    const stale = world.enemies.handle(i);
    world.enemies.free(i);
    const j = spawnEnemy(world, 'brute', 500);
    expect(j).toBe(i); // same slot reused
    world.queue.push(DMG_TARGET_ENEMY, stale, 999, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.enemies.hp[j]).toBe(500);
  });

  it('applies crit exactly once, with the crit multiplier', () => {
    const { world, run, rng } = makeWorld();
    world.tower.stats.flatRun[ST.CritChance] = 1; // guaranteed
    world.tower.stats.markDirty();
    const i = spawnEnemy(world, 'grunt', 1000);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 10, DMG_FLAG.CanCrit, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(1000 - world.enemies.hp[i]!).toBeCloseTo(10 * BAL.tower.critMult);
  });

  it('does not crit a hit that is not flagged for it', () => {
    const { world, run, rng } = makeWorld();
    world.tower.stats.flatRun[ST.CritChance] = 1;
    world.tower.stats.markDirty();
    const i = spawnEnemy(world, 'grunt', 1000);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 10, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(1000 - world.enemies.hp[i]!).toBeCloseTo(10);
  });

  it('cuts damage hitting a warden from the front, not from behind', () => {
    const { world, run, rng } = makeWorld();
    const front = spawnEnemy(world, 'warden', 1000, 100, 0);
    const back = spawnEnemy(world, 'warden', 1000, 300, 0);
    // Both face left (towards the origin, where the shot comes from).
    world.enemies.rot[front] = Math.PI;
    world.enemies.rot[back] = 0;
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(front), 100, 0, 0, 0);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(back), 100, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(1000 - world.enemies.hp[front]!).toBeCloseTo(
      100 * (1 - ENEMY_TUNING.shieldReduction),
    );
    expect(1000 - world.enemies.hp[back]!).toBeCloseTo(100);
  });

  it('area damage ignores the warden shield', () => {
    const { world, run, rng } = makeWorld();
    const i = spawnEnemy(world, 'warden', 1000, 100, 0);
    world.enemies.rot[i] = Math.PI;
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 100, DMG_FLAG.Area, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(1000 - world.enemies.hp[i]!).toBeCloseTo(100);
  });

  it('caps lifesteal per hit', () => {
    const { world, run, rng } = makeWorld();
    const s = world.tower.stats;
    s.flags |= TF.Lifesteal;
    s.lifestealPct = 0.5;
    s.lifestealCap = 3;
    world.tower.hp = 10;
    const i = spawnEnemy(world, 'grunt', 10_000);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 1000, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBeCloseTo(13); // 10 + min(500, 3)
  });

  it('never heals past max HP', () => {
    const { world, run, rng } = makeWorld();
    const s = world.tower.stats;
    s.flags |= TF.Lifesteal;
    s.lifestealPct = 1;
    s.lifestealCap = 1000;
    const i = spawnEnemy(world, 'grunt', 10_000);
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 500, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBe(world.tower.hpMax);
  });
});

describe('tower damage', () => {
  it('applies damage, then grants i-frames', () => {
    const { world, run, rng } = makeWorld();
    world.queue.push(DMG_TARGET_TOWER, 0, 10, DMG_FLAG.Melee, 0, 0);
    world.queue.push(DMG_TARGET_TOWER, 0, 10, DMG_FLAG.Melee, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    // Second hit lands inside the i-frame window and is ignored.
    expect(world.tower.hpMax - world.tower.hp).toBeCloseTo(10);
    expect(world.tower.iframe).toBeGreaterThan(0);
  });

  it('a shield absorbs before HP, and the overflow still lands', () => {
    const { world, run, rng } = makeWorld();
    world.tower.shieldHp = 4;
    world.tower.shieldT = 5;
    world.queue.push(DMG_TARGET_TOWER, 0, 10, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.shieldHp).toBe(0);
    expect(world.tower.hpMax - world.tower.hp).toBeCloseTo(6);
  });

  it('marks the run over when the tower dies, and never goes below zero', () => {
    const { world, run, rng } = makeWorld();
    world.queue.push(DMG_TARGET_TOWER, 0, 99_999, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBe(0);
    expect(run.over).toBe(true);
  });

  it('thorns reflects onto the attacker, through the queue', () => {
    const { world, run, rng } = makeWorld();
    const s = world.tower.stats;
    s.flags |= TF.Thorns;
    s.thornsPct = 0.5;
    const i = spawnEnemy(world, 'grunt', 100, world.tower.x + 20, world.tower.y);
    world.queue.push(
      DMG_TARGET_TOWER,
      0,
      20,
      DMG_FLAG.Melee,
      world.tower.x + 20,
      world.tower.y,
    );
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.enemies.hp[i]).toBeCloseTo(90); // 20 * 0.5
  });

  it('regen and overcharge drain both run through the same tick', () => {
    const { world, run, rng } = makeWorld();
    world.tower.stats.flatRun[ST.HpRegen] = 60; // 1 HP per tick at 60 Hz
    world.tower.stats.markDirty();
    world.tower.hp = 50;
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBeCloseTo(51);

    world.tower.stats.flags |= TF.Overcharge;
    world.tower.stats.overchargeDrainPct = 1; // 100% of max per second
    world.tower.hp = 50;
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBeLessThan(51);
  });

  it('overcharge can never kill the tower on its own', () => {
    const { world, run, rng } = makeWorld();
    world.tower.stats.flags |= TF.Overcharge;
    world.tower.stats.overchargeDrainPct = 10;
    world.tower.hp = 2;
    for (let t = 0; t < 600; t++) resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBe(1);
    expect(run.over).toBe(false);
  });
});

describe('death path', () => {
  it('drops gold and XP, counts the kill and frees the slot', () => {
    const { world, run, rng } = makeWorld();
    const i = spawnEnemy(world, 'grunt', 10);
    world.enemies.goldValue[i] = 7;
    world.enemies.xpValue[i] = 3;
    world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), 10, 0, 0, 0);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.enemies.alive[i]).toBe(0);
    expect(run.kills).toBe(1);
    expect(world.pickups.liveCount).toBe(2);
    expect(world.particles.liveCount).toBeGreaterThan(0);
  });

  it('scales gold by the wave bonus and the gold multiplier', () => {
    const { world, run, rng } = makeWorld();
    run.waveGoldBonus = 1.15;
    world.tower.stats.flatRun[ST.GoldMult] = 1; // base 1 + 1 = 2x
    world.tower.stats.markDirty();
    const i = spawnEnemy(world, 'grunt', 10);
    world.enemies.goldValue[i] = 10;
    world.enemies.xpValue[i] = 0;
    killEnemy(world, run, i, rng);
    expect(world.pickups.value[0]).toBeCloseTo(10 * 1.15 * 2, 4);
  });

  it('a splitter leaves children behind', () => {
    const { world, run, rng } = makeWorld();
    world.splitTemplate.defIdx = enemyIndex('swarmling');
    world.splitTemplate.radius = 10;
    world.splitTemplate.speed = 80;
    const i = spawnEnemy(world, 'splitter', 100);
    world.enemies.hpMax[i] = 100;
    killEnemy(world, run, i, rng);
    expect(world.enemies.liveCount).toBe(ENEMY_TUNING.splitCount);
    for (let k = 0; k < world.enemies.count; k++) {
      if (world.enemies.alive[k] === 0) continue;
      expect(world.enemies.hp[k]).toBeCloseTo(100 * ENEMY_TUNING.splitHpFraction);
    }
  });

  it('an explosive elite hurts the tower only when it dies close by', () => {
    const { world, run, rng } = makeWorld();
    const far = spawnEnemy(world, 'grunt', 10, world.tower.x + 500, world.tower.y);
    world.enemies.flags[far] = (world.enemies.flags[far] ?? 0) | EF.ExplosiveAffix;
    killEnemy(world, run, far, rng);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBe(world.tower.hpMax);

    const near = spawnEnemy(world, 'grunt', 10, world.tower.x + 20, world.tower.y);
    world.enemies.flags[near] = (world.enemies.flags[near] ?? 0) | EF.ExplosiveAffix;
    killEnemy(world, run, near, rng);
    resolveDamage(world, run, rng, FIXED_DT);
    expect(world.tower.hp).toBeLessThan(world.tower.hpMax);
  });

  it('never produces NaN HP from any damage value', () => {
    const { world, run, rng } = makeWorld();
    for (const amount of [0, 1e-9, 1e9, 1e300]) {
      const i = spawnEnemy(world, 'grunt', 1e12);
      world.queue.push(DMG_TARGET_ENEMY, world.enemies.handle(i), amount, DMG_FLAG.CanCrit, 0, 0);
      resolveDamage(world, run, rng, FIXED_DT);
      expect(Number.isNaN(world.enemies.hp[i])).toBe(false);
      world.enemies.free(i);
    }
    expect(Number.isNaN(world.tower.hp)).toBe(false);
  });
});
