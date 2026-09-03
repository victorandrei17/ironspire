import type { RunState } from '../core/state.ts';
import type { World } from '../entities/world.ts';
import { BAL } from '../data/balance.ts';
import { bus, EV } from '../core/events.ts';

/** Cores earned for a run that reached `waveMax` (SPEC §2.3). */
export function coresForRun(waveMax: number, coreMult = 1): number {
  if (waveMax <= 0) return 0;
  return Math.floor(
    Math.pow(waveMax / BAL.reward.waveDivisor, BAL.reward.exponent) * coreMult,
  );
}

/** Waves still to clear before the next card offer. Never below zero. */
export function wavesToNextCard(run: RunState): number {
  return Math.max(0, run.nextCardWave - run.wavesCleared);
}

/**
 * Card offers, on a fixed wave cadence (SPEC §7.3).
 *
 * REPLACES the XP curve. Cards are a light bonus rather than the engine of a
 * run — the gold upgrades are the engine — so the offer arrives every
 * `cardEveryWaves` cleared waves and owes nothing to how well the player
 * fought.
 *
 * Offers are BANKED, not consumed on the spot: `wavesCleared` can cross two
 * thresholds while a card screen is already open, and the player is owed both.
 */
export function updateProgression(run: RunState): void {
  let earned = false;
  const every = Math.max(1, BAL.progression.cardEveryWaves);
  // A loop, not an if, for the same reason the XP version had one.
  while (run.wavesCleared >= run.nextCardWave) {
    run.nextCardWave += every;
    run.level++;
    run.pendingCards++;
    earned = true;
  }
  if (earned) bus.emit(EV.LevelUp, run.level, run.pendingCards);
}

/**
 * The "hit stop" before the card screen: time crawls for a moment.
 * Returns the timeScale the loop should use, or -1 when nothing is happening.
 */
export class LevelUpEffect {
  private t = 0;

  trigger(): void {
    this.t = BAL.progression.slowMoSec;
  }

  update(dt: number): void {
    if (this.t > 0) this.t = Math.max(0, this.t - dt);
  }

  get active(): boolean {
    return this.t > 0;
  }

  get timeScale(): number {
    return this.t > 0 ? BAL.progression.slowMoScale : 1;
  }

  reset(): void {
    this.t = 0;
  }
}

/**
 * Grants the heal that comes with the `hp_up` card.
 *
 * It lives here, not in the card's `apply`, because `apply` is pure by contract
 * (SPEC §8.3) and healing is a side effect on live state.
 */
export function healToMatchNewMax(world: World, previousMax: number): void {
  const gained = world.tower.hpMax - previousMax;
  if (gained > 0) world.tower.hp = Math.min(world.tower.hpMax, world.tower.hp + gained);
}
