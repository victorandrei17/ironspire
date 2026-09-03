/**
 * Stat and card-flag identifiers.
 *
 * In `data/` because the upgrade and card tables name them, and data must never
 * import from `entities/` (CLAUDE.md §3). `entities/tower.ts` re-exports them
 * so gameplay code can keep importing from one obvious place.
 */

/** Plain indices into parallel arrays: a stat lookup is an array read. */
export const ST = {
  Dmg: 0,
  FireRate: 1,
  Range: 2,
  HpMax: 3,
  HpRegen: 4,
  CritChance: 5,
  CritMult: 6,
  Projectiles: 7,
  Pierce: 8,
  ProjSpeed: 9,
  PickupRadius: 10,
  GoldMult: 11,
} as const;

export const STAT_COUNT = 12;

/** Behaviour flags set by cards; systems read them, data never runs logic. */
export const TF = {
  SlowAura: 1 << 0,
  Thorns: 1 << 1,
  Lifesteal: 1 << 2,
  Chain: 1 << 3,
  Orbital: 1 << 4,
  Explosive: 1 << 5,
  FrostNova: 1 << 6,
  Overcharge: 1 << 7,
  Deathmark: 1 << 8,
} as const;
