import type { World } from '../entities/world.ts';
import { ES, EF } from '../data/enemyFlags.ts';
import { ENEMY_TUNING } from '../data/enemies.ts';
import { DMG_TARGET_TOWER, DMG_FLAG } from '../core/damageQueue.ts';
import { PF } from '../entities/projectilePool.ts';
import { PROJ_SPRITE_ENEMY } from '../entities/world.ts';
import { R_TOWER_BODY, ENEMY_CAP } from '../core/constants.ts';

/**
 * What enemies do once they arrive: melee contact, ranged fire, and the
 * mender's heal aura (SPEC §4.3, §5.1).
 *
 * Like everything else, it only queues damage — HP belongs to damage.ts.
 */
export class EnemyCombatSystem {
  private readonly buf = new Int32Array(ENEMY_CAP);
  /** Heal aura runs at AURA_HZ, not per tick; this is its accumulator. */
  private healAcc = 0;

  update(world: World, dt: number): void {
    const e = world.enemies;

    for (let i = 0; i < e.count; i++) {
      if (e.alive[i] === 0) continue;
      const state = e.state[i] ?? ES.Seek;
      if (state !== ES.Attack && state !== ES.Shoot) continue;
      if ((e.attackCd[i] ?? 0) > 0) continue;
      if ((e.freezeT[i] ?? 0) > 0) continue;

      const dmg = e.dmg[i] ?? 0;
      // Menders deal no damage — they are a priority target, not a threat.
      if (dmg <= 0) continue;

      e.attackCd[i] = e.attackInterval[i] ?? 1;

      if (state === ES.Attack) {
        world.queue.push(
          DMG_TARGET_TOWER,
          0,
          dmg,
          DMG_FLAG.Melee,
          e.x[i] ?? 0,
          e.y[i] ?? 0,
        );
        // Vampiric affix heals the attacker; it heals off its own hit, so it is
        // applied here rather than travelling through the tower's damage path.
        if ((e.flags[i] ?? 0) & EF.VampiricAffix) {
          e.hp[i] = Math.min(
            e.hpMax[i] ?? 0,
            (e.hp[i] ?? 0) + dmg * ENEMY_TUNING.vampiricAffixHeal,
          );
        }
      } else {
        this.shoot(world, i, dmg);
      }
    }

    this.healAcc += dt;
    const period = 1 / 10;
    if (this.healAcc >= period) {
      this.updateHealAuras(world, this.healAcc);
      this.healAcc = 0;
    }
  }

  private shoot(world: World, i: number, damage: number): void {
    const e = world.enemies;
    const t = world.tower;
    const dx = t.x - (e.x[i] ?? 0);
    const dy = t.y - (e.y[i] ?? 0);
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = ENEMY_TUNING.projectileSpeed;
    world.projectiles.spawn(
      e.x[i] ?? 0,
      e.y[i] ?? 0,
      (dx / d) * speed,
      (dy / d) * speed,
      damage,
      ENEMY_TUNING.projectileRadius,
      // Enough life to cross the distance with margin, so a shot never expires
      // mid-flight just because the enemy fired from max range.
      (d / speed) * 1.5 + 0.2,
      PROJ_SPRITE_ENEMY,
      PF.Hostile,
    );
  }

  /** Menders top up wounded allies inside their radius (SPEC §5.1). */
  private updateHealAuras(world: World, dt: number): void {
    const e = world.enemies;
    const r = ENEMY_TUNING.healRadius;
    const r2 = r * r;
    for (let i = 0; i < e.count; i++) {
      if (e.alive[i] === 0) continue;
      if (((e.flags[i] ?? 0) & EF.Healer) === 0) continue;
      const hx = e.x[i] ?? 0;
      const hy = e.y[i] ?? 0;
      const n = world.hash.query(hx, hy, r, this.buf);
      for (let k = 0; k < n; k++) {
        const j = this.buf[k] ?? 0;
        if (e.alive[j] === 0 || j === i) continue;
        const hp = e.hp[j] ?? 0;
        const max = e.hpMax[j] ?? 0;
        if (hp >= max) continue;
        const dx = (e.x[j] ?? 0) - hx;
        const dy = (e.y[j] ?? 0) - hy;
        if (dx * dx + dy * dy > r2) continue;
        e.hp[j] = Math.min(max, hp + max * ENEMY_TUNING.healPctPerSec * dt);
      }
    }
  }
}

/** True when an enemy is close enough to be touching the tower body. */
export function touchingTower(world: World, i: number): boolean {
  const e = world.enemies;
  const dx = (e.x[i] ?? 0) - world.tower.x;
  const dy = (e.y[i] ?? 0) - world.tower.y;
  const r = R_TOWER_BODY + (e.radius[i] ?? 0) + ENEMY_TUNING.contactSlack;
  return dx * dx + dy * dy <= r * r;
}
