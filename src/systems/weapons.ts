import type { World } from '../entities/world.ts';
import { ST, TF } from '../entities/tower.ts';
import { BAL } from '../data/balance.ts';
import { PROJ_SPRITE_BOLT } from '../entities/world.ts';
import { PF } from '../entities/projectilePool.ts';
import { bus, EV } from '../core/events.ts';
import { SFX } from '../data/audio.ts';

/**
 * Fire control (SPEC §12.3 step 7).
 *
 * The tower aims and shoots on its own — the player's skill is economic, not
 * mechanical (pillar P2). This system only turns fire rate and projectile count
 * into projectiles; what they do on impact belongs to `projectiles.ts`.
 */
export function updateWeapons(world: World, dt: number): void {
  const tower = world.tower;
  const e = world.enemies;
  const stats = tower.stats;

  if (tower.fireCd > 0) tower.fireCd -= dt;

  const i = tower.targetHandle >= 0 ? e.resolve(tower.targetHandle) : -1;
  if (i < 0) return;

  // Aim tracks the target even between shots, so the cannon reads as alive.
  const dx = (e.x[i] ?? 0) - tower.x;
  const dy = (e.y[i] ?? 0) - tower.y;
  tower.aimRot = Math.atan2(dy, dx);

  if (tower.fireCd > 0) return;

  const rate = stats.get(ST.FireRate);
  tower.fireCd += 1 / rate;
  // Guard against a huge dt (a resumed tab) queuing a burst of shots.
  if (tower.fireCd < 0) tower.fireCd = 1 / rate;

  fire(world, tower.aimRot);
}

function fire(world: World, aim: number): void {
  const tower = world.tower;
  const stats = tower.stats;
  const count = stats.get(ST.Projectiles);
  const speed = stats.get(ST.ProjSpeed);
  const pierce = stats.get(ST.Pierce);
  const damage = stats.get(ST.Dmg);
  const spread = BAL.tower.spreadRad;

  tower.shotCount++;
  // Deathmark fires on a fixed cadence; the flag rides on the projectile so
  // damage resolution stays the only place that decides what a hit does.
  const marked =
    (stats.flags & TF.Deathmark) !== 0 &&
    stats.deathmarkEvery > 0 &&
    tower.shotCount % stats.deathmarkEvery === 0;

  // Centre the fan on the aim: 3 shots at 12 deg is -12, 0, +12.
  const base = aim - ((count - 1) * spread) / 2;
  for (let k = 0; k < count; k++) {
    const a = base + k * spread;
    const muzzle = 26;
    const i = world.projectiles.spawn(
      tower.x + Math.cos(a) * muzzle,
      tower.y + Math.sin(a) * muzzle,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      damage,
      BAL.tower.projRadius,
      BAL.tower.projLife,
      PROJ_SPRITE_BOLT,
      buildFlags(stats.flags, marked),
    );
    if (i < 0) break;
    world.projectiles.pierce[i] = pierce;
    world.projectiles.chain[i] = (stats.flags & TF.Chain) !== 0 ? stats.chainJumps : 0;
  }
  bus.emit(EV.Sfx, SFX.Shoot);
}

function buildFlags(towerFlags: number, marked: boolean): number {
  let f = 0;
  if (towerFlags & TF.Explosive) f |= PF.Explosive;
  if (towerFlags & TF.Chain) f |= PF.Chaining;
  if (marked) f |= PF.Deathmarked;
  return f;
}
