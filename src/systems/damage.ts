import type { World } from '../entities/world.ts';
import type { RunState } from '../core/state.ts';
import type { Rng } from '../core/rng.ts';
import type { DamageQueue } from '../core/damageQueue.ts';
import { DMG_TARGET_ENEMY, DMG_FLAG } from '../core/damageQueue.ts';
import { EF } from '../data/enemyFlags.ts';
import { ENEMY_TUNING } from '../data/enemies.ts';
import { ST, TF } from '../entities/tower.ts';
import { BAL } from '../data/balance.ts';
import { angleDiff } from '../core/math.ts';
import {
  DIGIT_WHITE,
  DIGIT_CRIT,
  DIGIT_DAMAGE,
  DIGIT_HEAL,
} from '../entities/damageNumberPool.ts';
import { bus, EV } from '../core/events.ts';

/** Breathing room after a revive so the same swarm cannot instantly re-kill. */
const REVIVE_IFRAMES = 1.5;

/**
 * Damage resolution — the ONE place HP changes (SPEC §12.3 step 11).
 *
 * Everything else pushes into `world.queue`; this applies the warden's shield,
 * the armoured affix, the crit roll, lifesteal, death and drops, in that fixed
 * order. Hits queued *while* resolving (thorns, a splitter's explosion) are
 * picked up in the same pass, so a chain reaction settles within one tick.
 */
export function resolveDamage(world: World, run: RunState, rng: Rng, dt: number): void {
  const q = world.queue;
  const e = world.enemies;
  const tower = world.tower;
  const stats = tower.stats;

  // `q.length` is re-read every iteration on purpose: see the note above.
  for (let k = 0; k < q.length; k++) {
    const kind = q.targetKind[k] ?? 0;
    const flags = q.flags[k] ?? 0;
    let amount = q.amount[k] ?? 0;
    if (amount <= 0) continue;

    if (kind === DMG_TARGET_ENEMY) {
      const i = e.resolve(q.targetHandle[k] ?? -1);
      if (i < 0) continue;

      amount = applyEnemyReduction(e, i, flags, q.srcX[k] ?? 0, q.srcY[k] ?? 0, amount);
      // Talent: extra damage against bosses (SPEC §10.1, War branch).
      if ((e.flags[i] ?? 0) & EF.Boss) amount *= 1 + tower.mods.bossDamagePct;

      let crit = (flags & DMG_FLAG.PreCrit) !== 0;
      if (!crit && flags & DMG_FLAG.CanCrit) crit = rng.chance(stats.get(ST.CritChance));
      if (crit) amount *= stats.get(ST.CritMult);

      const hp = (e.hp[i] ?? 0) - amount;
      e.hp[i] = hp;
      e.flash[i] = 1;
      run.damageDealt += amount;

      world.damageNumbers.spawn(
        e.x[i] ?? 0,
        (e.y[i] ?? 0) - (e.radius[i] ?? 0),
        amount,
        crit ? DIGIT_CRIT : DIGIT_WHITE,
        crit ? 1.0 : 0.72,
      );

      if (stats.flags & TF.Lifesteal) {
        healTower(world, Math.min(amount * stats.lifestealPct, stats.lifestealCap));
      }

      if (hp <= 0) killEnemy(world, run, i, rng);
    } else {
      applyTowerDamage(q, world, run, k, flags, amount);
    }
  }
  q.clear();

  tickTowerTimers(world, dt);
}

/** Warden cone and armoured affix. Order matters: both are multiplicative. */
function applyEnemyReduction(
  e: World['enemies'],
  i: number,
  flags: number,
  srcX: number,
  srcY: number,
  amount: number,
): number {
  let out = amount;
  // The warden's shield is directional, so where the hit came from decides it.
  // Area damage ignores it — that is the counterplay the card system sells.
  if ((e.flags[i] ?? 0) & EF.Shielded && (flags & DMG_FLAG.Area) === 0) {
    const incoming = Math.atan2((e.y[i] ?? 0) - srcY, (e.x[i] ?? 0) - srcX);
    const delta = Math.abs(angleDiff(e.rot[i] ?? 0, incoming + Math.PI));
    if (delta <= ENEMY_TUNING.shieldHalfAngle) out *= 1 - ENEMY_TUNING.shieldReduction;
  }
  if ((e.flags[i] ?? 0) & EF.ArmoredAffix) out *= 1 - ENEMY_TUNING.armoredAffixReduction;
  return out;
}

