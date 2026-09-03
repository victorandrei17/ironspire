import type { SpriteKey } from '../render/spriteKeys.gen.ts';
import { ST } from './stats.ts';

/**
 * The eight in-run upgrades (SPEC §7.2).
 *
 * `cost(level) = floor(base * growth^level)`. `apply` writes into the tower's
 * run layer; it is pure data plus one assignment, never gameplay.
 */
export type UpgradeKind = 'flat' | 'pctOfBase';

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
    kind: 'pctOfBase',
    perLevel: 0.12,
    costBase: 20,
    costGrowth: 1.115,
    maxLevel: 0,
    blurb: '+12%',
  },
  {
    id: 'rate',
    name: 'CADÊNCIA',
    icon: 'ui/up_rate',
    stat: ST.FireRate,
    kind: 'pctOfBase',
    perLevel: 0.07,
    costBase: 25,
    costGrowth: 1.125,
    maxLevel: 0,
    blurb: '+7%',
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
    kind: 'flat',
    perLevel: 18,
    costBase: 35,
    costGrowth: 1.12,
    maxLevel: 0,
    blurb: '+18',
  },
  {
    id: 'regen',
    name: 'REGEN',
    icon: 'ui/up_regen',
    stat: ST.HpRegen,
    kind: 'flat',
    perLevel: 0.25,
    costBase: 60,
    costGrowth: 1.16,
    maxLevel: 0,
    blurb: '+0.25/s',
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
    kind: 'pctOfBase',
    perLevel: 0.12,
    costBase: 70,
    costGrowth: 1.15,
    maxLevel: 0,
    blurb: '+12%',
  },
  {
    id: 'pickup',
    name: 'COLETA',
    icon: 'ui/up_pickup',
    stat: ST.PickupRadius,
    kind: 'flat',
    perLevel: 14,
    costBase: 40,
    costGrowth: 1.11,
    maxLevel: 0,
    blurb: '+14',
  },
] as const satisfies readonly UpgradeDef[];

export type UpgradeId = (typeof UPGRADES)[number]['id'];
export const UPGRADE_COUNT = UPGRADES.length;

/** Cost of the NEXT level when the player already owns `level` of them. */
export function upgradeCost(def: UpgradeDef, level: number, costMult = 1): number {
  return Math.floor(def.costBase * Math.pow(def.costGrowth, level) * costMult);
}
