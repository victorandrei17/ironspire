/**
 * THE balance file (SPEC §6.2). Every tunable number in the game lives here.
 *
 * A magic number in `systems/` or `render/` is a bug, not a shortcut: the whole
 * point is that balance can be retuned — or simulated by `npm run balance` —
 * without reading a line of logic.
 */
export const BAL = {
  /** Tower base stats, SPEC §4.1. */
  tower: {
    dmg: 10,
    fireRate: 1.2,
    range: 300,
    /**
     * RAISED from 100 (SPEC §4.1). With i-frames capping incoming damage at
     * `enemyDamage / iframes`, 100 HP meant roughly six seconds of contact was
     * lethal at any wave — the balance simulator put run 1 at wave 5 to 7 and
     * the real game agreed exactly. 240 gives the opening the headroom the
     * target band needs.
     */
    hpMax: 240,
    hpRegen: 0,
    critChance: 0.05,
    critMult: 2.0,
    projectiles: 1,
    pierce: 0,
    projSpeed: 900,
    pickupRadius: 130,
    goldMult: 1.0,
    /** Fan spread between simultaneous projectiles, radians (12 deg). */
    spreadRad: (12 * Math.PI) / 180,
    /** Crit chance is capped so the crit upgrade cannot trivialise DPS. */
    critChanceCap: 0.6,
    /**
     * Seconds of invulnerability after a hit. RAISED from SPEC's 0.25 for the
     * same reason as hpMax: this value alone sets the ceiling on incoming DPS
     * (damage / iframes), and 0.25 made sustained contact unsurvivable in a
     * game where the tower cannot move away from it.
     */
    iframes: 0.35,
    /** Projectile lifetime; long enough to cross the arena at base speed. */
    projLife: 1.6,
    projRadius: 6,
  },

  wave: {
    countBase: 6,
    countPerWave: 1.35,
    countCap: 90,
    hpBase: 12,
    /**
     * RETUNED from the 1.145 in SPEC §6.2, which the spec itself flags as a
     * hypothesis. `npm run balance` showed 1.145 outran the player's power
     * curve from wave one — every policy died around wave 6 to 8 and no amount
     * of good play changed it. 1.10 keeps the player just behind the curve, so
     * the wall is gradual and lands where the spec wants it (see PROGRESS).
     */
    hpGrowth: 1.11,
    /**
     * Why 1.145: combined with the player's power curve it produces a natural
     * wall around waves 25-35 on run one, which is what pushes the player into
     * the meta loop. This is a HYPOTHESIS to be retuned with telemetry after
     * M6, not a truth.
     */
    hpSoftCapWave: 60,
    // Must stay BELOW hpGrowth or the "soft cap" would accelerate difficulty.
    hpGrowthLate: 1.085,
    speedBase: 1.0,
    speedGrowth: 1.004,
    speedCap: 1.6,
    goldBase: 3,
    /**
     * Income has to grow at nearly the rate difficulty does. At the original
     * 1.09 against hpGrowth 1.145 the player fell behind from wave one and no
     * amount of good play could catch up — the simulator put every policy at
     * wave 8 regardless of skill.
     */
    /**
     * Deliberately BELOW the upgrade cost growth (1.115). That gap is what
     * creates a wall at all: with income growing as fast as cost, affordable
     * levels grow linearly forever and the player never falls behind.
     */
    goldGrowth: 1.09,
    xpBase: 2,
    xpGrowth: 1.075,
    gap: 2.0,
    /**
     * Enemy damage multiplier per wave. SPEC §6.2 had no damage curve at all,
     * which means a wave-100 grunt hits as hard as a wave-1 grunt: with 0.25 s
     * i-frames the tower's incoming DPS is then capped forever and late waves
     * stop being able to kill anyone. Growth is deliberately slower than HP so
     * the fight stays about clearing, not about tanking.
     */
    dmgGrowth: 1.055,
    /** Bonus for calling the next wave early — risk for reward (SPEC §6.1). */
    earlyCallGoldBonus: 0.15,
  },

  boss: { every: 10, hpMult: 14, goldMult: 25, xpMult: 20 },

  elite: {
    startWave: 8,
    chancePerWave: 0.02,
    chanceCap: 0.25,
    hpMult: 6,
    goldMult: 8,
    scale: 1.35,
  },

  /** XP needed for the next level: 12 * 1.18^(level-1) (SPEC §7.3). */
  progression: {
    xpBase: 12,
    xpGrowth: 1.18,
    /** Level-up hit-stop: timeScale drops to this for `slowMoSec`. */
    slowMoScale: 0.15,
    slowMoSec: 0.35,
  },

  /** Core reward at end of run: floor((waveMax / 4) ^ 1.6 * mult) (SPEC §2.3). */
  reward: { waveDivisor: 4, exponent: 1.6 },
} as const;

export type Balance = typeof BAL;
