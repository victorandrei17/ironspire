import type { SpriteKey } from '../render/spriteKeys.gen.ts';
import { ST } from './stats.ts';

/**
 * The eight in-run upgrades (SPEC §7.2).
 *
 * `cost(level) = floor(base * growth^level)`. `apply` writes into the tower's
 * run layer; it is pure data plus one assignment, never gameplay.
 */
/**
 * `mult` compounds: level L multiplies the stat by `perLevel^L`.
 *
 * SPEC §7.2 originally had every upgrade additive. The balance simulator made
 * it clear that cannot work: gold income is geometric, so affordable LEVELS
 * grow logarithmically, an additive bonus therefore grows logarithmically too,
 * and it has to keep up with enemy HP growing exponentially. The gap is not a
 * tuning problem, it is a shape problem — by wave 100 the additive curve is off
 * by six orders of magnitude. The stats that must track HP compound; the ones
 * meant to stay bounded (range, gold bonus, crit chance) stay additive.
 *
 * Exactly ONE stat compounds, and that is deliberate. Every `mult` upgrade adds
 * its own exponent to the player's power curve (income and cost are both
 * geometric, so levels grow linearly and a multiplier per level is an
 * exponential in waves). With damage, fire rate AND crit damage all
 * compounding, an optimiser's DPS grew ~18% per wave against enemy HP at 9.5%:
 * no wall existed at all for anyone who spread across the three. Keeping the
 * other two additive turns that advantage back into a constant factor instead
 * of an exponent, which is what makes the wall land in the same place for
 * everyone.
 */
export type UpgradeKind = 'flat' | 'pctOfBase' | 'mult';

export type UpgradeDef = {
  readonly id: string;
  /** PT-BR label for the button (SPEC: game strings are Portuguese). */
  readonly name: string;
  readonly icon: SpriteKey;
  readonly stat: number;
  readonly kind: UpgradeKind;
  /** Per-level effect: flat units, or a fraction of the base stat. */
  readonly perLevel: number;
  readonly costBase: number;
  readonly costGrowth: number;
  /** Hard ceiling on levels, or 0 for none. */
  readonly maxLevel: number;
  /** Short effect text for the button subtitle. */
  readonly blurb: string;
};

export const UPGRADES = [
  {
    id: 'damage',
    name: 'DANO',
    icon: 'ui/up_damage',
    stat: ST.Dmg,
    kind: 'mult',
    perLevel: 1.085,
    costBase: 20,
    costGrowth: 1.115,
    maxLevel: 0,
    blurb: '×1.075',
  },
  {
    id: 'rate',
    name: 'CADÊNCIA',
    icon: 'ui/up_rate',
    stat: ST.FireRate,
    kind: 'pctOfBase',
    perLevel: 0.06,
    costBase: 25,
    costGrowth: 1.125,
    maxLevel: 0,
    blurb: '+6%',
  },
  {
    id: 'range',
    name: 'ALCANCE',
    icon: 'ui/up_range',
    stat: ST.Range,
    kind: 'flat',
    perLevel: 8,
    costBase: 30,
    costGrowth: 1.1,
    maxLevel: 0,
    blurb: '+8',
  },
  {
    id: 'hp',
    name: 'VIDA',
    icon: 'ui/up_hp',
    stat: ST.HpMax,
    kind: 'mult',
    perLevel: 1.055,
    costBase: 35,
    costGrowth: 1.12,
    maxLevel: 0,
    blurb: '×1.055',
  },
  {
    id: 'regen',
    name: 'REGEN',
    icon: 'ui/up_regen',
    stat: ST.HpRegen,
    // Regen stays additive AND is expressed as a share of max HP downstream,
    // so it scales with the Vida upgrade instead of becoming irrelevant.
    kind: 'flat',
    perLevel: 0.6,
    costBase: 60,
    costGrowth: 1.16,
    maxLevel: 0,
    blurb: '+0.6/s',
  },
  {
    id: 'critchance',
    name: 'CRÍT',
    icon: 'ui/up_critchance',
    stat: ST.CritChance,
    kind: 'flat',
    perLevel: 0.012,
    costBase: 55,
    costGrowth: 1.14,
    // Crit chance is capped at 60% in TowerStats; the level cap keeps the
    // button from staying buyable long after it stopped doing anything.
    maxLevel: 46,
    blurb: '+1.2%',
  },
  {
    id: 'critdmg',
    name: 'D.CRÍT',
    icon: 'ui/up_critdmg',
    stat: ST.CritMult,
    kind: 'flat',
    perLevel: 0.07,
    costBase: 70,
    costGrowth: 1.15,
    maxLevel: 0,
    blurb: '+0.07x',
  },
  {
    id: 'gold',
    name: 'OURO',
    icon: 'ui/up_gold',
    stat: ST.GoldMult,
    /**
     * Additive, and the cost climbs faster than any other button: this one buys
     * income, so it pays for its own next level. Compounding it as well would
     * turn the shop into a single correct answer.
     */
    kind: 'flat',
    perLevel: 0.05,
    costBase: 60,
    costGrowth: 1.16,
    maxLevel: 0,
    blurb: '+5%',
  },
] as const satisfies readonly UpgradeDef[];

export type UpgradeId = (typeof UPGRADES)[number]['id'];
export const UPGRADE_COUNT = UPGRADES.length;

/** Cost of the NEXT level when the player already owns `level` of them. */
export function upgradeCost(def: UpgradeDef, level: number, costMult = 1): number {
  return Math.floor(def.costBase * Math.pow(def.costGrowth, level) * costMult);
}
