import { describe, it, expect } from 'vitest';
import { CARDS, CARD_COUNT, RARITY_WEIGHTS, makeCardTarget } from '../../src/data/cards.ts';
import { STAT_COUNT } from '../../src/data/stats.ts';
import { RunState } from '../../src/core/state.ts';
import { TowerStats, ST } from '../../src/entities/tower.ts';
import { UPGRADE_COUNT } from '../../src/data/upgrades.ts';
import { CardOffer, pickCard, applyCards, OFFER_SIZE } from '../../src/systems/cards.ts';
import { Rng } from '../../src/core/rng.ts';

/**
 * One comparable scalar for "how strong is this card at this level".
 *
 * Fields where LOWER is better (a slow multiplier, a cooldown) are inverted,
 * so the comparison means the same thing for every card.
 */
function strength(t: ReturnType<typeof makeCardTarget>): number {
  let m = 0;
  for (let s = 0; s < STAT_COUNT; s++) {
    m += Math.abs(t.flatCard[s] ?? 0);
    m += Math.abs(t.pctCard[s] ?? 0);
    m += Math.abs((t.prodMult[s] ?? 1) - 1);
  }
  m += t.thornsPct;
  m += t.lifestealPct + t.lifestealCap * 0.01;
  m += t.chainJumps + t.chainRadius * 0.001;
  m += t.orbitalCount + t.orbitalRadius * 0.001;
  m += t.explosiveRadius * 0.01 + t.explosivePct;
  m += t.frostNovaRadius * 0.001 + t.frostNovaFreeze;
  m += t.overchargeDrainPct * 10;
  m += t.deathmarkThreshold * 10 + t.deathmarkBossMult;
  m += t.slowAuraRadius * 0.001;
  // Lower is better on these two.
  m += 1 - t.slowAuraMul;
  if (t.frostNovaCd > 0) m += 20 / t.frostNovaCd;
  if (t.deathmarkEvery > 0) m += 20 / t.deathmarkEvery;
  return m;
}

function snapshot(t: ReturnType<typeof makeCardTarget>): string {
  return JSON.stringify({
    flat: Array.from(t.flatCard),
    pct: Array.from(t.pctCard),
    mult: Array.from(t.prodMult),
    flags: t.flags,
    tunables: [
      t.slowAuraRadius,
      t.slowAuraMul,
      t.thornsPct,
      t.lifestealPct,
      t.lifestealCap,
      t.chainJumps,
      t.chainRadius,
      t.chainFalloff,
      t.explosiveRadius,
      t.explosivePct,
      t.frostNovaCd,
      t.frostNovaRadius,
      t.frostNovaFreeze,
      t.overchargeDrainPct,
      t.deathmarkEvery,
      t.deathmarkThreshold,
      t.deathmarkBossMult,
    ],
  });
}

