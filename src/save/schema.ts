/**
 * Save format (SPEC §15.2).
 *
 * The shape below is v2. ANY field change bumps `CURRENT_VERSION` and gains a
 * migration step — never a silent reinterpretation of old data. Discarding a
 * player's save is the single fastest route to a one-star review.
 */
export const CURRENT_VERSION = 2;

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

/** The v1 run snapshot, kept only so the v1 -> v2 migration can read one. */
export type RunSnapshotV1 = {
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

/** A run frozen mid-flight, so closing the app does not throw it away. */
export type RunSnapshot = {
  seed: number;
  wave: number;
  time: number;
  gold: number;
  goldEarned: number;
  /** Waves fully cleared, and the count that owes the next card (v2). */
  wavesCleared: number;
  nextCardWave: number;
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

type SaveBase = {
  meta: SaveMeta;
  stats: SaveStats;
  prefs: SavePrefs;
  idle: SaveIdle;
  /** Non-cryptographic hash of the payload. See save.ts for what it is for. */
  sig: string;
};

/** v1: XP-driven levels and a pickup-radius upgrade. Read-only, via migration. */
export type SaveV1 = SaveBase & { v: 1; run?: RunSnapshotV1 };

/** v2: gold is credited on death and cards come on a wave cadence. */
export type SaveV2 = SaveBase & { v: 2; run?: RunSnapshot };

/** The union of every version we can load. Grows with each migration. */
export type AnySave = SaveV1 | SaveV2;
/** The current shape. Change this alias when a v3 lands. */
export type Save = SaveV2;

export function makeDefaultSave(now: number): Save {
  return {
    v: 2,
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
