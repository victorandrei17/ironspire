import { describe, it, expect } from 'vitest';
import { TowerStats, ST } from '../../src/entities/tower.ts';
import { makeDefaultSave } from '../../src/save/schema.ts';
import { makeModifiers } from '../../src/core/metaModifiers.ts';
import {
  applyTalents,
  buyTalent,
  nextTalentCost,
  respec,
  talentRank,
  computeOffline,
  recordRunRates,
  coresForRun,
  etherForRebirth,
  etherMultiplier,
  canRebirth,
  rebirth,
  OFFLINE,
  REBIRTH_WAVE,
} from '../../src/systems/meta.ts';
import { TALENTS, talentCost, talentIndex } from '../../src/data/talents.ts';
import { BAL } from '../../src/data/balance.ts';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

function talent(id: string) {
  const idx = talentIndex(id);
  expect(idx).toBeGreaterThanOrEqual(0);
  return TALENTS[idx]!;
}

describe('talent catalogue (SPEC §10.1)', () => {
  it('has unique ids, four branches and sane ranks', () => {
    const ids = new Set<string>();
    const branches = new Set<number>();
    for (const t of TALENTS) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      branches.add(t.branch);
      expect(t.maxRank).toBeGreaterThan(0);
      expect(t.costBase).toBeGreaterThan(0);
      expect(t.desc(1).length).toBeGreaterThan(0);
      expect(t.desc(t.maxRank)).not.toContain('NaN');
    }
    expect(branches.size).toBe(4);
  });

  it('cost grows at 1.28 per rank', () => {
    for (const t of TALENTS) {
      expect(talentCost(t, 0)).toBe(t.costBase);
      expect(talentCost(t, 3)).toBe(Math.floor(t.costBase * Math.pow(1.28, 3)));
    }
  });
});

describe('talent purchases', () => {
  it('charges cores and raises the rank', () => {
    const save = makeDefaultSave(NOW);
    save.meta.nucleos = 1000;
    const def = talent('war_dmg');
    const cost = nextTalentCost(save, def);
    expect(buyTalent(save, def)).toBe(true);
    expect(save.meta.nucleos).toBe(1000 - cost);
    expect(talentRank(save, def.id)).toBe(1);
  });

  it('refuses when cores are short, and at max rank', () => {
    const save = makeDefaultSave(NOW);
    const def = talent('war_dmg');
    expect(buyTalent(save, def)).toBe(false);

    save.meta.nucleos = 1e9;
    for (let r = 0; r < def.maxRank; r++) expect(buyTalent(save, def)).toBe(true);
    expect(buyTalent(save, def)).toBe(false);
    expect(nextTalentCost(save, def)).toBe(Infinity);
  });

  it('respec refunds every core, exactly', () => {
    const save = makeDefaultSave(NOW);
    save.meta.nucleos = 5000;
    const before = save.meta.nucleos;
    for (const id of ['war_dmg', 'fort_hp', 'fortune_gold']) {
      const def = talent(id);
      for (let k = 0; k < 4; k++) buyTalent(save, def);
    }
    expect(save.meta.nucleos).toBeLessThan(before);
    respec(save);
    expect(save.meta.nucleos).toBe(before);
    expect(save.meta.talents).toEqual({});
  });
});

