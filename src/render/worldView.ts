import type { World } from '../entities/world.ts';
import type { RenderWorld } from './renderWorld.ts';
import { ST } from '../entities/tower.ts';

/**
 * Adapts the live World into the read-only shape the renderer consumes.
 *
 * Built once and mutated in place: the pools are referenced, not copied, so
 * this costs nothing per frame and keeps `render/` from reaching into pool
 * internals it has no business knowing about.
 */
export function createWorldView(world: World): RenderWorld {
  return {
    enemies: world.enemies,
    projectiles: world.projectiles,
    pickups: world.pickups,
    particles: world.particles,
    tower: {
      x: world.tower.x,
      y: world.tower.y,
      aimRot: world.tower.aimRot,
      hp: world.tower.hp,
      hpMax: world.tower.hpMax,
      range: world.tower.stats.get(ST.Range),
      flash: world.tower.flash,
      shieldT: world.tower.shieldT,
    },
    shakeX: 0,
    shakeY: 0,
    showRange: true,
  };
}

/** Refreshes the scalar fields. Called once per frame, before render. */
export function syncWorldView(view: RenderWorld, world: World, shakeX: number, shakeY: number): void {
  const t = view.tower;
  t.x = world.tower.x;
  t.y = world.tower.y;
  t.aimRot = world.tower.aimRot;
  t.hp = world.tower.hp;
  t.hpMax = world.tower.hpMax;
  t.range = world.tower.stats.get(ST.Range);
  t.flash = world.tower.flash;
  t.shieldT = world.tower.shieldT;
  view.shakeX = shakeX;
  view.shakeY = shakeY;
}
