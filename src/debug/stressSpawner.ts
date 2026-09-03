import type { World } from '../entities/world.ts';
import { ENEMY_LIST } from '../data/enemies.ts';
import { BAL } from '../data/balance.ts';
import type { Rng } from '../core/rng.ts';
import { R_SPAWN, TOWER_X, TOWER_Y } from '../core/constants.ts';

/**
 * Fills the arena to capacity for the M2 load check (SPEC §16.3: 250 enemies at
 * 60 FPS). Not gameplay — the real spawner arrives with waves in M4.
 */
export function stressFill(world: World, target: number, rng: Rng, wave = 10): void {
  const hp = BAL.wave.hpBase * Math.pow(BAL.wave.hpGrowth, wave - 1);
  const speedMul = Math.min(BAL.wave.speedCap, Math.pow(BAL.wave.speedGrowth, wave - 1));
  while (world.enemies.liveCount < target) {
    const defIdx = rng.pickIndex(ENEMY_LIST.length);
    const def = ENEMY_LIST[defIdx];
    if (def === undefined) break;
    const a = rng.angle();
    // Spread the ring a little so the spawn does not read as a perfect circle.
    const r = R_SPAWN * rng.float(0.75, 1.05);
    const i = world.enemies.spawn(
      TOWER_X + Math.cos(a) * r,
      TOWER_Y + Math.sin(a) * r,
      defIdx,
      defIdx,
      hp * def.hpMul,
      def.radius,
    );
    if (i < 0) break;
    world.enemies.applyArchetype(i, def, speedMul);
    world.enemies.goldValue[i] =
      BAL.wave.goldBase * Math.pow(BAL.wave.goldGrowth, wave - 1) * def.goldMul;
    world.enemies.xpValue[i] =
      BAL.wave.xpBase * Math.pow(BAL.wave.xpGrowth, wave - 1) * def.xpMul;
  }
}
