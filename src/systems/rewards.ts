import type { RunState } from '../core/state.ts';
import { bus, EV } from '../core/events.ts';

/**
 * Announces the gold earned this tick (SPEC §12.3 step 12).
 *
 * `damage.ts` credits gold the instant an enemy dies — there is no pickup to
 * collect — and accumulates the tick's total on `run.goldTick`. This is the one
 * place that turns it into a HUD event and folds it into the run total, so a
 * wave of ninety deaths costs one event, not ninety.
 */
export function updateRewards(run: RunState): void {
  const gained = run.goldTick;
  if (gained <= 0) return;
  run.goldTick = 0;
  run.goldEarned += gained;
  bus.emit(EV.GoldChanged, run.gold, gained);
}
