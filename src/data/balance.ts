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
    hpMax: 100,
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
    /** Seconds of invulnerability after a hit, so a swarm cannot melt the tower. */
    iframes: 0.25,
    /** Projectile lifetime; long enough to cross the arena at base speed. */
    projLife: 1.6,
    projRadius: 6,
  },

  wave: {
    countBase: 6,
    countPerWave: 1.35,
    countCap: 90,
    hpBase: 12,
    hpGrowth: 1.145,
    /**
     * Why 1.145: combined with the player's power curve it produces a natural
     * wall around waves 25-35 on run one, which is what pushes the player into
     * the meta loop. This is a HYPOTHESIS to be retuned with telemetry after
     * M6, not a truth.
     */
    hpSoftCapWave: 60,
    hpGrowthLate: 1.105,
    speedBase: 1.0,
    speedGrowth: 1.004,
    speedCap: 1.6,
    goldBase: 3,
    goldGrowth: 1.09,
    xpBase: 2,
    xpGrowth: 1.075,
    gap: 2.0,
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
