import { describe, it, expect } from 'vitest';
import { RunState } from '../../src/core/state.ts';
import { TowerStats, ST } from '../../src/entities/tower.ts';
import { UPGRADES, UPGRADE_COUNT, upgradeCost } from '../../src/data/upgrades.ts';
import { CARD_COUNT } from '../../src/data/cards.ts';
import {
  costOf,
  isMaxed,
  buyUpgrade,
  buyMax,
  maxAffordable,
  applyUpgrades,
} from '../../src/systems/upgrades.ts';
import { BAL } from '../../src/data/balance.ts';

function makeRun(gold = 0): RunState {
  const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
  run.reset(1, 12, 1);
  run.gold = gold;
  return run;
}

/** Sums the per-level floored cost the way the shop actually charges. */
function naiveTotal(idx: number, fromLevel: number, count: number): number {
  const def = UPGRADES[idx]!;
  let sum = 0;
  for (let k = 0; k < count; k++) sum += upgradeCost(def, fromLevel + k);
  return sum;
}

describe('upgrade purchases (SPEC §7.2)', () => {
  it('charges the listed price and raises the level', () => {
    const run = makeRun(1000);
    const stats = new TowerStats();
    const cost = costOf(run, 0);
    expect(buyUpgrade(run, stats, 0)).toBe(true);
    expect(run.gold).toBe(1000 - cost);
    expect(run.upgradeLevels[0]).toBe(1);
  });

  it('refuses a purchase the player cannot afford', () => {
    const run = makeRun(1);
    const stats = new TowerStats();
    expect(buyUpgrade(run, stats, 0)).toBe(false);
    expect(run.gold).toBe(1);
    expect(run.upgradeLevels[0]).toBe(0);
  });

  it('cost grows geometrically, exactly as the table says', () => {
    const run = makeRun(1e9);
    const stats = new TowerStats();
    const def = UPGRADES[0];
    for (let k = 0; k < 20; k++) {
      expect(costOf(run, 0)).toBe(Math.floor(def.costBase * Math.pow(def.costGrowth, k)));
      buyUpgrade(run, stats, 0);
    }
  });

  it('respects a level cap', () => {
    const idx = UPGRADES.findIndex((u) => u.maxLevel > 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const def = UPGRADES[idx]!;
    const run = makeRun(1e12);
    const stats = new TowerStats();
    for (let k = 0; k < def.maxLevel + 5; k++) buyUpgrade(run, stats, idx);
    expect(run.upgradeLevels[idx]).toBe(def.maxLevel);
    expect(isMaxed(run, idx)).toBe(true);
    expect(costOf(run, idx)).toBe(Infinity);
  });
});

describe('MAX purchase', () => {
  it('buys exactly the closed-form geometric sum, never overspending', () => {
    for (const gold of [0, 19, 20, 63, 500, 12_345, 1e6, 1e9]) {
      for (let idx = 0; idx < UPGRADE_COUNT; idx++) {
        const run = makeRun(gold);
        const { levels, cost } = maxAffordable(run, idx);
        expect(cost).toBeLessThanOrEqual(gold);
        if (levels > 0) expect(cost).toBe(naiveTotal(idx, 0, levels));
        // One more level must be out of reach.
        const def = UPGRADES[idx]!;
        if (def.maxLevel === 0 || levels < def.maxLevel) {
          expect(naiveTotal(idx, 0, levels + 1)).toBeGreaterThan(gold);
        }
      }
    }
  });

  it('MAX never spends more than the player has', () => {
    const run = makeRun(10_000);
    const stats = new TowerStats();
    const levels = buyMax(run, stats, 0);
    expect(levels).toBeGreaterThan(0);
    expect(run.gold).toBeGreaterThanOrEqual(0);
  });

  it('MAX from a partial level matches buying one at a time', () => {
    const run = makeRun(1e6);
    const stats = new TowerStats();
    for (let k = 0; k < 7; k++) buyUpgrade(run, stats, 1);
    const goldBefore = run.gold;
    const levelBefore = run.upgradeLevels[1] ?? 0;

    const one = makeRun(goldBefore);
    one.upgradeLevels[1] = levelBefore;
    const oneStats = new TowerStats();
    let bought = 0;
    while (buyUpgrade(one, oneStats, 1)) bought++;

    const bulk = buyMax(run, stats, 1);
    expect(bulk).toBe(bought);
    expect(run.gold).toBeCloseTo(one.gold, 6);
  });

  it('buys nothing when it cannot afford a single level', () => {
    const run = makeRun(0);
    const stats = new TowerStats();
    expect(buyMax(run, stats, 0)).toBe(0);
    expect(run.gold).toBe(0);
  });

  it('is fast even with a huge purse', () => {
    const run = makeRun(1e30);
    const stats = new TowerStats();
    const t0 = performance.now();
    const levels = buyMax(run, stats, 0);
    // Closed form, not a loop: hundreds of levels must not stall a frame.
    expect(performance.now() - t0).toBeLessThan(16);
    expect(levels).toBeGreaterThan(100);
  });
});

describe('applying upgrades to stats', () => {
  it('is idempotent — re-applying does not stack', () => {
    const run = makeRun(0);
    const stats = new TowerStats();
    run.upgradeLevels[0] = 5;
    applyUpgrades(run, stats);
    const once = stats.get(ST.Dmg);
    applyUpgrades(run, stats);
    applyUpgrades(run, stats);
    expect(stats.get(ST.Dmg)).toBeCloseTo(once, 6);
  });

  it('damage levels COMPOUND, so they can track exponential enemy HP', () => {
    const run = makeRun(0);
    const stats = new TowerStats();
    const def = UPGRADES[0];
    expect(def.kind).toBe('mult');
    run.upgradeLevels[0] = 10;
    applyUpgrades(run, stats);
    expect(stats.get(ST.Dmg)).toBeCloseTo(BAL.tower.dmg * Math.pow(def.perLevel, 10), 3);
  });

  it('range levels add flat units', () => {
    const run = makeRun(0);
    const stats = new TowerStats();
    run.upgradeLevels[2] = 4; // +8 each
    applyUpgrades(run, stats);
    expect(stats.get(ST.Range)).toBeCloseTo(BAL.tower.range + 32, 4);
  });

  it('an absurd level count clamps instead of overflowing to Infinity', () => {
    // A compounding upgrade at ten thousand levels overflows float; a
    // non-finite stat would poison positions and damage everywhere downstream.
    const run = makeRun(0);
    const stats = new TowerStats();
    for (let i = 0; i < UPGRADE_COUNT; i++) run.upgradeLevels[i] = 10_000;
    applyUpgrades(run, stats);
    for (let s = 0; s < 12; s++) {
      const v = stats.get(s);
      expect(Number.isFinite(v)).toBe(true);
      // Pierce has no upgrade behind it and legitimately stays at zero.
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
