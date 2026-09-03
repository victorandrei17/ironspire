/**
 * Hand-declared sprite keys (SPEC §13.4).
 *
 * This file is the single source of truth while there is no art. `pack-atlas`
 * regenerates `spriteKeys.gen.ts` as the union of *these* keys plus whatever it
 * finds in `assets/src/`, so nothing referenced here can ever stop compiling.
 *
 * Keys are template-literal types rather than a hand-typed list: 9 archetypes ×
 * 4 walk frames is 36 lines nobody will keep in sync.
 */

export const ENEMY_SPRITE_IDS = [
  'grunt',
  'runner',
  'brute',
  'swarmling',
  'spitter',
  'warden',
  'mender',
  'splitter',
  'wraith',
] as const;
export type EnemySpriteId = (typeof ENEMY_SPRITE_IDS)[number];

export const BOSS_SPRITE_IDS = ['colossus', 'hive', 'warlock'] as const;
export type BossSpriteId = (typeof BOSS_SPRITE_IDS)[number];

type WalkFrame = `walk_0${0 | 1 | 2 | 3}`;
type DeathFrame = `death_0${0 | 1 | 2 | 3 | 4}`;

export type EnemySpriteKey = `enemy/${EnemySpriteId}/${WalkFrame | DeathFrame}`;
export type BossSpriteKey = `boss/${BossSpriteId}/${WalkFrame}`;

export type TowerSpriteKey = 'tower/base' | 'tower/cannon' | 'tower/core' | 'tower/shield';

export type ProjectileSpriteKey = 'proj/bolt' | 'proj/enemy_bolt' | 'proj/orb';

export type PickupSpriteKey = 'pickup/gold' | 'pickup/xp';

export type FxSpriteKey =
  | 'fx/spark'
  | 'fx/ring'
  | 'fx/burst'
  | 'fx/smoke'
  | 'fx/telegraph_circle';

export type UiSpriteKey =
  | 'ui/up_damage'
  | 'ui/up_rate'
  | 'ui/up_range'
  | 'ui/up_hp'
  | 'ui/up_regen'
  | 'ui/up_critchance'
  | 'ui/up_critdmg'
  | 'ui/up_pickup'
  | 'ui/card_offense'
  | 'ui/card_defense'
  | 'ui/card_economy'
  | 'ui/card_utility'
  | 'ui/ability_nova'
  | 'ui/ability_fury'
  | 'ui/ability_bulwark';

export type ManualSpriteKey =
  | EnemySpriteKey
  | BossSpriteKey
  | TowerSpriteKey
  | ProjectileSpriteKey
  | PickupSpriteKey
  | FxSpriteKey
  | UiSpriteKey;

const WALK_FRAMES = ['walk_00', 'walk_01', 'walk_02', 'walk_03'] as const;
const DEATH_FRAMES = ['death_00', 'death_01', 'death_02', 'death_03', 'death_04'] as const;

/**
 * Runtime mirror of the type above, for the atlas packer and the coverage test.
 * Built with loops at module load — this never runs during a frame.
 */
export function listManualSpriteKeys(): ManualSpriteKey[] {
  const out: ManualSpriteKey[] = [];
  for (const id of ENEMY_SPRITE_IDS) {
    for (const f of WALK_FRAMES) out.push(`enemy/${id}/${f}`);
    for (const f of DEATH_FRAMES) out.push(`enemy/${id}/${f}`);
  }
  for (const id of BOSS_SPRITE_IDS) {
    for (const f of WALK_FRAMES) out.push(`boss/${id}/${f}`);
  }
  out.push('tower/base', 'tower/cannon', 'tower/core', 'tower/shield');
  out.push('proj/bolt', 'proj/enemy_bolt', 'proj/orb');
  out.push('pickup/gold', 'pickup/xp');
  out.push('fx/spark', 'fx/ring', 'fx/burst', 'fx/smoke', 'fx/telegraph_circle');
  out.push(
    'ui/up_damage',
    'ui/up_rate',
    'ui/up_range',
    'ui/up_hp',
    'ui/up_regen',
    'ui/up_critchance',
    'ui/up_critdmg',
    'ui/up_pickup',
    'ui/card_offense',
    'ui/card_defense',
    'ui/card_economy',
    'ui/card_utility',
    'ui/ability_nova',
    'ui/ability_fury',
    'ui/ability_bulwark',
  );
  return out;
}
