import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { AbilitySystem } from '../../src/systems/abilities.ts';
import { ABILITIES, ABILITY, ABILITY_COUNT } from '../../src/data/abilities.ts';
import { ST } from '../../src/entities/tower.ts';
import { enemyIndex, ENEMY_LIST } from '../../src/data/enemies.ts';
import { EF } from '../../src/data/enemyFlags.ts';
import { FIXED_DT } from '../../src/core/constants.ts';

function spawn(world: World, id: string, x: number, y: number, hp = 1e6): number {
  const idx = enemyIndex(id as never);
  const def = ENEMY_LIST[idx]!;
  const i = world.enemies.spawn(x, y, idx, idx, hp, def.radius);
  world.enemies.applyArchetype(i, def);
  return i;
}

function unlockAll(a: AbilitySystem): void {
  a.unlocked.fill(1);
}

describe('ability catalogue (SPEC §9)', () => {
  it('has three abilities with sane cooldowns', () => {
    expect(ABILITY_COUNT).toBe(3);
    for (const a of ABILITIES) {
      expect(a.cooldown).toBeGreaterThan(0);
      expect(a.duration).toBeGreaterThanOrEqual(0);
      expect(a.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('casting', () => {
  it('refuses a locked ability', () => {
    const world = new World();
    const a = new AbilitySystem();
    expect(a.cast(world, ABILITY.Nova)).toBe(false);
  });

  it('goes on cooldown after a cast and comes back', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    expect(a.cast(world, ABILITY.Nova)).toBe(true);
    expect(a.canCast(ABILITY.Nova)).toBe(false);
    expect(a.cast(world, ABILITY.Nova)).toBe(false);

    const cd = ABILITIES[ABILITY.Nova].cooldown;
    for (let t = 0; t < Math.ceil(cd / FIXED_DT) + 2; t++) a.update(world, FIXED_DT);
    expect(a.canCast(ABILITY.Nova)).toBe(true);
  });

  it('readiness goes from 0 to 1 across the cooldown', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    a.cast(world, ABILITY.Nova);
    expect(a.readiness(ABILITY.Nova)).toBeLessThan(0.1);
    for (let t = 0; t < 60 * 10; t++) a.update(world, FIXED_DT);
    const mid = a.readiness(ABILITY.Nova);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.9);
  });
});

describe('nova', () => {
  it('damages and pushes enemies inside its radius only', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    const def = ABILITIES[ABILITY.Nova];
    const near = spawn(world, 'grunt', world.tower.x + 100, world.tower.y);
    const far = spawn(world, 'grunt', world.tower.x + def.radius + 200, world.tower.y);
    const nearX = world.enemies.x[near]!;
    const farX = world.enemies.x[far]!;
    world.rebuildHash();

    a.cast(world, ABILITY.Nova);
    expect(world.queue.length).toBe(1);
    expect(world.enemies.x[near]!).toBeGreaterThan(nearX); // pushed outward
    expect(world.enemies.x[far]!).toBe(farX);
  });

  it('does not push a boss', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    const i = spawn(world, 'brute', world.tower.x + 80, world.tower.y);
    world.enemies.flags[i] = (world.enemies.flags[i] ?? 0) | EF.Boss;
    const x = world.enemies.x[i]!;
    world.rebuildHash();
    a.cast(world, ABILITY.Nova);
    // A knockback that moves a boss would defeat its own dash telegraph.
    expect(world.enemies.x[i]!).toBe(x);
  });
});

describe('bulwark', () => {
  it('grants a shield as a share of max HP, which expires', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    const def = ABILITIES[ABILITY.Bulwark];
    a.cast(world, ABILITY.Bulwark);
    expect(world.tower.shieldHp).toBeCloseTo(world.tower.hpMax * def.power);
    expect(world.tower.shieldT).toBeCloseTo(def.duration);
  });
});

describe('fury', () => {
  it('raises fire rate and damage, then puts them back exactly', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    const baseRate = world.tower.stats.get(ST.FireRate);
    const baseDmg = world.tower.stats.get(ST.Dmg);

    a.cast(world, ABILITY.Fury);
    a.update(world, FIXED_DT);
    expect(world.tower.stats.get(ST.FireRate)).toBeGreaterThan(baseRate);
    expect(world.tower.stats.get(ST.Dmg)).toBeGreaterThan(baseDmg);

    const dur = ABILITIES[ABILITY.Fury].duration;
    for (let t = 0; t < Math.ceil(dur / FIXED_DT) + 4; t++) a.update(world, FIXED_DT);
    expect(world.tower.stats.get(ST.FireRate)).toBeCloseTo(baseRate, 4);
    expect(world.tower.stats.get(ST.Dmg)).toBeCloseTo(baseDmg, 4);
  });

  it('a second cast cannot stack the buff twice', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    a.cast(world, ABILITY.Fury);
    a.update(world, FIXED_DT);
    const boosted = world.tower.stats.get(ST.FireRate);
    // Force it back off cooldown and re-cast while still active.
    a.cooldown[ABILITY.Fury] = 0;
    a.cast(world, ABILITY.Fury);
    a.update(world, FIXED_DT);
    expect(world.tower.stats.get(ST.FireRate)).toBeCloseTo(boosted, 4);
  });

  it('reset() removes an active buff instead of leaving it permanent', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    const base = world.tower.stats.get(ST.FireRate);
    a.cast(world, ABILITY.Fury);
    a.update(world, FIXED_DT);
    a.reset(world);
    a.update(world, FIXED_DT);
    expect(world.tower.stats.get(ST.FireRate)).toBeCloseTo(base, 4);
  });
});

describe('auto-cast (SPEC §9)', () => {
  it('stays quiet until it is switched on', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    for (let t = 0; t < 60 * 5; t++) a.update(world, FIXED_DT);
    expect(a.readiness(ABILITY.Fury)).toBe(1);
  });

  it('fires fury on its own once automation is unlocked', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    a.autoCast = true;
    a.update(world, FIXED_DT);
    expect(a.canCast(ABILITY.Fury)).toBe(false);
  });

  it('holds the nova until a crowd is actually present', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    a.autoCast = true;
    world.rebuildHash();
    a.update(world, FIXED_DT);
    expect(a.readiness(ABILITY.Nova)).toBe(1); // nothing to hit yet

    const def = ABILITIES[ABILITY.Nova];
    for (let k = 0; k < def.autoThreshold + 2; k++) {
      spawn(world, 'grunt', world.tower.x + 40 + k, world.tower.y);
    }
    world.rebuildHash();
    a.update(world, FIXED_DT);
    expect(a.canCast(ABILITY.Nova)).toBe(false); // fired
  });

  it('holds the bulwark until health is actually low', () => {
    const world = new World();
    const a = new AbilitySystem();
    unlockAll(a);
    a.autoCast = true;
    a.update(world, FIXED_DT);
    expect(world.tower.shieldHp).toBe(0);

    world.tower.hp = world.tower.hpMax * 0.2;
    a.update(world, FIXED_DT);
    expect(world.tower.shieldHp).toBeGreaterThan(0);
  });
});
