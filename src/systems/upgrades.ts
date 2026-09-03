import type { RunState } from '../core/state.ts';
import type { TowerStats } from '../entities/tower.ts';
import { UPGRADES, upgradeCost, type UpgradeDef } from '../data/upgrades.ts';
import { geoAffordable } from '../core/math.ts';
import { bus, EV } from '../core/events.ts';

/**
 * Ceiling on a single MAX press. At 1e30 gold the geometric curve allows a few
 * hundred levels, so this is far above any reachable purchase — it exists only
 * so the correction loop can never run away.
 */
const MAX_BULK = 100_000;

/**
 * In-run upgrade purchases (SPEC §7.2).
 *
 * Levels are the source of truth; the stat layer is RECOMPUTED from them rather
 * than incremented per purchase. Incremental application drifts the moment a
 * card, a talent or a respec touches the same stat.
 */

/** Cost of the next level of upgrade `idx`. */
export function costOf(run: RunState, idx: number, costMult = 1): number {
  const def = UPGRADES[idx];
  if (def === undefined) return Infinity;
  const level = run.upgradeLevels[idx] ?? 0;
  if (def.maxLevel > 0 && level >= def.maxLevel) return Infinity;
  return upgradeCost(def, level, costMult);
}

export function isMaxed(run: RunState, idx: number): boolean {
  const def = UPGRADES[idx];
  if (def === undefined) return true;
  return def.maxLevel > 0 && (run.upgradeLevels[idx] ?? 0) >= def.maxLevel;
}

/** Buys one level if affordable. Returns true when something was bought. */
export function buyUpgrade(
  run: RunState,
  stats: TowerStats,
  idx: number,
  costMult = 1,
): boolean {
  const cost = costOf(run, idx, costMult);
  if (!Number.isFinite(cost) || run.gold < cost) return false;
  run.gold -= cost;
  run.upgradeLevels[idx] = (run.upgradeLevels[idx] ?? 0) + 1;
  applyUpgrades(run, stats);
  bus.emit(EV.UpgradeBought, idx, run.upgradeLevels[idx] ?? 0, cost);
  return true;
}

/**
 * How many levels the current gold can buy, and the exact total.
 *
 * The closed-form geometric sum gets us into the right neighbourhood in O(1)
 * instead of searching from zero. It cannot be the final answer, though: the
 * shop charges `floor()` per level, so the closed form is an UPPER bound on the
 * real cost and would sell the player fewer levels than they can afford, while
 * charging more than the levels actually cost. The correction below walks the
 * exact floored total from that starting point (SPEC §7.2).
 */
export function maxAffordable(
  run: RunState,
  idx: number,
  costMult = 1,
): { levels: number; cost: number } {
  const def = UPGRADES[idx];
  if (def === undefined) return { levels: 0, cost: 0 };
  const level = run.upgradeLevels[idx] ?? 0;
  const capLeft = def.maxLevel > 0 ? def.maxLevel - level : MAX_BULK;
  if (capLeft <= 0) return { levels: 0, cost: 0 };

  const cap = Math.min(capLeft, MAX_BULK);
  const base = def.costBase * costMult;
  // Lower bound from the closed form, then corrected against exact costs.
  let n = geoAffordable(base, def.costGrowth, level, run.gold, cap);
  let total = 0;
  for (let k = 0; k < n; k++) total += levelCost(def, level + k, costMult);

  // The closed form overcharges, so it can only ever undershoot; walk up.
  while (n < cap) {
    const next = levelCost(def, level + n, costMult);
    if (total + next > run.gold) break;
    total += next;
    n++;
  }
  // Belt and braces against float drift in the closed form.
  while (n > 0 && total > run.gold) {
    n--;
    total -= levelCost(def, level + n, costMult);
  }
  return { levels: n, cost: total };
}

/** Buys as many levels as the gold allows, in one transaction. */
export function buyMax(run: RunState, stats: TowerStats, idx: number, costMult = 1): number {
  const { levels, cost } = maxAffordable(run, idx, costMult);
  if (levels <= 0) return 0;
  run.gold -= cost;
  run.upgradeLevels[idx] = (run.upgradeLevels[idx] ?? 0) + levels;
  applyUpgrades(run, stats);
  bus.emit(EV.UpgradeBought, idx, run.upgradeLevels[idx] ?? 0, cost);
  return levels;
}

function levelCost(def: UpgradeDef, level: number, costMult: number): number {
  return Math.floor(def.costBase * Math.pow(def.costGrowth, level) * costMult);
}

/** Rebuilds the run stat layer from the current levels. Idempotent. */
export function applyUpgrades(run: RunState, stats: TowerStats): void {
  stats.flatRun.fill(0);
  stats.pctRun.fill(0);
  for (let i = 0; i < UPGRADES.length; i++) {
    const def = UPGRADES[i];
    if (def === undefined) continue;
    const level = run.upgradeLevels[i] ?? 0;
    if (level === 0) continue;
    if (def.kind === 'flat') {
      stats.flatRun[def.stat] = (stats.flatRun[def.stat] ?? 0) + def.perLevel * level;
    } else {
      stats.pctRun[def.stat] = (stats.pctRun[def.stat] ?? 0) + def.perLevel * level;
    }
  }
  stats.markDirty();
}
