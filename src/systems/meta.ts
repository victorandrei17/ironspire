import type { TowerStats } from '../entities/tower.ts';
import { ST } from '../data/stats.ts';
import type { Save } from '../save/schema.ts';
import { type MetaModifiers, resetModifiers } from '../core/metaModifiers.ts';

export { makeModifiers } from '../core/metaModifiers.ts';
export type { MetaModifiers } from '../core/metaModifiers.ts';
import { TALENTS, talentCost, type TalentDef } from '../data/talents.ts';
import { BAL } from '../data/balance.ts';

/**
 * Meta progression: talents, cores, offline earnings and rebirth
 * (SPEC §10).
 *
 * Talents write only into the tower's META layer, so a respec is "clear the
 * layer and reapply" and can never corrupt run or card bonuses.
 */

/**
 * Rebuilds the meta stat layer and the modifier set from the saved ranks.
 *
 * Idempotent, for the same reason `applyUpgrades` is: a respec, a load and a
 * rebirth all funnel through this one function.
 */
/** Stats ether scales. Capped stats are excluded — the bonus would be wasted. */
const ETHER_STATS = [ST.Dmg, ST.FireRate, ST.HpMax, ST.GoldMult] as const;

export function applyTalents(save: Save, stats: TowerStats, out: MetaModifiers): void {
  stats.flatMeta.fill(0);
  stats.pctMeta.fill(0);
  stats.prodMeta.fill(1);
  resetModifiers(out);

  for (const def of TALENTS) {
    const rank = save.meta.talents[def.id] ?? 0;
    if (rank <= 0) continue;
    applyOne(def, rank, stats, out);
  }

  // Ether multiplies rather than adds, so each rebirth keeps moving the wall
  // (SPEC §10.3). Applied to the offensive and survival stats only — an ether
  // bonus on pickup radius or crit chance would just hit their caps.
  const etherMul = etherMultiplier(save.meta.ether);
  if (etherMul > 1) {
    for (const stat of ETHER_STATS) {
      stats.prodMeta[stat] = (stats.prodMeta[stat] ?? 1) * etherMul;
    }
  }
  stats.markDirty();
}

function applyOne(
  def: TalentDef,
  rank: number,
  stats: TowerStats,
  out: MetaModifiers,
): void {
  const capped = Math.min(rank, def.maxRank);
  if (def.kind === 'statFlat' && def.stat !== undefined) {
    stats.flatMeta[def.stat] = (stats.flatMeta[def.stat] ?? 0) + def.perRank * capped;
    return;
  }
  if (def.kind === 'statPct' && def.stat !== undefined) {
    stats.pctMeta[def.stat] = (stats.pctMeta[def.stat] ?? 0) + def.perRank * capped;
    return;
  }
  switch (def.special) {
    case 'upgradeCostMult':
    case 'damageReductionPct':
      // Compounding per rank, so ten ranks approach a limit instead of
      // reaching free upgrades or full immunity.
      applyCompounding(def, capped, out);
      break;
    case 'startGold':
    case 'offlineCapHours':
    case 'rerolls':
      addTo(out, def.special, def.perRank * capped);
      break;
    case 'offlineRate':
    case 'bossDamagePct':
    case 'cardLuckPct':
    case 'coreGainPct':
    case 'iframeBonus':
      addTo(out, def.special, def.perRank * capped);
      break;
    case 'reviveOnce':
      out.reviveOnce = true;
      break;
    case 'abilitySlot':
      out.abilityUnlocks |= def.perRank;
      break;
    case 'autoCast':
      out.autoCast = true;
      break;
    default:
      break;
  }
}

function applyCompounding(def: TalentDef, rank: number, out: MetaModifiers): void {
  const factor = Math.pow(1 - def.perRank, rank);
  if (def.special === 'upgradeCostMult') out.upgradeCostMult *= factor;
  else if (def.special === 'damageReductionPct') out.damageReductionPct = 1 - factor;
}

function addTo(out: MetaModifiers, key: keyof MetaModifiers, amount: number): void {
  const cur = out[key];
  if (typeof cur === 'number') (out[key] as number) = cur + amount;
}

// --- Talent purchases --------------------------------------------------------

export function talentRank(save: Save, id: string): number {
  return save.meta.talents[id] ?? 0;
}

export function nextTalentCost(save: Save, def: TalentDef): number {
  const rank = talentRank(save, def.id);
  if (rank >= def.maxRank) return Infinity;
  return talentCost(def, rank);
}