describe('applying talents (SPEC §10.1)', () => {
  it('writes only into the meta layer, leaving run and card layers alone', () => {
    const save = makeDefaultSave(NOW);
    save.meta.talents.war_dmg = 5;
    const stats = new TowerStats();
    stats.pctRun[ST.Dmg] = 1; // pretend an upgrade is already bought
    const mods = makeModifiers();
    applyTalents(save, stats, mods);
    expect(stats.pctRun[ST.Dmg]).toBe(1);
    expect(stats.pctMeta[ST.Dmg]).toBeCloseTo(0.06 * 5, 5);
  });

  it('is idempotent', () => {
    const save = makeDefaultSave(NOW);
    save.meta.talents.war_dmg = 4;
    save.meta.talents.fort_hp = 3;
    const stats = new TowerStats();
    const mods = makeModifiers();
    applyTalents(save, stats, mods);
    const dmg = stats.get(ST.Dmg);
    applyTalents(save, stats, mods);
    applyTalents(save, stats, mods);
    expect(stats.get(ST.Dmg)).toBeCloseTo(dmg, 6);
  });

  it('clamps a rank beyond the maximum (hand-edited save)', () => {
    const save = makeDefaultSave(NOW);
    const def = talent('war_dmg');
    save.meta.talents.war_dmg = 9999;
    const stats = new TowerStats();
    applyTalents(save, stats, makeModifiers());
    expect(stats.pctMeta[ST.Dmg]).toBeCloseTo(def.perRank * def.maxRank, 5);
  });

  it('compounding talents approach a limit instead of reaching zero cost', () => {
    const save = makeDefaultSave(NOW);
    const def = talent('fortune_cost');
    save.meta.talents.fortune_cost = def.maxRank;
    const mods = makeModifiers();
    applyTalents(save, new TowerStats(), mods);
    expect(mods.upgradeCostMult).toBeGreaterThan(0.5);
    expect(mods.upgradeCostMult).toBeLessThan(1);
  });

  it('damage reduction never reaches immunity', () => {
    const save = makeDefaultSave(NOW);
    save.meta.talents.fort_reduce = 9999;
    const mods = makeModifiers();
    applyTalents(save, new TowerStats(), mods);
    expect(mods.damageReductionPct).toBeGreaterThan(0);
    expect(mods.damageReductionPct).toBeLessThan(0.5);
  });

  it('special talents land in the right modifier', () => {
    const save = makeDefaultSave(NOW);
    save.meta.talents.fortune_start = 4;
    save.meta.talents.arcane_reroll = 2;
    save.meta.talents.fort_revive = 1;
    const mods = makeModifiers();
    applyTalents(save, new TowerStats(), mods);
    expect(mods.startGold).toBe(100);
    expect(mods.rerolls).toBe(2);
    expect(mods.reviveOnce).toBe(true);
  });

  it('ether lifts every stat and never produces NaN', () => {
    const save = makeDefaultSave(NOW);
    save.meta.ether = 25;
    const stats = new TowerStats();
    applyTalents(save, stats, makeModifiers());
    expect(stats.get(ST.Dmg)).toBeGreaterThan(BAL.tower.dmg);
    for (let s = 0; s < 12; s++) expect(Number.isFinite(stats.get(s))).toBe(true);
  });
});

