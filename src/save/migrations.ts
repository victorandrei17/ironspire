import { CURRENT_VERSION, makeDefaultSave, type Save, type RunSnapshot } from './schema.ts';

/**
 * Version migration chain (SPEC §15.3).
 *
 * `migrate` runs v1 -> v2 -> v3 ... one step at a time until the save is
 * current. Each step only knows about its own hop, which is what keeps the
 * chain testable as it grows.
 */
export type MigrationStep = (save: Record<string, unknown>) => Record<string, unknown>;

/** Index i migrates a save at version i+1 to version i+2. Empty at v1. */
const STEPS: readonly MigrationStep[] = [
  // Example of the shape a v1 -> v2 step will take:
  // (s) => ({ ...s, v: 2, meta: { ...(s.meta as object), newField: 0 } }),
];

export type MigrateResult = {
  save: Save;
  /** How many hops ran. 0 means the save was already current. */
  steps: number;
  /** True when the input was unusable and a fresh save was produced. */
  recovered: boolean;
};

/**
 * Brings any known save version up to current, filling missing fields with
 * defaults. Never throws and never returns null: a broken save degrades to a
 * fresh one rather than to a crash on boot.
 */
export function migrate(raw: unknown, now: number): MigrateResult {
  if (raw === null || typeof raw !== 'object') {
    return { save: makeDefaultSave(now), steps: 0, recovered: true };
  }
  let cur = raw as Record<string, unknown>;
  const version = typeof cur.v === 'number' ? cur.v : 0;
  if (version < 1 || version > CURRENT_VERSION) {
    // A version from the future means the player downgraded the app. Keeping
    // the file untouched and starting fresh in memory is safer than guessing.
    return { save: makeDefaultSave(now), steps: 0, recovered: true };
  }

  let steps = 0;
  for (let v = version; v < CURRENT_VERSION; v++) {
    const step = STEPS[v - 1];
    if (step === undefined) break;
    cur = step(cur);
    steps++;
  }

  return { save: fillDefaults(cur, now), steps, recovered: false };
}

/**
 * Merges the loaded object over a fresh default.
 *
 * A field added in a later build must not read as `undefined` on an older
 * save, and a hand-edited file must not be able to inject a wrong type into
 * gameplay.
 */
function fillDefaults(raw: Record<string, unknown>, now: number): Save {
  const base = makeDefaultSave(now);
  const meta = obj(raw.meta);
  const stats = obj(raw.stats);
  const prefs = obj(raw.prefs);
  const idle = obj(raw.idle);

  return {
    v: 1,
    meta: {
      nucleos: num(meta.nucleos, base.meta.nucleos),
      gemas: num(meta.gemas, base.meta.gemas),
      ether: num(meta.ether, base.meta.ether),
      talents: numMap(meta.talents),
      unlocks: strList(meta.unlocks),
    },
    stats: {
      totalRuns: num(stats.totalRuns, 0),
      bestWave: num(stats.bestWave, 0),
      bestWaveEver: num(stats.bestWaveEver, 0),
      totalKills: num(stats.totalKills, 0),
      playTimeSec: num(stats.playTimeSec, 0),
      firstSeenAt: num(stats.firstSeenAt, now),
    },
    prefs: {
      sfx: clamp01(num(prefs.sfx, base.prefs.sfx)),
      music: clamp01(num(prefs.music, base.prefs.music)),
      haptics: bool(prefs.haptics, base.prefs.haptics),
      reduceFlash: bool(prefs.reduceFlash, base.prefs.reduceFlash),
      reduceShake: bool(prefs.reduceShake, base.prefs.reduceShake),
      particleLevel: num(prefs.particleLevel, base.prefs.particleLevel),
      uiScale: clampInt(num(prefs.uiScale, base.prefs.uiScale), 0, 2),
      lefty: bool(prefs.lefty, base.prefs.lefty),
      lang: typeof prefs.lang === 'string' ? prefs.lang : base.prefs.lang,
    },
    idle: {
      lastSeenAt: num(idle.lastSeenAt, now),
      bestGoldPerMin: num(idle.bestGoldPerMin, 0),
      bestNucleosPerMin: num(idle.bestNucleosPerMin, 0),
      clockAnomalies: num(idle.clockAnomalies, 0),
    },
    ...(isRunSnapshot(raw.run) ? { run: raw.run } : {}),
    sig: typeof raw.sig === 'string' ? raw.sig : '',
  };
}

/**
 * A snapshot is only restored when it carries the fields the resume path
 * needs. A half-written one is dropped rather than resumed into a broken run.
 */
function isRunSnapshot(v: unknown): v is RunSnapshot {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.seed === 'number' &&
    typeof r.wave === 'number' &&
    typeof r.towerHp === 'number' &&
    Array.isArray(r.upgradeLevels) &&
    Array.isArray(r.cardLevels)
  );
}

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(v);
  return n < lo ? lo : n > hi ? hi : n;
}

function numMap(v: unknown): Record<string, number> {
  const src = obj(v);
  const out: Record<string, number> = {};
  for (const key of Object.keys(src)) {
    const n = src[key];
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
