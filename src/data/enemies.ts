import { EF } from './enemyFlags.ts';
import type { SpriteKey } from '../render/spriteKeys.gen.ts';

/**
 * The nine archetypes of SPEC §5.1. Pure data — no behaviour here.
 *
 * `hpMul` multiplies the wave HP curve (BAL.wave), so an archetype's relative
 * threat stays fixed while the absolute numbers grow with the run.
 */
export type EnemyDef = {
  readonly id: string;
  /** PT-BR display name (SPEC: game strings are Portuguese). */
  readonly name: string;
  readonly sprite: SpriteKey;
  readonly hpMul: number;
  /** Base speed in world units per second, before the wave speed multiplier. */
  readonly speed: number;
  readonly dmg: number;
  /** Seconds between melee hits, or between shots for ranged types. */
  readonly attackInterval: number;
  readonly radius: number;
  readonly scale: number;
  readonly flags: number;
  /** Ranged types stop here instead of closing to contact. 0 = melee. */
  readonly preferredRange: number;
  /** Multipliers on the wave gold/XP curve. */
  readonly goldMul: number;
  readonly xpMul: number;
};

export const ENEMIES = {
  grunt: {
    id: 'grunt',
    name: 'Lacaio',
    sprite: 'enemy/grunt/walk_00',
    hpMul: 1.0,
    speed: 55,
    dmg: 4,
    attackInterval: 1.0,
    radius: 19,
    scale: 1,
    flags: 0,
    preferredRange: 0,
    goldMul: 1,
    xpMul: 1,
  },
  runner: {
    id: 'runner',
    name: 'Corredor',
    sprite: 'enemy/runner/walk_00',
    hpMul: 0.5,
    speed: 105,
    dmg: 3,
    // Fast and frequent: the runner punishes low fire rate, so it must actually
    // land hits once it arrives.
    attackInterval: 0.8,
    radius: 17,
    scale: 1,
    flags: 0,
    preferredRange: 0,
    goldMul: 1,
    xpMul: 1,
  },
  brute: {
    id: 'brute',
    name: 'Bruto',
    sprite: 'enemy/brute/walk_00',
    hpMul: 4.5,
    speed: 34,
    dmg: 14,
    attackInterval: 1.4,
    radius: 34,
    scale: 1,
    flags: 0,
    preferredRange: 0,
    goldMul: 2.2,
    xpMul: 2.2,
  },
  swarmling: {
    id: 'swarmling',
    name: 'Enxame',
    sprite: 'enemy/swarmling/walk_00',
    hpMul: 0.25,
    speed: 80,
    dmg: 2,
    attackInterval: 0.7,
    radius: 10,
    scale: 1,
    flags: 0,
    preferredRange: 0,
    goldMul: 0.4,
    xpMul: 0.4,
  },
  spitter: {
    id: 'spitter',
    name: 'Cuspidor',
    sprite: 'enemy/spitter/walk_00',
    hpMul: 1.2,
    speed: 45,
    dmg: 6,
    attackInterval: 2.0,
    radius: 19,
    scale: 1,
    flags: EF.Ranged,
    preferredRange: 260,
    goldMul: 1.3,
    xpMul: 1.3,
  },
  warden: {
    id: 'warden',
    name: 'Guardião',
    sprite: 'enemy/warden/walk_00',
    hpMul: 2.5,
    speed: 40,
    dmg: 8,
    attackInterval: 1.2,
    radius: 21,
    scale: 1,
    flags: EF.Shielded,
    preferredRange: 0,
    goldMul: 1.6,
    xpMul: 1.6,
  },
  mender: {
    id: 'mender',
    name: 'Curandeiro',
    sprite: 'enemy/mender/walk_00',
    hpMul: 1.5,
    speed: 42,
    dmg: 0,
    attackInterval: 1.0,
    radius: 19,
    scale: 1,
    flags: EF.Healer,
    // Hangs back at the edge of its heal radius so killing it takes a decision.
    preferredRange: 200,
    goldMul: 1.5,
    xpMul: 1.5,
  },
  splitter: {
    id: 'splitter',
    name: 'Cindido',
    sprite: 'enemy/splitter/walk_00',
    hpMul: 2.0,
    speed: 48,
    dmg: 6,
    attackInterval: 1.1,
    radius: 20,
    scale: 1,
    flags: EF.Splits,
    preferredRange: 0,
    goldMul: 1.4,
    xpMul: 1.4,
  },
  wraith: {
    id: 'wraith',
    name: 'Espectro',
    sprite: 'enemy/wraith/walk_00',
    hpMul: 1.0,
    speed: 70,
    dmg: 7,
    attackInterval: 1.0,
    radius: 19,
    scale: 1,
    flags: EF.Phasing,
    preferredRange: 0,
    goldMul: 1.3,
    xpMul: 1.3,
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

/** Stable index order — `defIdx` in the pool refers to this array. */
export const ENEMY_ORDER = [
  'grunt',
  'runner',
  'brute',
  'swarmling',
  'spitter',
  'warden',
  'mender',
  'splitter',
  'wraith',
] as const satisfies readonly EnemyId[];

export const ENEMY_LIST: readonly EnemyDef[] = ENEMY_ORDER.map((id) => ENEMIES[id]);

/** Sprite keys in `defIdx` order, for the pool's `keys` array. */
export const ENEMY_SPRITE_KEYS: readonly SpriteKey[] = ENEMY_LIST.map((d) => d.sprite);

export function enemyIndex(id: EnemyId): number {
  return ENEMY_ORDER.indexOf(id);
}

/** Behaviour tuning that is shared by every archetype (SPEC §4.3). */
export const ENEMY_TUNING = {
  /** Soft separation so bodies do not stack into one blob. */
  separationRadius: 26,
  separationForce: 190,
  /** How fast an enemy turns its velocity toward the seek direction. */
  steerAccel: 900,
  /** Extra distance beyond radii before a melee enemy counts as touching. */
  contactSlack: 2,
  /** Ranged enemies hold position within this band of preferredRange. */
  rangeBand: 24,
  /** Wraith phase cycle: immune for `phaseOn` out of every `phaseCycle` seconds. */
  phaseCycle: 4,
  phaseOn: 1,
  /** Warden shield: half-angle of the protected cone, and its damage cut. */
  shieldHalfAngle: (50 * Math.PI) / 180,
  shieldReduction: 0.6,
  /** Mender heals this fraction of an ally's max HP per second, within radius. */
  healPctPerSec: 0.03,
  healRadius: 120,
  /** Splitter death spawn. */
  splitInto: 'swarmling' as EnemyId,
  splitCount: 3,
  /** Children inherit this fraction of the parent's max HP. */
  splitHpFraction: 0.18,
  /** Explosive elite affix: area damage to the tower when it dies close by. */
  explosiveAffixRadius: 110,
  explosiveAffixDamage: 12,
  /** Vampiric elite affix heals this fraction of the damage it deals. */
  vampiricAffixHeal: 0.5,
  /** Armoured elite affix damage reduction. */
  armoredAffixReduction: 0.4,
  /** Enemy projectiles: slow enough to read and dodge-by-positioning. */
  projectileSpeed: 300,
  projectileRadius: 7,
} as const;