/** Buys one rank if the player can afford it. */
export function buyTalent(save: Save, def: TalentDef): boolean {
  const cost = nextTalentCost(save, def);
  if (!Number.isFinite(cost) || save.meta.nucleos < cost) return false;
  save.meta.nucleos -= cost;
  save.meta.talents[def.id] = talentRank(save, def.id) + 1;
  return true;
}

/** Refunds every core spent. Free and unlimited by design (SPEC §10.1). */
export function respec(save: Save): number {
  let refund = 0;
  for (const def of TALENTS) {
    const rank = talentRank(save, def.id);
    for (let r = 0; r < rank; r++) refund += talentCost(def, r);
    delete save.meta.talents[def.id];
  }
  save.meta.nucleos += refund;
  return refund;
}

// --- Offline earnings (SPEC §10.2) -------------------------------------------

export const OFFLINE = {
  /** Fraction of the player's best gold rate that accrues while away. */
  goldRate: 0.55,
  coreRate: 0.35,
  baseCapHours: 8,
  maxCapHours: 24,
} as const;

export type OfflineReward = {
  seconds: number;
  gold: number;
  nucleos: number;
  /** True when the device clock ran backwards and the reward was voided. */
  clockAnomaly: boolean;
  cappedAt: number;
};

/**
 * What the player earned while away.
 *
 * Guard: if `now` is before the stored timestamp the player moved their clock
 * back, so the reward is zero and the event is counted (SPEC §10.2). We do not
 * punish beyond that — a legitimate timezone change looks identical.
 */
export function computeOffline(save: Save, now: number, mods: MetaModifiers): OfflineReward {
  const last = save.idle.lastSeenAt;
  if (!Number.isFinite(last) || now < last) {
    return { seconds: 0, gold: 0, nucleos: 0, clockAnomaly: true, cappedAt: 0 };
  }
  const capHours = Math.min(OFFLINE.maxCapHours, OFFLINE.baseCapHours + mods.offlineCapHours);
  const capSeconds = capHours * 3600;
  const elapsed = Math.min((now - last) / 1000, capSeconds);
  const minutes = elapsed / 60;
  const rate = 1 + mods.offlineRate;
  return {
    seconds: elapsed,
    gold: Math.floor(save.idle.bestGoldPerMin * OFFLINE.goldRate * rate * minutes),
    nucleos: Math.floor(save.idle.bestNucleosPerMin * OFFLINE.coreRate * rate * minutes),
    clockAnomaly: false,
    cappedAt: capSeconds,
  };
}

/** Records the rates a finished run implies, keeping the best seen. */
export function recordRunRates(save: Save, cores: number, gold: number, seconds: number): void {
  if (seconds <= 5) return; // too short to be a meaningful rate
  const minutes = seconds / 60;
  save.idle.bestGoldPerMin = Math.max(save.idle.bestGoldPerMin, gold / minutes);
  save.idle.bestNucleosPerMin = Math.max(save.idle.bestNucleosPerMin, cores / minutes);
}

// --- Cores and rebirth -------------------------------------------------------

/** Cores for a finished run, including the Fortune branch bonus (SPEC §2.3). */
export function coresForRun(waveMax: number, mods: MetaModifiers, ether: number): number {
  if (waveMax <= 0) return 0;
  const base = Math.pow(waveMax / BAL.reward.waveDivisor, BAL.reward.exponent);
  return Math.floor(base * (1 + mods.coreGainPct) * etherMultiplier(ether));
}

export const REBIRTH_WAVE = 100;

/** Ether granted by a rebirth at `waveMax` (SPEC §10.3). */
export function etherForRebirth(waveMax: number): number {
  if (waveMax <= 60) return 0;
  return Math.floor(Math.pow(waveMax - 60, 0.9) / 3);
}

/**
 * Global multiplier from accumulated ether.
 *
 * COMPOUNDING, not additive. Prestige is the only unbounded growth in the game;
 * an additive ether bonus flattens out and the wall stops moving, which is the
 * exact failure the balance simulator surfaced for the late game.
 */
export function etherMultiplier(ether: number): number {
  return Math.pow(1.03, ether);
}

export function canRebirth(save: Save): boolean {
  return save.stats.bestWaveEver >= REBIRTH_WAVE;
}

/**
 * Performs a rebirth: cores and talents reset, ether is granted and kept.
 * Stats and preferences survive — the player's history is not the currency.
 */
export function rebirth(save: Save): number {
  if (!canRebirth(save)) return 0;
  const gained = etherForRebirth(save.stats.bestWaveEver);
  save.meta.ether += gained;
  save.meta.nucleos = 0;
  save.meta.talents = {};
  save.stats.bestWave = 0;
  return gained;
}
