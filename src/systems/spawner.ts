import type { World } from '../entities/world.ts';
import { Rng, mixSeed } from '../core/rng.ts';
import { ENEMY_LIST, ENEMY_ORDER, ENEMY_TUNING, enemyIndex } from '../data/enemies.ts';
import { EF } from '../data/enemyFlags.ts';
import { BAL } from '../data/balance.ts';
import {
  fillWeights,
  enemyCount,
  enemyHp,
  enemySpeedMul,
  goldDrop,
  xpDrop,
  eliteChance,
  isBossWave,
  PATTERN,
  PATTERN_INFO,
  PATTERN_GROUP_DELAY,
  PATTERN_WEIGHTS,
  PATTERN_START_WAVE,
  type WavePattern,
} from '../data/waves.ts';
import { R_SPAWN, ENEMY_CAP } from '../core/constants.ts';
import { bus, EV } from '../core/events.ts';

/** Room for a full wave plus the boss slot. */
const SCHEDULE_CAP = ENEMY_CAP;

const AFFIXES = [EF.ArmoredAffix, EF.SwiftAffix, EF.VampiricAffix, EF.ExplosiveAffix] as const;

/**
 * Turns a wave number into enemies (SPEC §6.1, §6.3, §6.4).
 *
 * The whole wave is rolled up front from a PRNG seeded with
 * `mixSeed(runSeed, wave)` and stored as a schedule; `update` only releases
 * entries whose time has come. Rolling ahead is what makes a wave reproducible
 * from its seed regardless of frame timing, which is the point of a
 * deterministic simulation.
 */
export class Spawner {
  private readonly weights = new Float32Array(ENEMY_ORDER.length);

  // Scheduled spawns, sorted by time because groups are built in order.
  private readonly schedDef = new Int32Array(SCHEDULE_CAP);
  private readonly schedTime = new Float32Array(SCHEDULE_CAP);
  private readonly schedAngle = new Float32Array(SCHEDULE_CAP);
  private readonly schedElite = new Uint8Array(SCHEDULE_CAP);
  private readonly schedAffix = new Uint16Array(SCHEDULE_CAP);
  private readonly schedBoss = new Uint8Array(SCHEDULE_CAP);
  private scheduled = 0;
  private cursor = 0;
  private elapsed = 0;

  // Wave-wide scalars, resolved once in beginWave.
  private wave = 0;
  private hp = 0;
  private speedMul = 1;
  private gold = 0;
  private xp = 0;

  /** Enemies this wave has released but that are still alive somewhere. */
  released = 0;
  pattern: WavePattern = PATTERN.Ring;
  /** Spawns skipped because the pool was full. Rising = the caps are wrong. */
  skipped = 0;

