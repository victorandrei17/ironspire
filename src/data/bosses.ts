import type { SpriteKey } from '../render/spriteKeys.gen.ts';
import type { BossSpriteId } from '../render/spriteKeys.manual.ts';

/**
 * The three V1 bosses (SPEC §5.2), as pure data.
 *
 * Every special attack carries a `telegraph` in seconds. That field is not
 * decoration: SPEC says every boss attack is telegraphed, without exception,
 * and a boss whose damage arrives unannounced is the fastest way to make an
 * idle game feel unfair.
 */

export const BOSS_ACTION = {
  /** Charge in a straight line at the tower. */
  Dash: 0,
  /** Spawn a ring of minions. */
  Summon: 1,
  /** Blink to a new position on the ring. */
  Teleport: 2,
  /** Drop a lingering damage zone on the ground. */
  GroundZone: 3,
  /** Regain a damage-absorbing shield. */
  Shield: 4,
} as const;

export type BossActionKind = (typeof BOSS_ACTION)[keyof typeof BOSS_ACTION];

export type BossAction = {
  readonly kind: BossActionKind;
  /** Seconds between attempts. */
  readonly cooldown: number;
  /** Seconds of visible warning before it lands (SPEC §5.2). */
  readonly telegraph: number;
  /** Meaning depends on the kind: dash speed, zone radius, shield fraction. */
  readonly power: number;
  /** Seconds the effect lasts, where that applies. */
  readonly duration: number;
};

export type BossDef = {
  readonly id: string;
  readonly name: string;
  readonly sprite: SpriteKey;
  readonly spriteId: BossSpriteId;
  /** Multiplier on the wave HP curve, on top of BAL.boss.hpMult. */
  readonly hpMul: number;
  readonly speed: number;
  readonly dmg: number;
  readonly attackInterval: number;
  readonly radius: number;
  readonly scale: number;
  readonly actions: readonly BossAction[];
};

export const BOSSES = [
  {
    id: 'boss_colossus',
    name: 'COLOSSO',
    sprite: 'boss/colossus/walk_00',
    spriteId: 'colossus',
    hpMul: 1.0,
    speed: 26,
    dmg: 22,
    attackInterval: 1.5,
    radius: 46,
    scale: 1.0,
    actions: [
      // A long telegraph on a high-damage charge: the player is meant to have
      // time to fire an ability, not to dodge (the tower cannot move).
      { kind: BOSS_ACTION.Dash, cooldown: 7, telegraph: 0.9, power: 420, duration: 1.1 },
    ],
  },
  {
    id: 'boss_hive',
    name: 'COLMEIA',
    sprite: 'boss/hive/walk_00',
    spriteId: 'hive',
    // Lower HP than the others: it dies fast if focused, which is the whole
    // decision it poses (SPEC §5.2).
    hpMul: 0.7,
    speed: 30,
    dmg: 10,
    attackInterval: 1.4,
    radius: 44,
    scale: 1.0,
    actions: [{ kind: BOSS_ACTION.Summon, cooldown: 6, telegraph: 0.6, power: 6, duration: 0 }],
  },
  {
    id: 'boss_warlock',
    name: 'BRUXO',
    sprite: 'boss/warlock/walk_00',
    spriteId: 'warlock',
    hpMul: 0.9,
    speed: 34,
    dmg: 14,
    attackInterval: 1.6,
    radius: 42,
    scale: 1.0,
    actions: [
      { kind: BOSS_ACTION.Teleport, cooldown: 9, telegraph: 0.6, power: 240, duration: 0 },
      { kind: BOSS_ACTION.GroundZone, cooldown: 5, telegraph: 0.7, power: 90, duration: 4 },
      { kind: BOSS_ACTION.Shield, cooldown: 14, telegraph: 0.6, power: 0.25, duration: 6 },
    ],
  },
] as const satisfies readonly BossDef[];

export type BossId = (typeof BOSSES)[number]['id'];

/**
 * Which boss a given wave gets, cycling in order (SPEC §5.2):
 * wave 10 → colossus, 20 → hive, 30 → warlock, 40 → colossus again.
 */
export function bossIndexForWave(wave: number, every: number): number {
  const nth = Math.floor(wave / every) - 1;
  if (nth < 0) return 0;
  return nth % BOSSES.length;
}

export function bossForWave(wave: number, every: number): BossDef {
  return BOSSES[bossIndexForWave(wave, every)] ?? BOSSES[0];
}

/** Damage a ground zone deals per tick, and how often it ticks. */
export const ZONE_TUNING = {
  damagePerTick: 6,
  tickInterval: 0.5,
} as const;
