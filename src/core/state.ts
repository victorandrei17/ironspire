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
  /** Levels bought per upgrade, and per card taken. Sized by the caller so
   *  `core/` stays free of any dependency on the data tables. */
  readonly upgradeLevels: Int32Array;
  readonly cardLevels: Int32Array;

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
  /** Highest wave reached, which is what the end-of-run reward pays out on. */
  waveMax = 0;
  /** Total gold earned this run, for the result screen and the idle rate. */
  goldEarned = 0;

  constructor(upgradeCount: number, cardCount: number) {
    this.upgradeLevels = new Int32Array(upgradeCount);
    this.cardLevels = new Int32Array(cardCount);
  }

  reset(seed: number, xpToNext: number, rerolls: number): void {
    this.upgradeLevels.fill(0);
    this.cardLevels.fill(0);
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
    this.waveMax = 0;
    this.goldEarned = 0;
  }
}
