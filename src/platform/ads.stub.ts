/**
 * Rewarded-ad interface (SPEC §18).
 *
 * The stub ships with the game and the real network is swapped in behind it.
 * The interface is written the way the design demands, so integrating a network
 * later cannot quietly change the rules:
 *
 *  - Rewarded only. There is no interstitial method here at all, so no one can
 *    add one to a run by accident.
 *  - Every call is explicitly opt-in and returns whether the reward was earned;
 *    a dismissed ad pays nothing and is not an error.
 *  - The caller grants the reward. The ad layer never touches game state.
 */
export const REWARD = {
  DoubleOffline: 'double_offline',
  ExtraReroll: 'extra_reroll',
  Revive: 'revive',
  DoubleRunReward: 'double_run_reward',
} as const;

export type RewardId = (typeof REWARD)[keyof typeof REWARD];

export type AdResult =
  | { status: 'earned'; reward: RewardId }
  | { status: 'dismissed' }
  | { status: 'unavailable' };

export type AdProvider = {
  /** True when a rewarded ad is loaded and can be shown right now. */
  isReady(reward: RewardId): boolean;
  /** Shows the ad. Resolves once it closes, one way or the other. */
  show(reward: RewardId): Promise<AdResult>;
};

/**
 * The shipping default: no ads. Every call site therefore exercises the
 * "unavailable" branch during development, which is the branch most likely to
 * be wrong on the day a network is plugged in.
 */
export class NoAdsProvider implements AdProvider {
  isReady(): boolean {
    return false;
  }

  show(): Promise<AdResult> {
    return Promise.resolve({ status: 'unavailable' });
  }
}

/**
 * Minimum seconds between any two ad presentations.
 *
 * SPEC §18: never an interstitial inside a run, and at most one ad every four
 * minutes. Enforced here rather than at each call site so the rule cannot be
 * forgotten by whoever adds the fifth reward.
 */
export const MIN_SECONDS_BETWEEN_ADS = 240;

export class AdGate {
  private lastShownAt = -Infinity;

  constructor(
    private readonly provider: AdProvider,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  canShow(reward: RewardId): boolean {
    if (!this.provider.isReady(reward)) return false;
    return (this.clock() - this.lastShownAt) / 1000 >= MIN_SECONDS_BETWEEN_ADS;
  }

  async show(reward: RewardId): Promise<AdResult> {
    if (!this.canShow(reward)) return { status: 'unavailable' };
    this.lastShownAt = this.clock();
    try {
      return await this.provider.show(reward);
    } catch {
      // A network that throws must not look like a granted reward.
      return { status: 'unavailable' };
    }
  }
}
