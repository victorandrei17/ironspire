import { describe, it, expect } from 'vitest';
import { TowerStats, ST } from '../../src/entities/tower.ts';
import { BAL } from '../../src/data/balance.ts';

describe('TowerStats layering (SPEC §4.1)', () => {
  it('starts at the base values', () => {
    const s = new TowerStats();
    expect(s.get(ST.Dmg)).toBeCloseTo(BAL.tower.dmg);
    expect(s.get(ST.FireRate)).toBeCloseTo(BAL.tower.fireRate);
    expect(s.get(ST.Range)).toBeCloseTo(BAL.tower.range);
  });

  it('applies flats before percentages, and multipliers last', () => {
    const s = new TowerStats();
    s.flatRun[ST.Dmg] = 10; // base 10 + 10 = 20
    s.pctRun[ST.Dmg] = 0.5; // * 1.5 = 30
    s.prodMult[ST.Dmg] = 2; // * 2 = 60
    s.markDirty();
    expect(s.get(ST.Dmg)).toBeCloseTo(60);
  });

  it('percentages from different layers add, they do not compound', () => {
    const s = new TowerStats();
    s.pctMeta[ST.Dmg] = 0.5;
    s.pctRun[ST.Dmg] = 0.5;
    s.pctCard[ST.Dmg] = 0.5;
    s.markDirty();
    // 10 * (1 + 1.5) = 25, not 10 * 1.5^3 = 33.75
    expect(s.get(ST.Dmg)).toBeCloseTo(25);
  });

  it('rare-card multipliers do compound with each other', () => {
    const s = new TowerStats();
    s.prodMult[ST.Dmg] = 2 * 1.5;
    s.markDirty();
    expect(s.get(ST.Dmg)).toBeCloseTo(30);
  });

  it('caps crit chance and floors the discrete stats', () => {
    const s = new TowerStats();
    s.flatRun[ST.CritChance] = 5;
    s.flatRun[ST.Projectiles] = -10;
    s.flatRun[ST.Pierce] = -10;
    s.pctRun[ST.HpMax] = -5;
    s.pctRun[ST.FireRate] = -5;
    s.markDirty();
    expect(s.get(ST.CritChance)).toBeCloseTo(BAL.tower.critChanceCap, 6);
    expect(s.get(ST.Projectiles)).toBe(1);
    expect(s.get(ST.Pierce)).toBe(0);
    expect(s.get(ST.HpMax)).toBeGreaterThan(0);
    expect(s.get(ST.FireRate)).toBeGreaterThan(0);
  });

  it('caches until marked dirty', () => {
    const s = new TowerStats();
    const before = s.get(ST.Dmg);
    s.flatRun[ST.Dmg] = 100;
    expect(s.get(ST.Dmg)).toBe(before); // stale on purpose: no dirty flag set
    s.markDirty();
    expect(s.get(ST.Dmg)).toBeCloseTo(110);
  });

  it('resetRun clears run and card layers but keeps meta', () => {
    const s = new TowerStats();
    s.flatMeta[ST.Dmg] = 5;
    s.flatRun[ST.Dmg] = 100;
    s.pctCard[ST.Dmg] = 3;
    s.resetRun();
    expect(s.get(ST.Dmg)).toBeCloseTo(15);
  });

  it('never produces NaN for any stat', () => {
    const s = new TowerStats();
    for (let stat = 0; stat < 12; stat++) {
      s.flatRun[stat] = 1e6;
      s.pctRun[stat] = 1e3;
      s.prodMult[stat] = 1e3;
    }
    s.markDirty();
    for (let stat = 0; stat < 12; stat++) expect(Number.isFinite(s.get(stat))).toBe(true);
  });
});
