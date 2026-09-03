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
     * RETUNED twice. First from the 1.145 in SPEC §6.2 (which outran the
     * player's power curve from wave one: every policy died around wave 6 to 8
     * and no amount of good play changed it), then from 1.11 down to this when
     * XP levels went away — a card every level used to add roughly 15% power
     * per wave for free, and without it 1.11 put run one back at wave 8.
     */
    hpGrowth: 1.095,
    /** Where the late curve takes over, so waves 60+ have their own slope. */
    hpSoftCapWave: 60,
    /**
     * NOW ABOVE `hpGrowth`, which reverses the original intent, and the reason
     * is the wall itself. Income and cost are both geometric, so upgrade levels
     * grow linearly and the compounding damage upgrade makes player DPS an
     * exponential in waves. A late curve flatter than the early one therefore
     * meant no wall at all past wave 60: `npm run balance` had the optimiser
     * running to the simulation horizon and never dying. At 1.105 every policy
     * finds its wall, and the ordinary player still lands inside the SPEC band.
     */
    hpGrowthLate: 1.105,
    speedBase: 1.0,
    speedGrowth: 1.004,
    speedCap: 1.6,
    /** RAISED from 3 with the XP removal: see `run.startGold`. */
    goldBase: 7,
    /**
     * Deliberately BELOW the upgrade cost growth (1.115). That gap is what
     * creates the wall: with income growing as fast as cost, affordable levels
     * would grow without bound and the player would never fall behind.
     */
    goldGrowth: 1.09,
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

  boss: {
    every: 10,
    hpMult: 14,
    /**
     * Each boss is this much bigger than the one before, on top of the wave
     * curve. Bosses ARE the wall — a run almost always ends on one — and a flat
     * multiplier made every boss equally easy once the player was past the
     * first, so the mid game had no shape. Compounding it keeps the wall moving
     * with the player instead of being cleared once and forgotten.
     */
    hpMultGrowth: 1.22,
    goldMult: 25,
  },

  elite: {
    startWave: 8,
    chancePerWave: 0.02,
    chanceCap: 0.25,
    hpMult: 6,
    goldMult: 8,
    scale: 1.35,
  },

  progression: {
    /**
     * Waves cleared per card offer (SPEC §7.3).
     *
     * REPLACES the XP curve entirely. With every enemy in a wave dying anyway,
     * XP was a second currency that only ever measured elapsed waves — so the
     * game now measures elapsed waves directly. Cards are a light bonus on top
     * of the gold upgrades, not the main progression, which is why the cadence
     * is sparse: a run to wave 20 offers four of them.
     */
    cardEveryWaves: 5,
    /** Level-up hit-stop: timeScale drops to this for `slowMoSec`. */
    slowMoScale: 0.15,
    slowMoSec: 0.35,
  },

  run: {
    /**
     * Gold the run opens with.
     *
     * ADDED when cards stopped arriving every level: the opening used to be
     * carried by free card power in waves 1-4, and without it the player spent
     * the first three waves unable to afford anything at all. A flat purse
     * fixes exactly that window — by wave 15 it is a rounding error, so unlike
     * a bigger `goldBase` it does not inflate the late game or hand the
     * optimiser a snowball.
     */
    startGold: 160,
  },

  /** Core reward at end of run: floor((waveMax / 4) ^ 1.6 * mult) (SPEC §2.3). */
  reward: { waveDivisor: 4, exponent: 1.6 },
} as const;

export type Balance = typeof BAL;
