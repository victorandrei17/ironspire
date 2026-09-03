/**
 * Named modifiers granted by the talent tree.
 *
 * A plain data shape in `core/` so `entities/Tower` can hold one and
 * `systems/meta.ts` can fill it, without either importing the other
 * (CLAUDE.md §3).
 */
export type MetaModifiers = {
  upgradeCostMult: number;
  startGold: number;
  offlineRate: number;
  offlineCapHours: number;
  rerolls: number;
  reviveOnce: boolean;
  bossDamagePct: number;
  damageReductionPct: number;
  iframeBonus: number;
  cardLuckPct: number;
  coreGainPct: number;
};

export function makeModifiers(): MetaModifiers {
  return {
    upgradeCostMult: 1,
    startGold: 0,
    offlineRate: 0,
    offlineCapHours: 0,
    rerolls: 0,
    reviveOnce: false,
    bossDamagePct: 0,
    damageReductionPct: 0,
    iframeBonus: 0,
    cardLuckPct: 0,
    coreGainPct: 0,
  };
}

export function resetModifiers(out: MetaModifiers): void {
  out.upgradeCostMult = 1;
  out.startGold = 0;
  out.offlineRate = 0;
  out.offlineCapHours = 0;
  out.rerolls = 0;
  out.reviveOnce = false;
  out.bossDamagePct = 0;
  out.damageReductionPct = 0;
  out.iframeBonus = 0;
  out.cardLuckPct = 0;
  out.coreGainPct = 0;
}
