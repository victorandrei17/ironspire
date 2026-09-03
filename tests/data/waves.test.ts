import { describe, it, expect } from 'vitest';
import {
  weightAt,
  fillWeights,
  enemyCount,
  enemyHp,
  enemySpeedMul,
  goldDrop,
  isBossWave,
  eliteChance,
  PATTERN_WEIGHTS,
  PATTERN_INFO,
} from '../../src/data/waves.ts';
import { ENEMY_ORDER } from '../../src/data/enemies.ts';
import { BAL } from '../../src/data/balance.ts';
import { UPGRADES } from '../../src/data/upgrades.ts';

describe('wave curves (SPEC §6.2)', () => {
  it('every curve is finite and non-negative to wave 500', () => {
    for (let w = 1; w <= 500; w++) {
      for (const v of [enemyCount(w), enemyHp(w), enemySpeedMul(w), goldDrop(w)]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('count, hp and gold are monotonically non-decreasing', () => {
    for (let w = 2; w <= 500; w++) {
      expect(enemyCount(w)).toBeGreaterThanOrEqual(enemyCount(w - 1));
      expect(enemyHp(w)).toBeGreaterThan(enemyHp(w - 1));
      expect(goldDrop(w)).toBeGreaterThan(goldDrop(w - 1));
      expect(enemySpeedMul(w)).toBeGreaterThanOrEqual(enemySpeedMul(w - 1));
    }
  });

  it('respects the count and speed caps', () => {
    expect(enemyCount(500)).toBe(BAL.wave.countCap);
    expect(enemySpeedMul(500)).toBeCloseTo(BAL.wave.speedCap);
  });

  it('the HP curve is continuous across the soft cap', () => {
    const w = BAL.wave.hpSoftCapWave;
    const before = enemyHp(w);
    const after = enemyHp(w + 1);
    // Growth slows but must not jump or dip at the boundary.
    expect(after).toBeGreaterThan(before);
    expect(after / before).toBeCloseTo(BAL.wave.hpGrowthLate, 6);
  });

  it('the late curve outruns a compounding upgrade, so a wall exists', () => {
    const late = enemyHp(200) / enemyHp(199);
    // Income and cost are both geometric, so upgrade levels grow linearly and
    // the compounding damage upgrade turns into an exponential in waves. The
    // late curve has to beat that exponent or no wall exists at all — which is
    // exactly what `npm run balance` caught when this curve was the flatter of
    // the two. The margin is the ordinary player's share of the fight.
    const damage = UPGRADES.find((u) => u.id === 'damage');
    expect(damage?.kind).toBe('mult');
    const levelsPerWave = Math.log(BAL.wave.goldGrowth) / Math.log(damage!.costGrowth);
    const playerGrowth = Math.pow(damage!.perLevel, levelsPerWave);
    expect(late).toBeGreaterThan(playerGrowth);
  });

  it('HP at wave 500 is far below float overflow', () => {
    expect(enemyHp(500)).toBeLessThan(1e30);
  });

  it('boss waves land every ten waves', () => {
    expect(isBossWave(0)).toBe(false);
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(11)).toBe(false);
    expect(isBossWave(40)).toBe(true);
  });

  it('elite chance starts at the right wave and caps', () => {
    expect(eliteChance(BAL.elite.startWave - 1)).toBe(0);
    expect(eliteChance(BAL.elite.startWave)).toBeCloseTo(BAL.elite.chancePerWave);
    expect(eliteChance(500)).toBeCloseTo(BAL.elite.chanceCap);
    for (let w = 1; w <= 500; w++) {
      expect(eliteChance(w)).toBeGreaterThanOrEqual(0);
      expect(eliteChance(w)).toBeLessThanOrEqual(BAL.elite.chanceCap);
    }
  });
});

describe('composition weights (SPEC §6.3)', () => {
  it('an archetype stays at zero until its unlock wave', () => {
    expect(weightAt('runner', 1)).toBe(0);
    expect(weightAt('runner', 3)).toBe(0);
    expect(weightAt('runner', 4)).toBeGreaterThan(0);
    expect(weightAt('wraith', 29)).toBe(0);
    expect(weightAt('wraith', 31)).toBeGreaterThan(0);
  });

  it('interpolates linearly between anchors', () => {
    // grunt: 100 at w1, 70 at w10 → 85 at w5.5
    expect(weightAt('grunt', 5.5)).toBeCloseTo(85, 5);
  });

  it('holds the last anchor flat past the end of the table', () => {
    expect(weightAt('grunt', 999)).toBe(weightAt('grunt', 50));
  });

  it('never goes negative and always has something to spawn', () => {
    const out = new Float32Array(ENEMY_ORDER.length);
    for (let w = 1; w <= 500; w++) {
      fillWeights(out, w);
      let total = 0;
      for (const v of out) {
        expect(v).toBeGreaterThanOrEqual(0);
        total += v;
      }
      expect(total).toBeGreaterThan(0);
    }
  });

  it('the roster genuinely widens with the waves', () => {
    const out = new Float32Array(ENEMY_ORDER.length);
    const nonZero = (w: number): number => {
      fillWeights(out, w);
      let n = 0;
      for (const v of out) if (v > 0) n++;
      return n;
    };
    expect(nonZero(1)).toBe(1);
    expect(nonZero(20)).toBeGreaterThan(nonZero(5));
    expect(nonZero(40)).toBeGreaterThan(nonZero(20));
  });
});

describe('spawn patterns (SPEC §6.4)', () => {
  it('has a weight and an info entry per pattern', () => {
    expect(PATTERN_WEIGHTS.length).toBe(PATTERN_INFO.length);
    let total = 0;
    for (const w of PATTERN_WEIGHTS) total += w;
    expect(total).toBe(100);
  });

  it('every pattern releases the wave in at least one group', () => {
    for (const info of PATTERN_INFO) {
      expect(info.groups).toBeGreaterThan(0);
      expect(info.arcRad).toBeGreaterThan(0);
      expect(info.frontLoad).toBeGreaterThanOrEqual(0);
      expect(info.frontLoad).toBeLessThan(1);
    }
  });
});
