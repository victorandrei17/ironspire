import { BAL } from '../data/balance.ts';
import { clamp } from '../core/math.ts';

/**
 * Stat identifiers. Plain indices into parallel arrays, so a stat lookup is an
 * array read rather than a property lookup on a growing object.
 */
export const ST = {
  Dmg: 0,
  FireRate: 1,
  Range: 2,
  HpMax: 3,
  HpRegen: 4,
  CritChance: 5,
  CritMult: 6,
  Projectiles: 7,
  Pierce: 8,
  ProjSpeed: 9,
  PickupRadius: 10,
  GoldMult: 11,
} as const;

export const STAT_COUNT = 12;

/** Behaviour flags set by cards; systems read them, data never runs logic. */
export const TF = {
  SlowAura: 1 << 0,
  Thorns: 1 << 1,
  Lifesteal: 1 << 2,
  Chain: 1 << 3,
  Orbital: 1 << 4,
  Explosive: 1 << 5,
  FrostNova: 1 << 6,
  Overcharge: 1 << 7,
  Deathmark: 1 << 8,
} as const;

const BASE = new Float32Array(STAT_COUNT);
BASE[ST.Dmg] = BAL.tower.dmg;
BASE[ST.FireRate] = BAL.tower.fireRate;
BASE[ST.Range] = BAL.tower.range;
BASE[ST.HpMax] = BAL.tower.hpMax;
BASE[ST.HpRegen] = BAL.tower.hpRegen;
BASE[ST.CritChance] = BAL.tower.critChance;
BASE[ST.CritMult] = BAL.tower.critMult;
BASE[ST.Projectiles] = BAL.tower.projectiles;
BASE[ST.Pierce] = BAL.tower.pierce;
BASE[ST.ProjSpeed] = BAL.tower.projSpeed;
BASE[ST.PickupRadius] = BAL.tower.pickupRadius;
BASE[ST.GoldMult] = BAL.tower.goldMult;

/**
 * The tower's stats, in layers (SPEC §4.1):
 *
 *   final = (base + flatMeta + flatRun + flatCard)
 *         * (1 + pctMeta + pctRun + pctCard)
 *         * prodMult
 *
 * Percentages ADD with each other; rare-card multipliers MULTIPLY. That split
 * is what keeps the curve predictable instead of exploding when two good cards
 * meet.
 *
 * Recomputed only when something changes — a per-frame recompute of twelve
 * stats is pure waste when they change a handful of times per wave.
 */
export class TowerStats {
  readonly flatMeta = new Float32Array(STAT_COUNT);
  readonly flatRun = new Float32Array(STAT_COUNT);
  readonly flatCard = new Float32Array(STAT_COUNT);
  readonly pctMeta = new Float32Array(STAT_COUNT);
  readonly pctRun = new Float32Array(STAT_COUNT);
  readonly pctCard = new Float32Array(STAT_COUNT);
  readonly prodMult = new Float32Array(STAT_COUNT).fill(1);

  private readonly cache = new Float32Array(STAT_COUNT);
  private dirty = true;

  /** Card behaviour flags (TF.*). */
  flags = 0;

  /** Extra tunables cards write directly; systems read, never guess. */
  slowAuraRadius = 0;
  slowAuraMul = 1;
  thornsPct = 0;
  lifestealPct = 0;
  lifestealCap = 0;
  chainJumps = 0;
  chainRadius = 0;
  chainFalloff = 1;
  orbitalCount = 0;
  orbitalRadius = 0;
  explosiveRadius = 0;
  explosivePct = 0;
  frostNovaCd = 0;
  frostNovaRadius = 0;
  frostNovaFreeze = 0;
  overchargeDrainPct = 0;
  deathmarkEvery = 0;
  deathmarkThreshold = 0;
  deathmarkBossMult = 1;

  /** Call after mutating any layer. Cheap: it only sets a flag. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Wipes every run-scoped layer, keeping meta (talent) bonuses. */
  resetRun(): void {
    this.flatRun.fill(0);
    this.flatCard.fill(0);
    this.pctRun.fill(0);
    this.pctCard.fill(0);
    this.prodMult.fill(1);
    this.flags = 0;
    this.slowAuraRadius = 0;
    this.slowAuraMul = 1;
    this.thornsPct = 0;
    this.lifestealPct = 0;
    this.lifestealCap = 0;
    this.chainJumps = 0;
    this.chainRadius = 0;
    this.chainFalloff = 1;
    this.orbitalCount = 0;
    this.orbitalRadius = 0;
    this.explosiveRadius = 0;
    this.explosivePct = 0;
    this.frostNovaCd = 0;
    this.frostNovaRadius = 0;
    this.frostNovaFreeze = 0;
    this.overchargeDrainPct = 0;
    this.deathmarkEvery = 0;
    this.deathmarkThreshold = 0;
    this.deathmarkBossMult = 1;
    this.dirty = true;
  }

  /** Resolved value of one stat. */
  get(stat: number): number {
    if (this.dirty) this.recompute();
    return this.cache[stat] ?? 0;
  }

  base(stat: number): number {
    return BASE[stat] ?? 0;
  }

  private recompute(): void {
    for (let s = 0; s < STAT_COUNT; s++) {
      const flat =
        (BASE[s] ?? 0) + (this.flatMeta[s] ?? 0) + (this.flatRun[s] ?? 0) + (this.flatCard[s] ?? 0);
      const pct = 1 + (this.pctMeta[s] ?? 0) + (this.pctRun[s] ?? 0) + (this.pctCard[s] ?? 0);
      this.cache[s] = flat * pct * (this.prodMult[s] ?? 1);
    }
    // Caps are part of the stat contract, not of whoever reads the stat.
    this.cache[ST.CritChance] = clamp(this.cache[ST.CritChance] ?? 0, 0, BAL.tower.critChanceCap);
    this.cache[ST.Projectiles] = Math.max(1, Math.round(this.cache[ST.Projectiles] ?? 1));
    this.cache[ST.Pierce] = Math.max(0, Math.floor(this.cache[ST.Pierce] ?? 0));
    this.cache[ST.HpMax] = Math.max(1, this.cache[ST.HpMax] ?? 1);
    this.cache[ST.FireRate] = Math.max(0.05, this.cache[ST.FireRate] ?? 0.05);
    this.dirty = false;
  }
}

/** Live per-run tower state: position, HP, timers. Stats live in TowerStats. */
export class Tower {
  x = 0;
  y = 0;
  hp = 0;
  aimRot = 0;
  /** Seconds until the next shot. */
  fireCd = 0;
  /** Remaining invulnerability, seconds. */
  iframe = 0;
  /** 0..1 damage flash for the renderer. */
  flash = 0;
  shieldT = 0;
  shieldHp = 0;
  /** Handle of the current target, or -1. */
  targetHandle = -1;
  /** Shots fired this run — the deathmark card counts them. */
  shotCount = 0;

  readonly stats = new TowerStats();

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.stats.resetRun();
    this.hp = this.stats.get(ST.HpMax);
    this.aimRot = -Math.PI / 2;
    this.fireCd = 0;
    this.iframe = 0;
    this.flash = 0;
    this.shieldT = 0;
    this.shieldHp = 0;
    this.targetHandle = -1;
    this.shotCount = 0;
  }

  get hpMax(): number {
    return this.stats.get(ST.HpMax);
  }

  get alive(): boolean {
    return this.hp > 0;
  }
}
