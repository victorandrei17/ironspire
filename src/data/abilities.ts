import type { SpriteKey } from '../render/spriteKeys.gen.ts';

/**
 * The three active abilities (SPEC §9).
 *
 * With the Automation talent they fire on their own condition — the game has
 * to remain playable with the screen off, which is the promise of the genre.
 */
export const ABILITY = {
  Nova: 0,
  Fury: 1,
  Bulwark: 2,
} as const;

export type AbilityId = (typeof ABILITY)[keyof typeof ABILITY];

export type AbilityDef = {
  readonly id: string;
  readonly name: string;
  readonly icon: SpriteKey;
  readonly cooldown: number;
  /** Seconds the effect lasts. 0 for instant abilities. */
  readonly duration: number;
  /** Meaning depends on the ability: damage multiple, rate bonus, shield share. */
  readonly power: number;
  readonly radius: number;
  readonly desc: string;
  /**
   * Auto-cast condition, read by the ability system:
   *  - `crowd`: at least `autoThreshold` enemies inside `radius`
   *  - `lowHp`: tower health below `autoThreshold` as a fraction
   *  - `always`: the moment it is off cooldown
   */
  readonly auto: 'crowd' | 'lowHp' | 'always';
  readonly autoThreshold: number;
};

export const ABILITIES = [
  {
    id: 'nova',
    name: 'Pulso de Choque',
    icon: 'ui/ability_nova',
    cooldown: 20,
    duration: 0,
    power: 4.0,
    radius: 240,
    desc: '400% do dano num raio de 240 e empurra',
    auto: 'crowd',
    autoThreshold: 6,
  },
  {
    id: 'fury',
    name: 'Fúria',
    icon: 'ui/ability_fury',
    cooldown: 35,
    duration: 8,
    power: 1.5,
    radius: 0,
    desc: '+150% de cadência e +40% de dano por 8 s',
    auto: 'always',
    autoThreshold: 0,
  },
  {
    id: 'bulwark',
    name: 'Baluarte',
    icon: 'ui/ability_bulwark',
    cooldown: 45,
    duration: 10,
    power: 0.25,
    radius: 0,
    desc: 'Escudo de 25% da vida máxima por 10 s',
    auto: 'lowHp',
    autoThreshold: 0.45,
  },
] as const satisfies readonly AbilityDef[];

export const ABILITY_COUNT = ABILITIES.length;

/** Knockback applied by the nova, in world units. */
export const NOVA_PUSH = 120;
/** Fury's damage bonus, separate from its fire-rate `power`. */
export const FURY_DAMAGE_BONUS = 0.4;
