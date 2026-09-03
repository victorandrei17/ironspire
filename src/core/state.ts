/**
 * Run-scoped scalar state (SPEC §12.6).
 *
 * Pure and serializable: no pools, no DOM, no imports beyond constants. The
 * entity container lives in `entities/World`; this is everything else, and it
 * is what a RunSnapshot will serialise in M5.
 */

export const SCENE = {
  Boot: 0,
  Loading: 1,
  Menu: 2,
  Run: 3,
  CardPick: 4,
  Pause: 5,
  Result: 6,
  Talents: 7,
} as const;

export type Scene = (typeof SCENE)[keyof typeof SCENE];

/** Targeting policies (SPEC §4.2), in the order the HUD button cycles them. */
export const POLICY = {
  Closest: 0,
  Strongest: 1,
  Weakest: 2,
  Fastest: 3,
  BossFirst: 4,
} as const;

export type TargetPolicy = (typeof POLICY)[keyof typeof POLICY];
export const POLICY_COUNT = 5;

export class RunState {
  seed = 0;
  wave = 0;
  /** Seconds elapsed in this run. */
  time = 0;
  gold = 0;
  xp = 0;
  xpToNext = 0;
  level = 1;
  kills = 0;
  damageDealt = 0;
  policy: TargetPolicy = POLICY.Closest;
  /** Levels banked but not yet spent on a card pick. */
  pendingCards = 0;
  rerollsLeft = 0;
  /** Set when the tower dies or the player retreats. */
  over = false;
  /** Gold bonus multiplier for the current wave (early-call reward). */
  waveGoldBonus = 1;

  reset(seed: number, xpToNext: number, rerolls: number): void {
    this.seed = seed;
    this.wave = 0;
    this.time = 0;
    this.gold = 0;
    this.xp = 0;
    this.xpToNext = xpToNext;
    this.level = 1;
    this.kills = 0;
    this.damageDealt = 0;
    this.policy = POLICY.Closest;
    this.pendingCards = 0;
    this.rerollsLeft = rerolls;
    this.over = false;
    this.waveGoldBonus = 1;
  }
}