describe('card catalogue (SPEC §8)', () => {
  it('has unique ids and sane metadata', () => {
    const ids = new Set<string>();
    for (const c of CARDS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.maxLevel).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.tags.length).toBeGreaterThan(0);
      expect(RARITY_WEIGHTS[c.rarity]).toBeGreaterThan(0);
    }
    expect(ids.size).toBe(CARD_COUNT);
  });

  it('every description renders at every level without NaN or undefined', () => {
    for (const c of CARDS) {
      for (let l = 1; l <= c.maxLevel; l++) {
        const text = c.desc(l);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toContain('NaN');
        expect(text).not.toContain('undefined');
      }
    }
  });

  it('apply is deterministic for a given level', () => {
    for (const c of CARDS) {
      for (let l = 1; l <= c.maxLevel; l++) {
        const a = makeCardTarget();
        c.apply(a, l);
        const b = makeCardTarget();
        c.apply(b, l);
        expect(snapshot(b)).toBe(snapshot(a));
      }
    }
  });

  it('apply never touches Math.random (SPEC §8.3: pure, no RNG)', () => {
    const real = Math.random;
    Math.random = (): number => {
      throw new Error('a card reached for Math.random');
    };
    try {
      for (const c of CARDS) {
        for (let l = 1; l <= c.maxLevel; l++) {
          expect(() => c.apply(makeCardTarget(), l)).not.toThrow();
        }
      }
    } finally {
      Math.random = real;
    }
  });

  it('apply never produces NaN or a non-finite stat', () => {
    for (const c of CARDS) {
      for (let l = 1; l <= c.maxLevel; l++) {
        const t = makeCardTarget();
        c.apply(t, l);
        for (let s = 0; s < STAT_COUNT; s++) {
          expect(Number.isFinite(t.flatCard[s])).toBe(true);
          expect(Number.isFinite(t.pctCard[s])).toBe(true);
          expect(Number.isFinite(t.prodMult[s])).toBe(true);
        }
      }
    }
  });

  it('every card is strictly stronger at each level (no dead levels)', () => {
    for (const c of CARDS) {
      if (c.maxLevel < 2) continue; // single-level cards cannot regress
      let previous = -Infinity;
      for (let l = 1; l <= c.maxLevel; l++) {
        const t = makeCardTarget();
        c.apply(t, l);
        const magnitude = strength(t);
        // A level that does not increase the effect is a level the player
        // spends a card pick on for nothing.
        expect(magnitude, `${c.id} level ${l}`).toBeGreaterThan(previous);
        previous = magnitude;
      }
    }
  });

  it('every card leaves the tower with usable stats at max level', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const stats = new TowerStats();
    for (let i = 0; i < CARD_COUNT; i++) run.cardLevels[i] = CARDS[i]?.maxLevel ?? 0;
    applyCards(run, stats);
    for (let s = 0; s < STAT_COUNT; s++) {
      const v = stats.get(s);
      expect(Number.isFinite(v)).toBe(true);
      // Regen legitimately sits at 0 with no card or upgrade behind it; what
      // must never happen is a negative or non-finite stat.
      expect(v).toBeGreaterThanOrEqual(0);
    }
    for (const s of [ST.Dmg, ST.FireRate, ST.Range, ST.HpMax, ST.ProjSpeed, ST.GoldMult]) {
      expect(stats.get(s)).toBeGreaterThan(0);
    }
  });

  it('applyCards is idempotent', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const stats = new TowerStats();
    run.cardLevels[0] = 3;
    run.cardLevels[7] = 2;
    applyCards(run, stats);
    const before: number[] = [];
    for (let s = 0; s < STAT_COUNT; s++) before.push(stats.get(s));
    applyCards(run, stats);
    applyCards(run, stats);
    for (let s = 0; s < STAT_COUNT; s++) expect(stats.get(s)).toBeCloseTo(before[s]!, 6);
  });
});

describe('card offers (SPEC §8.1)', () => {
  it('offers three distinct cards', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const offer = new CardOffer();
    const rng = new Rng(99);
    for (let trial = 0; trial < 300; trial++) {
      offer.roll(run, rng);
      const seen = new Set<number>();
      for (let s = 0; s < OFFER_SIZE; s++) {
        const idx = offer.slots[s] ?? -1;
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(seen.has(idx)).toBe(false);
        seen.add(idx);
      }
    }
  });

  it('never offers a card already at max level', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    run.cardLevels[0] = CARDS[0]!.maxLevel;
    const offer = new CardOffer();
    const rng = new Rng(5);
    for (let trial = 0; trial < 400; trial++) {
      offer.roll(run, rng);
      for (let s = 0; s < OFFER_SIZE; s++) expect(offer.slots[s]).not.toBe(0);
    }
  });

  it('picking a card raises its level and closes the offer', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const stats = new TowerStats();
    const offer = new CardOffer();
    offer.roll(run, new Rng(1));
    const idx = offer.slots[0] ?? -1;
    expect(pickCard(offer, run, stats, 0)).toBe(idx);
    expect(run.cardLevels[idx]).toBe(1);
    expect(offer.open).toBe(false);
  });

  it('degrades gracefully when almost every card is maxed', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    for (let i = 1; i < CARD_COUNT; i++) run.cardLevels[i] = CARDS[i]?.maxLevel ?? 0;
    const offer = new CardOffer();
    offer.roll(run, new Rng(2));
    expect(offer.slots[0]).toBe(0);
    expect(offer.slots[1]).toBe(-1);
    expect(offer.slots[2]).toBe(-1);
  });

  it('is reproducible from a seed', () => {
    const roll = (): number[] => {
      const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
      run.reset(1, 12, 1);
      const offer = new CardOffer();
      offer.roll(run, new Rng(4242));
      return Array.from(offer.slots);
    };
    expect(roll()).toEqual(roll());
  });

  it('rarity weighting actually favours commons', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    const offer = new CardOffer();
    const rng = new Rng(777);
    let commons = 0;
    let rares = 0;
    for (let trial = 0; trial < 2000; trial++) {
      offer.roll(run, rng);
      for (let s = 0; s < OFFER_SIZE; s++) {
        const def = CARDS[offer.slots[s] ?? 0];
        if (def === undefined) continue;
        if (def.rarity === 0) commons++;
        else rares++;
      }
    }
    expect(commons).toBeGreaterThan(rares);
  });
});
