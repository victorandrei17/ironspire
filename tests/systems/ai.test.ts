import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { AiSystem } from '../../src/systems/ai.ts';
import { integrateEnemies, despawnStrays } from '../../src/systems/movement.ts';
import { stressFill } from '../../src/debug/stressSpawner.ts';
import { Rng } from '../../src/core/rng.ts';
import { ENEMIES, ENEMY_LIST, enemyIndex, ENEMY_TUNING } from '../../src/data/enemies.ts';
import { ES } from '../../src/data/enemyFlags.ts';
import { FIXED_DT, TOWER_X, TOWER_Y, R_TOWER_BODY, R_SPAWN } from '../../src/core/constants.ts';
import { dist2 } from '../../src/core/math.ts';

function spawnOne(world: World, id: keyof typeof ENEMIES, x: number, y: number): number {
  const idx = enemyIndex(id);
  const def = ENEMY_LIST[idx]!;
  const i = world.enemies.spawn(x, y, idx, idx, 100, def.radius);
  world.enemies.speed[i] = def.speed;
  world.enemies.flags[i] = def.flags;
  return i;
}

function step(world: World, ai: AiSystem, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    world.rebuildHash();
    ai.update(world.enemies, world.hash, world.tower.x, world.tower.y, FIXED_DT);
    integrateEnemies(world.enemies, FIXED_DT);
  }
}

describe('AI steering', () => {
  it('walks a melee enemy to the tower and stops at contact', () => {
    const world = new World();
    const ai = new AiSystem();
    const i = spawnOne(world, 'grunt', TOWER_X, TOWER_Y - R_SPAWN);
    const startD2 = dist2(world.enemies.x[i]!, world.enemies.y[i]!, TOWER_X, TOWER_Y);

    step(world, ai, 60);
    const midD2 = dist2(world.enemies.x[i]!, world.enemies.y[i]!, TOWER_X, TOWER_Y);
    expect(midD2).toBeLessThan(startD2);

    step(world, ai, 60 * 20);
    const d = Math.sqrt(dist2(world.enemies.x[i]!, world.enemies.y[i]!, TOWER_X, TOWER_Y));
    const contact = R_TOWER_BODY + ENEMIES.grunt.radius + ENEMY_TUNING.contactSlack;
    expect(d).toBeLessThanOrEqual(contact + 2);
    expect(world.enemies.state[i]).toBe(ES.Attack);
  });

  it('holds a ranged enemy at its preferred range', () => {
    const world = new World();
    const ai = new AiSystem();
    const i = spawnOne(world, 'spitter', TOWER_X, TOWER_Y - R_SPAWN);
    step(world, ai, 60 * 30);
    const d = Math.sqrt(dist2(world.enemies.x[i]!, world.enemies.y[i]!, TOWER_X, TOWER_Y));
    expect(Math.abs(d - ENEMIES.spitter.preferredRange)).toBeLessThan(
      ENEMY_TUNING.rangeBand + 8,
    );
    expect(world.enemies.state[i]).toBe(ES.Shoot);
  });

  it('never lets an enemy exceed its archetype speed', () => {
    const world = new World();
    const ai = new AiSystem();
    stressFill(world, 300, new Rng(42), 5);
    for (let t = 0; t < 240; t++) {
      world.rebuildHash();
      ai.update(world.enemies, world.hash, world.tower.x, world.tower.y, FIXED_DT);
      integrateEnemies(world.enemies, FIXED_DT);
      for (let i = 0; i < world.enemies.count; i++) {
        if (world.enemies.alive[i] === 0) continue;
        const vx = world.enemies.vx[i]!;
        const vy = world.enemies.vy[i]!;
        const speed = world.enemies.speed[i]!;
        // Separation may steer, never accelerate past the archetype's speed.
        // +0.02 covers Float32Array storage rounding only.
        expect(Math.sqrt(vx * vx + vy * vy)).toBeLessThanOrEqual(speed + 0.02);
      }
    }
  });

  it('separation keeps bodies from occupying the same point', () => {
    const world = new World();
    const ai = new AiSystem();
    // Twelve grunts stacked almost exactly on top of each other.
    for (let k = 0; k < 12; k++) {
      spawnOne(world, 'grunt', TOWER_X + 0.1 * k, TOWER_Y - 300 + 0.1 * k);
    }
    step(world, ai, 120);
    let tooClose = 0;
    for (let i = 0; i < world.enemies.count; i++) {
      for (let j = i + 1; j < world.enemies.count; j++) {
        if (dist2(world.enemies.x[i]!, world.enemies.y[i]!, world.enemies.x[j]!, world.enemies.y[j]!) < 25) {
          tooClose++;
        }
      }
    }
    expect(tooClose).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const run = (): number[] => {
      const world = new World();
      const ai = new AiSystem();
      stressFill(world, 200, new Rng(0xbeef), 7);
      step(world, ai, 300);
      const out: number[] = [];
      for (let i = 0; i < world.enemies.count; i++) {
        out.push(world.enemies.x[i]!, world.enemies.y[i]!);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('recycles enemies that wander past the despawn ring', () => {
    const world = new World();
    const i = spawnOne(world, 'grunt', TOWER_X + 5000, TOWER_Y);
    expect(world.enemies.alive[i]).toBe(1);
    despawnStrays(world.enemies, TOWER_X, TOWER_Y);
    expect(world.enemies.alive[i]).toBe(0);
    expect(world.enemies.liveCount).toBe(0);
  });

  it('holds 400 enemies without dropping spawns', () => {
    const world = new World();
    const ai = new AiSystem();
    stressFill(world, 400, new Rng(9), 12);
    expect(world.enemies.liveCount).toBe(400);
    expect(world.enemies.droppedSpawns).toBe(0);
    step(world, ai, 120);
    expect(world.enemies.liveCount).toBe(400);
  });
});