describe('offline earnings (SPEC §10.2)', () => {
  it('pays proportionally to time away', () => {
    const save = makeDefaultSave(NOW - 2 * HOUR);
    save.idle.lastSeenAt = NOW - 2 * HOUR;
    save.idle.bestGoldPerMin = 60;
    save.idle.bestNucleosPerMin = 1;
    const r = computeOffline(save, NOW, makeModifiers());
    expect(r.clockAnomaly).toBe(false);
    expect(r.seconds).toBeCloseTo(2 * 3600, 0);
    expect(r.gold).toBe(Math.floor(60 * OFFLINE.goldRate * 120));
    expect(r.nucleos).toBe(Math.floor(1 * OFFLINE.coreRate * 120));
  });

  it('caps accumulation at eight hours by default', () => {
    const save = makeDefaultSave(NOW);
    save.idle.lastSeenAt = NOW - 48 * HOUR;
    save.idle.bestGoldPerMin = 10;
    const r = computeOffline(save, NOW, makeModifiers());
    expect(r.seconds).toBe(OFFLINE.baseCapHours * 3600);
    expect(r.cappedAt).toBe(OFFLINE.baseCapHours * 3600);
  });

  it('the Fortune talent raises the cap, up to the hard maximum', () => {
    const save = makeDefaultSave(NOW);
    save.idle.lastSeenAt = NOW - 100 * HOUR;
    save.idle.bestGoldPerMin = 10;
    const mods = makeModifiers();
    mods.offlineCapHours = 8;
    expect(computeOffline(save, NOW, mods).seconds).toBe(16 * 3600);
    mods.offlineCapHours = 999;
    expect(computeOffline(save, NOW, mods).seconds).toBe(OFFLINE.maxCapHours * 3600);
  });

  it('a backwards clock pays nothing and is flagged', () => {
    const save = makeDefaultSave(NOW);
    save.idle.lastSeenAt = NOW + HOUR; // player moved the clock back an hour
    save.idle.bestGoldPerMin = 1000;
    const r = computeOffline(save, NOW, makeModifiers());
    expect(r.clockAnomaly).toBe(true);
    expect(r.gold).toBe(0);
    expect(r.nucleos).toBe(0);
  });

  it('a player who never finished a run earns nothing offline', () => {
    const save = makeDefaultSave(NOW);
    save.idle.lastSeenAt = NOW - 8 * HOUR;
    const r = computeOffline(save, NOW, makeModifiers());
    expect(r.gold).toBe(0);
    expect(r.nucleos).toBe(0);
  });

  it('records the best rate a run implies, and ignores trivial runs', () => {
    const save = makeDefaultSave(NOW);
    recordRunRates(save, 10, 600, 60);
    expect(save.idle.bestGoldPerMin).toBeCloseTo(600);
    recordRunRates(save, 1, 6, 60); // worse run must not lower the best
    expect(save.idle.bestGoldPerMin).toBeCloseTo(600);
    recordRunRates(save, 999, 1e6, 2); // 2 seconds is not a rate
    expect(save.idle.bestGoldPerMin).toBeCloseTo(600);
  });
});

describe('cores and rebirth (SPEC §2.3, §10.3)', () => {
  it('matches the spec examples with no bonuses', () => {
    const mods = makeModifiers();
    expect(coresForRun(12, mods, 0)).toBe(5);
    expect(coresForRun(25, mods, 0)).toBe(18);
    expect(coresForRun(50, mods, 0)).toBe(56);
    expect(coresForRun(100, mods, 0)).toBe(172);
    expect(coresForRun(200, mods, 0)).toBe(522);
  });

  it('scales with the Fortune bonus and with ether', () => {
    const mods = makeModifiers();
    mods.coreGainPct = 0.5;
    expect(coresForRun(50, mods, 0)).toBeGreaterThan(coresForRun(50, makeModifiers(), 0));
    expect(coresForRun(50, makeModifiers(), 20)).toBeGreaterThan(
      coresForRun(50, makeModifiers(), 0),
    );
  });

  it('is gated behind wave 100', () => {
    const save = makeDefaultSave(NOW);
    save.stats.bestWaveEver = REBIRTH_WAVE - 1;
    expect(canRebirth(save)).toBe(false);
    expect(rebirth(save)).toBe(0);
    save.stats.bestWaveEver = REBIRTH_WAVE;
    expect(canRebirth(save)).toBe(true);
  });

  it('grants ether, clears cores and talents, keeps history', () => {
    const save = makeDefaultSave(NOW);
    save.stats.bestWaveEver = 120;
    save.stats.totalRuns = 30;
    save.meta.nucleos = 5000;
    save.meta.talents.war_dmg = 5;
    const gained = rebirth(save);
    expect(gained).toBe(etherForRebirth(120));
    expect(gained).toBeGreaterThan(0);
    expect(save.meta.ether).toBe(gained);
    expect(save.meta.nucleos).toBe(0);
    expect(save.meta.talents).toEqual({});
    expect(save.stats.totalRuns).toBe(30);
    expect(save.stats.bestWaveEver).toBe(120);
  });

  it('ether is zero at or below wave 60 and rises after', () => {
    expect(etherForRebirth(60)).toBe(0);
    expect(etherForRebirth(100)).toBeGreaterThan(0);
    expect(etherForRebirth(200)).toBeGreaterThan(etherForRebirth(100));
    expect(etherMultiplier(0)).toBe(1);
    expect(etherMultiplier(10)).toBeGreaterThan(1);
  });
});
