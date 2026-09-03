import { DamageQueue } from '../core/damageQueue.ts';
import { EnemyPool } from './enemyPool.ts';
import { HazardPool } from './hazardPool.ts';
import { ProjectilePool } from './projectilePool.ts';
import { ParticlePool } from './particlePool.ts';
import { PickupPool } from './pickupPool.ts';
import { DamageNumberPool } from './damageNumberPool.ts';
import { Tower } from './tower.ts';
import { SpatialHash } from '../core/spatialHash.ts';
import { ENEMY_SPRITE_KEYS } from '../data/enemies.ts';
import { BOSSES } from '../data/bosses.ts';
import { R_DESPAWN, TOWER_X, TOWER_Y, ENEMY_CAP } from '../core/constants.ts';
import type { SpriteKey } from '../render/spriteKeys.gen.ts';

const PROJ_KEYS: readonly SpriteKey[] = ['proj/bolt', 'proj/enemy_bolt', 'proj/orb'];
export const PROJ_SPRITE_BOLT = 0;
export const PROJ_SPRITE_ENEMY = 1;
export const PROJ_SPRITE_ORB = 2;

const PICKUP_KEYS: readonly SpriteKey[] = ['pickup/gold', 'pickup/xp'];

const PARTICLE_KEYS: readonly SpriteKey[] = ['fx/spark', 'fx/ring', 'fx/burst', 'fx/smoke'];
export const FX_SPARK = 0;
export const FX_RING = 1;
export const FX_BURST = 2;
export const FX_SMOKE = 3;

/**
 * Everything that exists in the arena. One object, allocated once at boot and
 * reset between runs — never rebuilt (SPEC §12.6: a single serializable state
 * at the root, no module-level game state).
 */
export class World {
  readonly enemies = new EnemyPool();
  readonly projectiles = new ProjectilePool();
  readonly particles = new ParticlePool();
  readonly pickups = new PickupPool();
  readonly damageNumbers = new DamageNumberPool();
  /** Boss telegraphs and ground hazards (SPEC §5.2). */
  readonly hazards = new HazardPool();
  readonly tower = new Tower();

  /**
   * The single damage path (SPEC §12.3). It lives on the world so every system
   * reaches the same queue and none of them is tempted to touch HP directly.
   */
  readonly queue = new DamageQueue();

  /**
   * What a splitter leaves behind when it dies. The spawner keeps this current
   * for the wave, so the death path never has to recompute wave economy.
   */
  readonly splitTemplate = {
    defIdx: 0,
    radius: 10,
    speed: 80,
    dmg: 2,
    attackInterval: 0.7,
    flags: 0,
    gold: 0,
    xp: 0,
  };

  /**
   * The grid must cover the despawn ring, not just the visible arena: enemies
   * live outside the screen from spawn until they walk in.
   */
  readonly hash: SpatialHash;

  constructor() {
    const pad = R_DESPAWN + 80;
    this.hash = new SpatialHash(
      TOWER_X - pad,
      TOWER_Y - pad,
      pad * 2,
      pad * 2,
      ENEMY_CAP,
    );
    // Archetype sprites first, boss sprites appended: `spriteIdx` for a boss is
    // ENEMY_LIST.length + bossIdx, which is what the spawner writes.
    this.enemies.keys = [...ENEMY_SPRITE_KEYS, ...BOSSES.map((b) => b.sprite)];
    this.projectiles.keys = PROJ_KEYS;
    this.pickups.keys = PICKUP_KEYS;
    this.particles.keys = PARTICLE_KEYS;
    this.tower.reset(TOWER_X, TOWER_Y);
  }

  /** Clears the arena for a new run. Keeps every allocation. */
  reset(): void {
    this.enemies.reset();
    this.projectiles.reset();
    this.particles.reset();
    this.pickups.reset();
    this.damageNumbers.reset();
    this.hazards.reset();
    this.tower.reset(TOWER_X, TOWER_Y);
  }

  /** Rebuilds the broad-phase grid from current enemy positions. */
  rebuildHash(): void {
    this.hash.build(this.enemies.x, this.enemies.y, this.enemies.alive, this.enemies.count);
  }
}