function applyTowerDamage(
  q: DamageQueue,
  world: World,
  run: RunState,
  k: number,
  flags: number,
  raw: number,
): void {
  const tower = world.tower;
  const stats = tower.stats;
  if (tower.iframe > 0 || !tower.alive) return;

  // Talent: flat damage reduction, applied before the shield so the shield
  // absorbs the number the player actually takes.
  let amount = raw * (1 - tower.mods.damageReductionPct);
  if (tower.shieldHp > 0) {
    const absorbed = Math.min(tower.shieldHp, amount);
    tower.shieldHp -= absorbed;
    amount -= absorbed;
    if (amount <= 0) return;
  }

  tower.hp -= amount;
  tower.iframe = BAL.tower.iframes + tower.mods.iframeBonus;
  tower.flash = 1;
  world.damageNumbers.spawn(tower.x, tower.y - 44, amount, DIGIT_DAMAGE, 0.95);
  bus.emit(EV.TowerDamaged, amount, tower.hp, tower.hpMax);
  // Shake scales with the bite taken out of the bar, not with the raw number:
  // 12 damage means something very different at wave 3 and at wave 40.
  bus.emit(EV.Shake, Math.min(0.9, (amount / Math.max(1, tower.hpMax)) * 4));

  if (stats.flags & TF.Thorns && flags & DMG_FLAG.Melee) {
    reflectThorns(q, world, q.srcX[k] ?? 0, q.srcY[k] ?? 0, amount * stats.thornsPct);
  }

  if (tower.hp <= 0) {
    // Talent: one revive per run, at 40% health, before the run is called.
    if (tower.reviveAvailable) {
      tower.reviveAvailable = false;
      tower.hp = tower.hpMax * 0.4;
      tower.iframe = REVIVE_IFRAMES;
      bus.emit(EV.Shake, 1);
      return;
    }
    tower.hp = 0;
    run.over = true;
    bus.emit(EV.TowerDied);
  }
}

/** Regen, drain, i-frames and flashes all decay in one place. */
function tickTowerTimers(world: World, dt: number): void {
  const tower = world.tower;
  const stats = tower.stats;
  if (tower.alive) {
    const regen = stats.get(ST.HpRegen);
    if (regen > 0 && tower.hp < tower.hpMax) {
      tower.hp = Math.min(tower.hpMax, tower.hp + regen * dt);
    }
    // Overcharge's self-damage is a real cost, applied through this same path.
    // It cannot kill: a card that can lose the run on its own is a trap.
    if (stats.flags & TF.Overcharge) {
      tower.hp = Math.max(1, tower.hp - tower.hpMax * stats.overchargeDrainPct * dt);
    }
  }
  if (tower.iframe > 0) tower.iframe = Math.max(0, tower.iframe - dt);
  if (tower.flash > 0) tower.flash = Math.max(0, tower.flash - dt * 5);
  if (tower.shieldT > 0) {
    tower.shieldT = Math.max(0, tower.shieldT - dt);
    if (tower.shieldT === 0) tower.shieldHp = 0;
  }
}

function healTower(world: World, amount: number): void {
  if (amount <= 0) return;
  const t = world.tower;
  const before = t.hp;
  t.hp = Math.min(t.hpMax, t.hp + amount);
  const healed = t.hp - before;
  if (healed > 0.5) world.damageNumbers.spawn(t.x, t.y - 60, healed, DIGIT_HEAL, 0.7);
}

/** Thorns hits back through the queue, so the reflected hit follows every rule. */
function reflectThorns(
  q: DamageQueue,
  world: World,
  x: number,
  y: number,
  amount: number,
): void {
  if (amount <= 0) return;
  const e = world.enemies;
  let best = -1;
  let bestD2 = 40 * 40;
  for (let i = 0; i < e.count; i++) {
    if (e.alive[i] === 0) continue;
    const dx = (e.x[i] ?? 0) - x;
    const dy = (e.y[i] ?? 0) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best < 0) return;
  q.push(DMG_TARGET_ENEMY, e.handle(best), amount, DMG_FLAG.Area, x, y);
}

