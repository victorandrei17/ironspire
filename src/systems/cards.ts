import type { RunState } from '../core/state.ts';
import type { TowerStats } from '../entities/tower.ts';
import type { Rng } from '../core/rng.ts';
import { CARDS, RARITY_WEIGHTS, cardIndex, type CardDef } from '../data/cards.ts';
import { bus, EV } from '../core/events.ts';

export const OFFER_SIZE = 3;

/**
 * The card offer (SPEC §8.1).
 *
 * Three options, never repeated within an offer, never a card already at max
 * level. There is deliberately NO timer: mobile play is interruptible, and a
 * countdown on a decision screen is hostile when the player might be crossing
 * a street.
 */
export class CardOffer {
  /** Indices into CARDS. -1 means the slot could not be filled. */
  readonly slots = new Int32Array(OFFER_SIZE).fill(-1);
  open = false;

  private readonly eligible = new Int32Array(CARDS.length);
  private readonly weights = new Float32Array(CARDS.length);

  /**
   * Rolls a fresh offer. Safe to call again for a reroll.
   *
   * `luck` shifts weight from commons toward rare and above (the Arcane talent).
   */
  roll(run: RunState, rng: Rng, luck = 0): void {
    this.slots.fill(-1);
    for (let slot = 0; slot < OFFER_SIZE; slot++) {
      const n = this.collectEligible(run, slot, luck);
      if (n === 0) break;
      const pick = rng.weighted(this.weights, n);
      if (pick < 0) break;
      this.slots[slot] = this.eligible[pick] ?? -1;
    }
    this.open = true;
    bus.emit(EV.CardOffered, this.slots[0] ?? -1, this.slots[1] ?? -1, this.slots[2] ?? -1);
  }

  /**
   * Builds the eligible list for one slot: not maxed, not already offered, and
   * with its requirements met. Weight is the card's rarity weight.
   */
  private collectEligible(run: RunState, slot: number, luck: number): number {
    let n = 0;
    for (let i = 0; i < CARDS.length; i++) {
      const def = CARDS[i];
      if (def === undefined) continue;
      if ((run.cardLevels[i] ?? 0) >= def.maxLevel) continue;
      let dup = false;
      for (let s = 0; s < slot; s++) if (this.slots[s] === i) dup = true;
      if (dup) continue;
      if (def.requires !== undefined && !this.requirementsMet(run, def)) continue;
      // A fusion is offered only once both its parents are maxed; otherwise it
      // would show up as a random legendary and spend the discovery moment.
      if (def.evolutionOf !== undefined && !this.parentsMaxed(run, def.evolutionOf)) continue;
      this.eligible[n] = i;
      // Luck is a flat tilt away from commons; it can never make a common
      // impossible, which would strand a player whose rares are all maxed.
      const base = RARITY_WEIGHTS[def.rarity] ?? 1;
      this.weights[n] = def.rarity === 0 ? Math.max(1, base * (1 - luck * 0.5)) : base * (1 + luck);
      n++;
    }
    return n;
  }

  private parentsMaxed(run: RunState, parents: readonly [string, string]): boolean {
    for (const id of parents) {
      const idx = cardIndex(id);
      const def = idx >= 0 ? CARDS[idx] : undefined;
      if (def === undefined) return false;
      if ((run.cardLevels[idx] ?? 0) < def.maxLevel) return false;
    }
    return true;
  }

  private requirementsMet(run: RunState, def: CardDef): boolean {
    const reqs = def.requires;
    if (reqs === undefined) return true;
    for (const id of reqs) {
      const idx = CARDS.findIndex((c) => c.id === id);
      if (idx < 0 || (run.cardLevels[idx] ?? 0) === 0) return false;
    }
    return true;
  }

  close(): void {
    this.open = false;
    this.slots.fill(-1);
  }
}

/** Takes the card in `slot`. Returns the card index, or -1 if the slot is empty. */
export function pickCard(
  offer: CardOffer,
  run: RunState,
  stats: TowerStats,
  slot: number,
): number {
  const idx = offer.slots[slot] ?? -1;
  if (idx < 0) return -1;
  run.cardLevels[idx] = (run.cardLevels[idx] ?? 0) + 1;
  applyCards(run, stats);
  offer.close();
  bus.emit(EV.CardPicked, idx, run.cardLevels[idx] ?? 0);
  return idx;
}

/**
 * Rebuilds the card stat layer from the current card levels.
 *
 * Every `apply` is called once with its CUMULATIVE level, which is exactly the
 * contract that makes it pure and idempotent: re-running this must produce the
 * same stats, never stack them.
 */
export function applyCards(run: RunState, stats: TowerStats): void {
  stats.flatCard.fill(0);
  stats.pctCard.fill(0);
  stats.prodMult.fill(1);
  stats.flags = 0;
  stats.slowAuraRadius = 0;
  stats.slowAuraMul = 1;
  stats.thornsPct = 0;
  stats.lifestealPct = 0;
  stats.lifestealCap = 0;
  stats.chainJumps = 0;
  stats.chainRadius = 0;
  stats.chainFalloff = 1;
  stats.orbitalCount = 0;
  stats.orbitalRadius = 0;
  stats.explosiveRadius = 0;
  stats.explosivePct = 0;
  stats.frostNovaCd = 0;
  stats.frostNovaRadius = 0;
  stats.frostNovaFreeze = 0;
  stats.overchargeDrainPct = 0;
  stats.deathmarkEvery = 0;
  stats.deathmarkThreshold = 0;
  stats.deathmarkBossMult = 1;

  for (let i = 0; i < CARDS.length; i++) {
    const level = run.cardLevels[i] ?? 0;
    if (level === 0) continue;
    CARDS[i]?.apply(stats, level);
  }
  stats.markDirty();
}