  /** Rolls the whole wave. `runSeed` plus the wave number decides everything. */
  beginWave(world: World, runSeed: number, wave: number): void {
    const rng = new Rng(mixSeed(runSeed, wave));
    this.scheduled = 0;
    this.cursor = 0;
    this.elapsed = 0;
    this.released = 0;

    this.pattern =
      wave < PATTERN_START_WAVE
        ? PATTERN.Ring
        : (Math.max(0, rng.weighted(PATTERN_WEIGHTS, PATTERN_WEIGHTS.length)) as WavePattern);

    const info = PATTERN_INFO[this.pattern] ?? PATTERN_INFO[0];
    const total = enemyCount(wave);
    const hp = enemyHp(wave);
    const speedMul = enemySpeedMul(wave);
    const gold = goldDrop(wave);
    const xp = xpDrop(wave);
    const elite = eliteChance(wave);

    fillWeights(this.weights, wave);

    // Group sizes: the front-loaded patterns put most of the wave in group 0.
    const groups = Math.max(1, info.groups);
    const front = info.frontLoad;
    const baseAngle = rng.angle();
    const delay = PATTERN_GROUP_DELAY[this.pattern] ?? 3;

    let placed = 0;
    for (let g = 0; g < groups && placed < total; g++) {
      const remaining = total - placed;
      let n: number;
      if (front > 0 && g === 0) n = Math.ceil(total * front);
      else n = g === groups - 1 ? remaining : Math.ceil(remaining / (groups - g));
      n = Math.min(n, remaining);

      const t = g * delay;
      // PINCER alternates between two opposite arcs; every other pattern
      // rotates its arc a little per group so waves do not stack on one line.
      const arcCenter =
        this.pattern === PATTERN.Pincer
          ? baseAngle + (g % 2) * Math.PI
          : baseAngle + g * 0.6;

      for (let k = 0; k < n && this.scheduled < SCHEDULE_CAP; k++) {
        const defIdx = rng.weighted(this.weights, this.weights.length);
        if (defIdx < 0) break;
        const i = this.scheduled++;
        this.schedDef[i] = defIdx;
        // Jitter inside the group only. Spreading it across most of the
        // group delay would push group 0 off zero and make every wave open
        // with an empty screen.
        this.schedTime[i] = t + rng.float(0, Math.min(0.45, delay * 0.35));
        this.schedAngle[i] = arcCenter + rng.float(-info.arcRad / 2, info.arcRad / 2);
        const isElite = elite > 0 && rng.chance(elite);
        this.schedElite[i] = isElite ? 1 : 0;
        this.schedAffix[i] = isElite ? (AFFIXES[rng.pickIndex(AFFIXES.length)] ?? 0) : 0;
        this.schedBoss[i] = 0;
        placed++;
      }
    }

    if (isBossWave(wave) && this.scheduled < SCHEDULE_CAP) {
      // The boss leads the wave. Its behaviour patterns arrive in M6; here it
      // is the archetype scaled by the BAL.boss block, with its own health bar.
      const i = this.scheduled++;
      this.schedDef[i] = enemyIndex('brute');
      this.schedTime[i] = 0;
      this.schedAngle[i] = baseAngle;
      this.schedElite[i] = 0;
      this.schedAffix[i] = 0;
      this.schedBoss[i] = 1;
    }

    // Keep the splitter's children consistent with this wave's economy.
    const swarm = enemyIndex('splitter') >= 0 ? enemyIndex(ENEMY_TUNING.splitInto) : 0;
    const swarmDef = ENEMY_LIST[swarm];
    if (swarmDef !== undefined) {
      world.splitTemplate.defIdx = swarm;
      world.splitTemplate.radius = swarmDef.radius;
      world.splitTemplate.speed = swarmDef.speed * speedMul;
      world.splitTemplate.flags = swarmDef.flags;
      world.splitTemplate.gold = gold * swarmDef.goldMul;
      world.splitTemplate.xp = xp * swarmDef.xpMul;
    }

    this.wave = wave;
    this.hp = hp;
    this.speedMul = speedMul;
    this.gold = gold;
    this.xp = xp;
    bus.emit(EV.WaveStart, wave, this.pattern, total);
  }

  /** Releases due spawns. Returns true once the whole wave has been released. */
  update(world: World, dt: number): boolean {
    this.elapsed += dt;
    while (this.cursor < this.scheduled && (this.schedTime[this.cursor] ?? 0) <= this.elapsed) {
      this.spawnOne(world, this.cursor);
      this.cursor++;
    }
    return this.cursor >= this.scheduled;
  }

  get allReleased(): boolean {
    return this.cursor >= this.scheduled;
  }

  private spawnOne(world: World, k: number): void {
    const defIdx = this.schedDef[k] ?? 0;
    const def = ENEMY_LIST[defIdx];
    if (def === undefined) return;

    const a = this.schedAngle[k] ?? 0;
    const x = world.tower.x + Math.cos(a) * R_SPAWN;
    const y = world.tower.y + Math.sin(a) * R_SPAWN;

    const boss = (this.schedBoss[k] ?? 0) === 1;
    const elite = (this.schedElite[k] ?? 0) === 1;

    let hp = this.hp * def.hpMul;
    let goldValue = this.gold * def.goldMul;
    let xpValue = this.xp * def.xpMul;
    let scale = def.scale;
    let flags = def.flags;

    if (boss) {
      hp *= BAL.boss.hpMult;
      goldValue *= BAL.boss.goldMult;
      xpValue *= BAL.boss.xpMult;
      scale *= 1.8;
      flags |= EF.Boss;
    } else if (elite) {
      hp *= BAL.elite.hpMult;
      goldValue *= BAL.elite.goldMult;
      xpValue *= BAL.elite.goldMult;
      scale *= BAL.elite.scale;
      flags |= EF.Elite | (this.schedAffix[k] ?? 0);
    }

    const i = world.enemies.spawn(x, y, defIdx, defIdx, hp, def.radius * scale);
    if (i < 0) {
      // Pool full: skip the spawn rather than grow mid-run (SPEC §12.4).
      this.skipped++;
      return;
    }
    const swift = (flags & EF.SwiftAffix) !== 0 ? 1.6 : 1;
    world.enemies.speed[i] = def.speed * this.speedMul * swift;
    world.enemies.flags[i] = flags;
    world.enemies.scale[i] = scale;
    world.enemies.goldValue[i] = goldValue;
    world.enemies.xpValue[i] = xpValue;
    if (boss) bus.emit(EV.BossSpawned, x, y, this.wave);
    this.released++;
  }

  reset(): void {
    this.scheduled = 0;
    this.cursor = 0;
    this.elapsed = 0;
    this.released = 0;
    this.skipped = 0;
  }
}