/**
 * The single death path: rewards, particles, split, events. Nothing else may
 * free an enemy that died from damage.
 */
export function killEnemy(world: World, run: RunState, i: number, rng: Rng): void {
  const e = world.enemies;
  if (e.alive[i] === 0) return;
  const x = e.x[i] ?? 0;
  const y = e.y[i] ?? 0;
  const gold = e.goldValue[i] ?? 0;
  const xp = e.xpValue[i] ?? 0;
  const flags = e.flags[i] ?? 0;
  const isBoss = (flags & EF.Boss) !== 0;

  run.kills++;
  spawnDrops(world, run, x, y, gold, xp, rng);
  spawnDeathBurst(world, x, y, rng, isBoss || (flags & EF.Elite) !== 0);

  if (flags & EF.Splits) splitOnDeath(world, i, rng);
  if (flags & EF.ExplosiveAffix) explodeOnDeath(world, x, y);

  e.free(i);
  bus.emit(EV.EnemyKilled, x, y, isBoss ? 1 : 0);
  if (isBoss) bus.emit(EV.BossKilled, x, y);
}

function spawnDrops(
  world: World,
  run: RunState,
  x: number,
  y: number,
  gold: number,
  xp: number,
  rng: Rng,
): void {
  // One pickup per drop type, not one per coin: 90 deaths in a wave would drown
  // the pickup pool and the eye alike.
  const goldTotal = gold * run.waveGoldBonus * world.tower.stats.get(ST.GoldMult);
  if (goldTotal > 0) {
    const a = rng.angle();
    const i = world.pickups.spawn(x, y, Math.cos(a) * 70, Math.sin(a) * 70, 0, goldTotal, 0);
    // Pops out at half size and grows: reads as loot being ejected rather than
    // a sprite blinking into existence.
    if (i >= 0) world.pickups.scale[i] = 0.5;
  }
  if (xp > 0) {
    const a = rng.angle();
    const i = world.pickups.spawn(x, y, Math.cos(a) * 70, Math.sin(a) * 70, 1, xp, 1);
    if (i >= 0) world.pickups.scale[i] = 0.5;
  }
}

function spawnDeathBurst(world: World, x: number, y: number, rng: Rng, big: boolean): void {
  const n = big ? 14 : 5;
  for (let k = 0; k < n; k++) {
    const a = rng.angle();
    const sp = rng.float(60, big ? 320 : 190);
    const i = world.particles.spawn(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      rng.float(0.22, 0.45),
      rng.float(0.5, 1.1),
      0,
    );
    if (i >= 0) {
      world.particles.drag[i] = 5;
      world.particles.scaleVel[i] = -1.4;
    }
  }
}

function splitOnDeath(world: World, i: number, rng: Rng): void {
  const e = world.enemies;
  const x = e.x[i] ?? 0;
  const y = e.y[i] ?? 0;
  // Children inherit a fraction of the parent's max HP; the archetype and its
  // economy come from the template the spawner keeps current for the wave.
  const hp = (e.hpMax[i] ?? 10) * ENEMY_TUNING.splitHpFraction;
  const t = world.splitTemplate;
  for (let k = 0; k < ENEMY_TUNING.splitCount; k++) {
    const a = rng.angle();
    const j = e.spawn(
      x + Math.cos(a) * 14,
      y + Math.sin(a) * 14,
      t.defIdx,
      t.defIdx,
      hp,
      t.radius,
    );
    if (j < 0) return;
    e.speed[j] = t.speed;
    e.dmg[j] = t.dmg;
    e.attackInterval[j] = t.attackInterval;
    e.flags[j] = t.flags;
    e.goldValue[j] = t.gold;
    e.xpValue[j] = t.xp;
  }
}

/** Explosive elite affix: an area hit on the tower if it died close enough. */
function explodeOnDeath(world: World, x: number, y: number): void {
  const t = world.tower;
  const dx = t.x - x;
  const dy = t.y - y;
  const r = ENEMY_TUNING.explosiveAffixRadius;
  if (dx * dx + dy * dy > r * r) return;
  world.queue.push(1, 0, ENEMY_TUNING.explosiveAffixDamage, DMG_FLAG.Area, x, y);
}
