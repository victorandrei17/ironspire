/**
 * Save format (SPEC §15.2).
 *
 * The shape below is v1. ANY field change bumps `CURRENT_VERSION` and gains a
 * migration step — never a silent reinterpretation of old data. Discarding a
 * player's save is the single fastest route to a one-star review.
 */
export const CURRENT_VERSION = 1;

export type TalentLevels = Record<string, number>;

export type SaveMeta = {
  nucleos: number;
  gemas: number;
  ether: number;
  talents: TalentLevels;
  unlocks: string[];
};

export type SaveStats = {
  totalRuns: number;
  bestWave: number;
  bestWaveEver: number;
  totalKills: number;
  playTimeSec: number;
  firstSeenAt: number;
};

export type SavePrefs = {
  sfx: number;
  music: number;
  haptics: boolean;
  reduceFlash: boolean;
  reduceShake: boolean;
  particleLevel: number;
  /** 0 = small, 1 = medium, 2 = large (SPEC §11.4). */
  uiScale: number;
  lefty: boolean;
  lang: string;
};

export type SaveIdle = {
  lastSeenAt: number;
  bestGoldPerMin: number;
  bestNucleosPerMin: number;
  /** Set when the device clock moved backwards; surfaces in diagnostics. */
  clockAnomalies: number;
};

/** A run frozen mid-flight, so closing the app does not throw it away. */
export type RunSnapshot = {
  seed: number;
  wave: number;
  time: number;
  gold: number;
  goldEarned: number;
  xp: number;
  xpToNext: number;
  level: number;
  kills: number;
  policy: number;
  pendingCards: number;
  rerollsLeft: number;
  waveMax: number;
  upgradeLevels: number[];
  cardLevels: number[];
  towerHp: number;
};

export type SaveV1 = {
  v: 1;
  meta: SaveMeta;
  stats: SaveStats;
  prefs: SavePrefs;
  idle: SaveIdle;
  run?: RunSnapshot;
  /** Non-cryptographic hash of the payload. See save.ts for what it is for. */
  sig: string;
};

/** The union of every version we can load. Grows with each migration. */
export type AnySave = SaveV1;
/** The current shape. Change this alias when a v2 lands. */
export type Save = SaveV1;

export function makeDefaultSave(now: number): Save {
  return {
    v: 1,
    meta: { nucleos: 0, gemas: 0, ether: 0, talents: {}, unlocks: [] },
    stats: {
      totalRuns: 0,
      bestWave: 0,
      bestWaveEver: 0,
      totalKills: 0,
      playTimeSec: 0,
      firstSeenAt: now,
    },
    prefs: {
      sfx: 0.8,
      music: 0.6,
      haptics: true,
      reduceFlash: false,
      reduceShake: false,
      particleLevel: 2,
      uiScale: 1,
      lefty: false,
      lang: 'pt',
    },
    idle: { lastSeenAt: now, bestGoldPerMin: 0, bestNucleosPerMin: 0, clockAnomalies: 0 },
    sig: '',
  };
}
