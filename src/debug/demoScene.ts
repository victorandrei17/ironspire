import { makeSpriteLayer, type RenderWorld } from '../render/renderWorld.ts';
import type { SpriteKey } from '../render/spriteKeys.gen.ts';
import { ENEMY_SPRITE_IDS, BOSS_SPRITE_IDS } from '../render/spriteKeys.manual.ts';
import { TOWER_X, TOWER_Y, VW } from '../core/constants.ts';

/**
 * M1 acceptance scene: every placeholder on screen at once, so the archetypes
 * can be eyeballed for distinct silhouettes (pillar P5). Replaced by the real
 * pools in M2.
 */
export function buildDemoWorld(): RenderWorld {
  const keys: SpriteKey[] = [];
  for (const id of ENEMY_SPRITE_IDS) keys.push(`enemy/${id}/walk_00`);
  for (const id of BOSS_SPRITE_IDS) keys.push(`boss/${id}/walk_00`);

  const enemies = makeSpriteLayer(32, keys);
  const perRow = 4;
  for (let i = 0; i < keys.length; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 110 + col * ((VW - 220) / (perRow - 1));
    const y = 200 + row * 130;
    enemies.x[i] = x;
    enemies.y[i] = y;
    enemies.prevX[i] = x;
    enemies.prevY[i] = y;
    enemies.spriteIdx[i] = i;
    enemies.alive[i] = 1;
    // Bosses are drawn at their own grid size already; scale the row down so
    // the demo fits, without touching the sprite contract.
    enemies.scale[i] = i >= ENEMY_SPRITE_IDS.length ? 0.42 : 1;
  }
  enemies.count = keys.length;

  const projKeys: SpriteKey[] = ['proj/bolt', 'proj/enemy_bolt', 'proj/orb'];
  const projectiles = makeSpriteLayer(8, projKeys);
  for (let i = 0; i < projKeys.length; i++) {
    const x = 220 + i * 140;
    const y = 900;
    projectiles.x[i] = x;
    projectiles.y[i] = y;
    projectiles.prevX[i] = x;
    projectiles.prevY[i] = y;
    projectiles.spriteIdx[i] = i;
    projectiles.alive[i] = 1;
    projectiles.scale[i] = 2;
  }
  projectiles.count = projKeys.length;

  const pickupKeys: SpriteKey[] = ['pickup/gold', 'pickup/xp'];
  const pickups = makeSpriteLayer(8, pickupKeys);
  for (let i = 0; i < pickupKeys.length; i++) {
    const x = 300 + i * 120;
    const y = 980;
    pickups.x[i] = x;
    pickups.y[i] = y;
    pickups.prevX[i] = x;
    pickups.prevY[i] = y;
    pickups.spriteIdx[i] = i;
    pickups.alive[i] = 1;
    pickups.scale[i] = 2;
  }
  pickups.count = pickupKeys.length;

  const particles = makeSpriteLayer(8, ['fx/spark', 'fx/ring', 'fx/burst'] as SpriteKey[]);

  return {
    enemies,
    projectiles,
    pickups,
    particles,
    tower: {
      x: TOWER_X,
      y: TOWER_Y,
      aimRot: 0,
      hp: 100,
      hpMax: 100,
      range: 300,
      flash: 0,
      shieldT: 0,
    },
    shakeX: 0,
    shakeY: 0,
    showRange: true,
  };
}

/** Spins the demo so rotation and interpolation can be eyeballed. */
export function animateDemoWorld(world: RenderWorld, t: number): void {
  world.tower.aimRot = t * 0.8;
  const e = world.enemies;
  for (let i = 0; i < e.count; i++) {
    e.prevX[i] = e.x[i] ?? 0;
    e.prevY[i] = e.y[i] ?? 0;
    e.rot[i] = Math.sin(t * 0.6 + i) * 0.35;
    e.flash[i] = i === Math.floor(t * 2) % e.count ? 0.8 : 0;
  }
  const p = world.projectiles;
  for (let i = 0; i < p.count; i++) p.rot[i] = t * 3;
}
