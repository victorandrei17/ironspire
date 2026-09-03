import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import {
  integrateEnemies,
  integrateProjectiles,
  integrateParticles,
  integrateDamageNumbers,
} from '../../src/systems/movement.ts';
import { FIXED_DT, TOWER_X, TOWER_Y } from '../../src/core/constants.ts';
import { enemyIndex, ENEMY_LIST } from '../../src/data/enemies.ts';
import { DIGIT_WHITE } from '../../src/render/digitAtlas.ts';

describe('integration', () => {
  it('records prev position before moving, for render interpolation', () => {
    const w = new World();
    const idx = enemyIndex('grunt');
    const i = w.enemies.spawn(100, 200, idx, idx, 50, ENEMY_LIST[idx]!.radius);
    w.enemies.vx[i] = 60;
    w.enemies.vy[i] = -30;
    integrateEnemies(w.enemies, FIXED_DT);
    expect(w.enemies.prevX[i]).toBe(100);
    expect(w.enemies.prevY[i]).toBe(200);
    expect(w.enemies.x[i]).toBeCloseTo(100 + 60 * FIXED_DT, 4);
    expect(w.enemies.y[i]).toBeCloseTo(200 - 30 * FIXED_DT, 4);
  });

  it('decays enemy timers without going negative', () => {
    const w = new World();
    const idx = enemyIndex('grunt');
    const i = w.enemies.spawn(0, 0, idx, idx, 10, 10);
    w.enemies.flash[i] = 0.02;
    w.enemies.slowT[i] = 0.005;
    w.enemies.freezeT[i] = 0.005;
    w.enemies.attackCd[i] = 0.005;
    integrateEnemies(w.enemies, FIXED_DT);
    expect(w.enemies.flash[i]).toBe(0);
    expect(w.enemies.slowT[i]).toBe(0);
    expect(w.enemies.freezeT[i]).toBe(0);
    expect(w.enemies.attackCd[i]).toBe(0);
  });

  it('frees a projectile when its life runs out', () => {
    const w = new World();
    const i = w.projectiles.spawn(0, 0, 100, 0, 5, 4, FIXED_DT * 1.5, 0, 0);
    integrateProjectiles(w.projectiles, FIXED_DT);
    expect(w.projectiles.alive[i]).toBe(1);
    integrateProjectiles(w.projectiles, FIXED_DT);
    expect(w.projectiles.alive[i]).toBe(0);
  });

  it('fades a particle out over the tail of its life', () => {
    const w = new World();
    const i = w.particles.spawn(0, 0, 0, 0, 1.0, 1, 0);
    for (let t = 0; t < 40; t++) integrateParticles(w.particles, FIXED_DT);
    // ~0.33s left of 1.0s: inside the 40% fade window.
    expect(w.particles.alpha[i]).toBeLessThan(1);
    expect(w.particles.alpha[i]).toBeGreaterThan(0);
    for (let t = 0; t < 40; t++) integrateParticles(w.particles, FIXED_DT);
    expect(w.particles.alive[i]).toBe(0);
  });

  it('particle drag never reverses velocity at a large dt', () => {
    const w = new World();
    const i = w.particles.spawn(0, 0, 100, 0, 5, 1, 0);
    w.particles.drag[i] = 50; // drag * dt > 1 at any sane timestep
    integrateParticles(w.particles, 0.25);
    expect(w.particles.vx[i]).toBe(0);
  });

  it('damage numbers rise, arc and expire', () => {
    const w = new World();
    const i = w.damageNumbers.spawn(10, 20, 123, DIGIT_WHITE, 1);
    integrateDamageNumbers(w.damageNumbers, FIXED_DT);
    expect(w.damageNumbers.y[i]!).toBeLessThan(20); // rising
    for (let t = 0; t < 60; t++) integrateDamageNumbers(w.damageNumbers, FIXED_DT);
    expect(w.damageNumbers.alive[i]).toBe(0);
  });
});

describe('World lifecycle', () => {
  it('reset clears every pool and restores the tower', () => {
    const w = new World();
    const idx = enemyIndex('grunt');
    w.enemies.spawn(0, 0, idx, idx, 10, 10);
    w.projectiles.spawn(0, 0, 1, 0, 1, 1, 1, 0, 0);
    w.tower.hp = 3;
    w.reset();
    expect(w.enemies.liveCount).toBe(0);
    expect(w.projectiles.liveCount).toBe(0);
    expect(w.tower.hp).toBe(w.tower.hpMax);
    expect(w.tower.x).toBe(TOWER_X);
    expect(w.tower.y).toBe(TOWER_Y);
  });
});
