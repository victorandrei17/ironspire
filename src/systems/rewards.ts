import type { World } from '../entities/world.ts';
import type { RunState } from '../core/state.ts';
import { PICKUP_GOLD } from '../entities/pickupPool.ts';
import { R_TOWER_BODY } from '../core/constants.ts';
import { bus, EV } from '../core/events.ts';

/** Collected close enough to the tower to count as picked up. */
const COLLECT_RADIUS = R_TOWER_BODY * 0.8;

/**
 * Auto-collection (SPEC §12.3 step 12).
 *
 * Movement already magnetises pickups toward the tower; this only converts the
 * ones that arrived into gold and XP. Nothing here decides level-ups —
 * `progression.ts` owns that.
 */
export function updateRewards(world: World, run: RunState): void {
  const pk = world.pickups;
  const t = world.tower;
  const r2 = COLLECT_RADIUS * COLLECT_RADIUS;
  let gold = 0;
  let xp = 0;

  for (let i = 0; i < pk.count; i++) {
    if (pk.alive[i] === 0) continue;
    const dx = (pk.x[i] ?? 0) - t.x;
    const dy = (pk.y[i] ?? 0) - t.y;
    if (dx * dx + dy * dy > r2) continue;
    if ((pk.kind[i] ?? 0) === PICKUP_GOLD) gold += pk.value[i] ?? 0;
    else xp += pk.value[i] ?? 0;
    pk.free(i);
  }

  // Batched into one event each: 40 coins landing in a frame must not fire 40
  // HUD updates.
  if (gold > 0) {
    run.gold += gold;
    bus.emit(EV.GoldChanged, run.gold, gold);
  }
  if (xp > 0) {
    run.xp += xp;
    bus.emit(EV.XpChanged, run.xp, xp);
  }
}
