import type { RunState } from '../core/state.ts';
import type { World } from '../entities/world.ts';
import { BAL } from '../data/balance.ts';
import { bus, EV } from '../core/events.ts';

/** XP needed to reach the next level (SPEC §7.3). */
export function xpToNext(level: number): number {
  return Math.floor(BAL.progression.xpBase * Math.pow(BAL.progression.xpGrowth, level - 1));
}

/** Cores earned for a run that reached `waveMax` (SPEC §2.3). */
export function coresForRun(waveMax: number, coreMult = 1): number {
  if (waveMax <= 0) return 0;
  return Math.floor(
    Math.pow(waveMax / BAL.reward.waveDivisor, BAL.reward.exponent) * coreMult,
  );
}

/**
 * Level-ups and the card offer (SPEC §12.3 step 15).
 *
 * Levels are BANKED rather than consumed immediately: a burst of XP from a boss
 * can cross two thresholds in one tick, and the player is owed both card picks.
 */
export function updateProgression(run: RunState): void {
  let levelled = false;
  // A loop, not an if: one pickup can cross several thresholds at once.
  while (run.xp >= run.xpToNext) {
    run.xp -= run.xpToNext;
    run.level++;
    run.pendingCards++;
    run.xpToNext = xpToNext(run.level);
    levelled = true;
  }
  if (levelled) bus.emit(EV.LevelUp, run.level, run.pendingCards);
}

/**
 * The "hit stop" on level-up: time crawls for a moment before the card screen.
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
