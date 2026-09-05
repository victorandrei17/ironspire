import { BAL } from './balance.ts';
import type { EnemyId } from './enemies.ts';
import { ENEMY_ORDER } from './enemies.ts';

/**
 * Wave composition and difficulty curves (SPEC §6).
 *
 * Composition comes from a weight table interpolated across wave anchors, not
 * from hand-written wave lists: 200 hand-authored waves is unmaintainable and
 * impossible to retune.
 */

/** `[wave, weight]` anchors. Weight 0 means the archetype has not unlocked yet. */
type Anchor = readonly [number, number];

export const WAVE_WEIGHTS: Record<EnemyId, readonly Anchor[]> = {
  grunt: [
    [1, 100],
    [10, 70],
    [25, 45],
    [50, 30],
  ],
  runner: [
    [3, 0],
    [4, 25],
    [15, 45],
    [40, 55],
  ],
  swarmling: [
    [6, 0],
    [7, 30],
    [20, 50],
    [45, 60],
  ],
  brute: [
    [8, 0],
    [9, 20],
    [25, 40],
    [50, 50],
  ],
  spitter: [
    [12, 0],
    [13, 20],
    [30, 40],
  ],
  warden: [
    [16, 0],
    [17, 18],
    [35, 35],
  ],
  mender: [
    [20, 0],
    [21, 12],
    [40, 22],
  ],
  splitter: [
    [24, 0],
    [25, 15],
    [45, 30],
  ],
  wraith: [
    [30, 0],
    [31, 15],
    [55, 30],
  ],
};

/** Linear interpolation between anchors, flat outside the declared range. */
export function weightAt(id: EnemyId, wave: number): number {
  const anchors = WAVE_WEIGHTS[id];
  const first = anchors[0];
  if (first === undefined) return 0;
  if (wave <= first[0]) return first[1];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (a === undefined || b === undefined) continue;
    if (wave <= b[0]) {
      const t = (wave - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return anchors[anchors.length - 1]?.[1] ?? 0;
}

/** Fills `out` with the weight of each archetype in ENEMY_ORDER. No allocation. */
export function fillWeights(out: Float32Array, wave: number): void {
  for (let i = 0; i < ENEMY_ORDER.length; i++) {
    const id = ENEMY_ORDER[i];
    out[i] = id === undefined ? 0 : weightAt(id, wave);
  }
}

// --- Curves (SPEC §6.2) ------------------------------------------------------

export function enemyCount(wave: number): number {
  return Math.min(
    BAL.wave.countCap,
    Math.floor(BAL.wave.countBase + wave * BAL.wave.countPerWave),
  );
}

/**
 * HP curve. The growth rate drops after `hpSoftCapWave` so the numbers stay in
 * a readable range instead of running away from float precision early.
 */
export function enemyHp(wave: number): number {
  const { hpBase, hpGrowth, hpSoftCapWave, hpGrowthLate } = BAL.wave;
  if (wave <= hpSoftCapWave) return hpBase * Math.pow(hpGrowth, wave - 1);
  return (
    hpBase *
    Math.pow(hpGrowth, hpSoftCapWave - 1) *
    Math.pow(hpGrowthLate, wave - hpSoftCapWave)
  );
}

/** Multiplier on each archetype's base speed. */
export function enemySpeedMul(wave: number): number {
  return Math.min(BAL.wave.speedCap, BAL.wave.speedBase * Math.pow(BAL.wave.speedGrowth, wave - 1));
}

/** Multiplier on each archetype's base damage for this wave. */
export function enemyDmgMul(wave: number): number {
  return Math.pow(BAL.wave.dmgGrowth, wave - 1);
}

export function goldDrop(wave: number): number {
  return BAL.wave.goldBase * Math.pow(BAL.wave.goldGrowth, wave - 1);
}

/** HP multiplier for the boss of `wave`, compounding per boss (SPEC §6.3). */
export function bossHpMult(wave: number): number {
  const n = Math.max(1, Math.floor(wave / BAL.boss.every));
  return BAL.boss.hpMult * Math.pow(BAL.boss.hpMultGrowth, n - 1);
}

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BAL.boss.every === 0;
}

/** Elite chance for a wave (SPEC §5.3). */
export function eliteChance(wave: number): number {
  if (wave < BAL.elite.startWave) return 0;
  return Math.min(
    BAL.elite.chanceCap,
    BAL.elite.chancePerWave * (wave - (BAL.elite.startWave - 1)),
  );
}

// --- Spawn patterns (SPEC §6.4) ---------------------------------------------

export const PATTERN = {
  Ring: 0,
  Arc: 1,
  Pincer: 2,
  Trickle: 3,
  Rush: 4,
} as const;

export type WavePattern = (typeof PATTERN)[keyof typeof PATTERN];

export const PATTERN_WEIGHTS = new Float32Array([50, 20, 15, 10, 5]);

/** First wave that can roll a pattern other than RING. */
export const PATTERN_START_WAVE = 5;

export const PATTERN_INFO = [
  { name: 'CERCO', icon: '◯', arcRad: Math.PI * 2, groups: 3, frontLoad: 0 },
  // ARC: everything from one 90 degree slice — rewards fan and pierce builds.
  { name: 'INVESTIDA', icon: '⟡', arcRad: Math.PI / 2, groups: 3, frontLoad: 0 },
  { name: 'TENAZ', icon: '⋈', arcRad: Math.PI / 3, groups: 4, frontLoad: 0 },
  // TRICKLE: same total, spread thin — tests sustained DPS, not burst.
  { name: 'GOTEJO', icon: '⋮', arcRad: Math.PI * 2, groups: 8, frontLoad: 0 },
  // RUSH: 70% of the wave at once — tests burst and ability timing.
  { name: 'AVALANCHE', icon: '⚡', arcRad: Math.PI * 2, groups: 2, frontLoad: 0.7 },
] as const;

/**
 * Per-pattern stretch of the wave's spawn window.
 *
 * The window's LENGTH comes from the wave (see `spawnWindow`); this only keeps
 * each pattern's pacing recognisable inside it — a drip is longer than a dump
 * even when both are pouring the same wave.
 */
export const PATTERN_WINDOW_MUL = [1, 1, 1.15, 1.6, 0.5] as const;

/**
 * Seconds from the first spawn of a wave to its last (SPEC §6.1).
 *
 * This is the wave's authored length: the early-call timer runs against it, and
 * the spawner derives its group delay from it rather than the other way round.
 * It grows with the wave because the wave grows — a fixed window meant wave 40
 * poured forty monsters in the same seven seconds wave 1 used for seven.
 */
export function spawnWindow(wave: number, pattern: WavePattern): number {
  const raw = BAL.wave.spawnBase + BAL.wave.spawnPerEnemy * enemyCount(wave);
  const mul = PATTERN_WINDOW_MUL[pattern] ?? 1;
  return Math.min(BAL.wave.spawnWindowCap, raw) * mul;
}
