#!/usr/bin/env node
/**
 * Headless balance simulation (SPEC §19.3).
 *
 * Balance by simulation, not by feel. This runs the real curves and the real
 * upgrade costs against three player policies and reports the wave each one
 * reaches, so a change to BAL can be judged before anyone plays it.
 *
 * It deliberately models the ECONOMY, not the arena: the question a designer
 * asks of this tool is "does the player's power curve keep up with the wave
 * curve", and simulating 400 steering agents would add noise, not accuracy.
 * Combat resolution is reduced to effective DPS against wave HP.
 *
 * Usage:
 *   node tools/sim-balance.mjs [--runs=200] [--maxWave=200] [--json]
 *   node tools/sim-balance.mjs --check   # CI gate on the M6 target band
 */
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : Number(hit.split('=')[1]);
};
const RUNS = flag('runs', 200);
const MAX_WAVE = flag('maxWave', 200);
const AS_JSON = args.includes('--json');
const CHECK = args.includes('--check');

// --- Load the real tables from TypeScript source ----------------------------
// Parsing beats a build step here: the tool must never be able to drift from
// the data it is meant to validate, and it must run with no bundler.

function readTs(path) {
  return readFileSync(path, 'utf8');
}

/** Extracts a numeric field from a `key: value,` line inside a source file. */
function numField(src, key) {
  const m = new RegExp(`\\b${key}\\s*:\\s*(-?[0-9.]+)`).exec(src);
  if (m === null) throw new Error(`sim-balance: could not read ${key} from balance.ts`);
  return Number(m[1]);
}

const balanceSrc = readTs('src/data/balance.ts');
const upgradesSrc = readTs('src/data/upgrades.ts');

const BAL = {
  countBase: numField(balanceSrc, 'countBase'),
  countPerWave: numField(balanceSrc, 'countPerWave'),
  countCap: numField(balanceSrc, 'countCap'),
  hpBase: numField(balanceSrc, 'hpBase'),
  hpGrowth: numField(balanceSrc, 'hpGrowth'),
  hpSoftCapWave: numField(balanceSrc, 'hpSoftCapWave'),
  hpGrowthLate: numField(balanceSrc, 'hpGrowthLate'),
  goldBase: numField(balanceSrc, 'goldBase'),
  goldGrowth: numField(balanceSrc, 'goldGrowth'),
  gap: numField(balanceSrc, 'gap'),
  dmgGrowth: numField(balanceSrc, 'dmgGrowth'),
  bossEvery: numField(balanceSrc, 'every'),
  bossHpMult: numField(balanceSrc, 'hpMult'),
  bossHpMultGrowth: numField(balanceSrc, 'hpMultGrowth'),
  bossGoldMult: numField(balanceSrc, 'goldMult'),
  towerDmg: numField(balanceSrc, 'dmg'),
  towerRate: numField(balanceSrc, 'fireRate'),
  towerHp: numField(balanceSrc, 'hpMax'),
  iframes: numField(balanceSrc, 'iframes'),
  critChance: numField(balanceSrc, 'critChance'),
  critMult: numField(balanceSrc, 'critMult'),
  cardEveryWaves: numField(balanceSrc, 'cardEveryWaves'),
  startGold: numField(balanceSrc, 'startGold'),
};

/** Upgrade table, parsed from the same source the game ships. */
const UPGRADES = [...upgradesSrc.matchAll(
  /id:\s*'([a-z]+)'[\s\S]*?kind:\s*'(flat|pctOfBase|mult)'[\s\S]*?perLevel:\s*(-?[0-9.]+)[\s\S]*?costBase:\s*([0-9.]+)[\s\S]*?costGrowth:\s*([0-9.]+)[\s\S]*?maxLevel:\s*([0-9]+)/g,
)].map((m) => ({
  id: m[1],
  kind: m[2],
  perLevel: Number(m[3]),
  costBase: Number(m[4]),
  costGrowth: Number(m[5]),
  maxLevel: Number(m[6]),
}));

if (UPGRADES.length !== 8) {
  console.error(`sim-balance: parsed ${UPGRADES.length} upgrades, expected 8. Table changed?`);
  process.exit(2);
}

// --- Curves (mirror of src/data/waves.ts) ------------------------------------

const enemyCount = (w) => Math.min(BAL.countCap, Math.floor(BAL.countBase + w * BAL.countPerWave));
const enemyHp = (w) =>
  w <= BAL.hpSoftCapWave
    ? BAL.hpBase * BAL.hpGrowth ** (w - 1)
    : BAL.hpBase * BAL.hpGrowth ** (BAL.hpSoftCapWave - 1) * BAL.hpGrowthLate ** (w - BAL.hpSoftCapWave);
const goldDrop = (w) => BAL.goldBase * BAL.goldGrowth ** (w - 1);
const isBossWave = (w) => w % BAL.bossEvery === 0;
/** Mirror of `bossHpMult` in src/data/waves.ts. */
const bossHpMult = (w) =>
  BAL.bossHpMult * BAL.bossHpMultGrowth ** (Math.max(1, Math.floor(w / BAL.bossEvery)) - 1);

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Player policies ---------------------------------------------------------

/** Spend everything on damage. The naive first-run player. */
function policyDamage() {
  return 0;
}

/** Round-robin across every upgrade. The "spread it around" player. */
function policySpread(state) {
  return state.purchases % UPGRADES.length;
}

/**
 * Greedy: buy whichever upgrade gives the most effective DPS (or survival when
 * health is the binding constraint) per gold. The optimiser.
 */
function policyGreedy(state) {
  let best = 0;
  let bestValue = -Infinity;
  // Only defend when death is the binding constraint; otherwise DPS shortens
  // every wave, which reduces damage taken more than any HP purchase would.
  const survivalPressure = state.hp / state.hpMax < 0.35;
  for (let i = 0; i < UPGRADES.length; i++) {
    const u = UPGRADES[i];
    if (u.maxLevel > 0 && state.levels[i] >= u.maxLevel) continue;
    const cost = upgradeCost(u, state.levels[i]);
    const gain = marginalValue(state, i, survivalPressure);
    const value = gain / cost;
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

/**
 * Damage first, but buy VIDA when the tower is hurt. The ordinary player.
 *
 * This is the representative policy, and it replaced 'tudo em dano' when cards
 * stopped arriving every level. That policy never buys defence at all; it used
 * to survive anyway because a card every level handed it HP for free, so it
 * silently stood in for a normal player. With cards on a slow cadence it models
 * only a pure glass cannon, which no real first-run player is — it stays in the
 * report as the floor, but the band is measured against this.
 */
function policyBeginner(state) {
  const hpIdx = UPGRADES.findIndex((u) => u.id === 'hp');
  if (state.hp / state.hpMax < 0.6 && hpIdx >= 0) return hpIdx;
  return 0;
}

const POLICIES = [
  { name: 'iniciante', pick: policyBeginner },
  { name: 'tudo em dano', pick: policyDamage },
  { name: 'espalhado', pick: policySpread },
  { name: 'guloso', pick: policyGreedy },
];

// --- Model -------------------------------------------------------------------

function upgradeCost(u, level) {
  return Math.floor(u.costBase * u.costGrowth ** level);
}

function makeState() {
  return {
    levels: new Array(UPGRADES.length).fill(0),
    gold: 0,
    level: 1,
    hp: BAL.towerHp,
    hpMax: BAL.towerHp,
    purchases: 0,
    cardDmgPct: 0,
    cardRatePct: 0,
    cardHpPct: 0,
    metaDmgMul: 1,
    metaHpMul: 1,
  };
}

/** Additive contribution (flat or percent-of-base) of upgrade `id`. */
function addOf(state, id) {
  const i = UPGRADES.findIndex((u) => u.id === id);
  const u = UPGRADES[i];
  if (u.kind === 'mult') return 0;
  return u.perLevel * (state.levels[i] ?? 0);
}

/** Compounding contribution of upgrade `id`, as a multiplier. */
function mulOf(state, id) {
  const i = UPGRADES.findIndex((u) => u.id === id);
  const u = UPGRADES[i];
  if (u.kind !== 'mult') return 1;
  return u.perLevel ** (state.levels[i] ?? 0);
}

function dps(state) {
  const dmg = BAL.towerDmg * (1 + state.cardDmgPct) * mulOf(state, 'damage') * state.metaDmgMul;
  const rate = BAL.towerRate * (1 + state.cardRatePct) * mulOf(state, 'rate');
  const crit = Math.min(0.6, BAL.critChance + addOf(state, 'critchance'));
  const critMul = BAL.critMult * mulOf(state, 'critdmg');
  return dmg * rate * (1 + crit * (critMul - 1));
}

/** Gold multiplier: base 1 plus the OURO upgrade's additive levels. */
function goldMul(state) {
  return 1 + addOf(state, 'gold');
}

function maxHp(state) {
  return (
    (BAL.towerHp * (1 + state.cardHpPct) * mulOf(state, 'hp') + addOf(state, 'hp')) *
    state.metaHpMul
  );
}

/** Rough effective-DPS (or effective-HP) delta from one more level of `i`. */
function marginalValue(state, i, survivalPressure) {
  // OURO buys nothing this instant; it buys everything later. Valued as the
  // extra income it produces, converted at the DPS the player already owns —
  // without this the greedy policy never buys income and the sim would report a
  // wall the real optimiser does not hit.
  if (UPGRADES[i].id === 'gold') {
    const extra = UPGRADES[i].perLevel / goldMul(state);
    return Math.max(1e-9, (survivalPressure ? maxHp(state) : dps(state)) * extra * 0.6);
  }
  const before = survivalPressure ? maxHp(state) + addOf(state, 'regen') * 20 : dps(state);
  state.levels[i]++;
  const after = survivalPressure ? maxHp(state) + addOf(state, 'regen') * 20 : dps(state);
  state.levels[i]--;
  return Math.max(1e-9, after - before);
}

/**
 * Fights one wave, stepping through it in time.
 *
 * A closed-form "clear time vs walk-in time" comparison produces a knife edge:
 * either the player clears fast enough to take literally zero damage forever,
 * or dies almost immediately. Real waves arrive in groups spread over seconds,
 * so some enemies always get through while others are still being killed.
 * Stepping through the wave reproduces that and gives a smooth curve to tune.
 */
function fightWave(state, wave, count, hp, bossHp) {
  const STEP = 0.25;
  const dmgPerSec = dps(state);
  const incomingPerContact = ENEMY_DPS_BASE * BAL.dmgGrowth ** (wave - 1);
  const regen = addOf(state, 'regen');
  const groups = 3;
  const groupDelay = 3;

  // Bodies are tracked in three bands, because the two crossings matter
  // separately: the tower shoots everything inside the range ring, and takes
  // damage only from what has reached its wall. An earlier version collapsed
  // the two into one arrival and read ~50% more waves than the real build.
  let spawned = 0;
  let walking = 0;
  let inRange = 0;
  let contact = 0;
  const entering = [];
  const reaching = [];

  // The boss is its own body: it carries most of a boss wave's HP, so folding
  // it into the swarm made the wave finishable by killing the escort alone.
  let bossLeft = bossHp;
  let bossBand = bossHp > 0 ? 'walking' : 'dead';
  const bossEnterAt = WALK_IN_SECONDS;
  let bossReachAt = Infinity;

  let t = 0;
  while (t < 600) {
    const dueGroups = Math.min(groups, Math.floor(t / groupDelay) + 1);
    const due = Math.round((count * dueGroups) / groups);
    if (due > spawned) {
      const n = due - spawned;
      spawned = due;
      walking += n;
      entering.push({ at: t + WALK_IN_SECONDS, n });
    }
    for (const e of entering) {
      if (e.n > 0 && t >= e.at) {
        const moved = Math.min(e.n, walking);
        walking -= moved;
        inRange += moved;
        reaching.push({ at: t + RANGE_TO_TOWER_SECONDS, n: moved });
        e.n = 0;
      }
    }
    for (const r of reaching) {
      if (r.n > 0 && t >= r.at) {
        const moved = Math.min(r.n, inRange);
        inRange -= moved;
        contact += moved;
        r.n = 0;
      }
    }
    if (bossBand === 'walking' && t >= bossEnterAt) {
      bossBand = 'inRange';
      bossReachAt = t + RANGE_TO_TOWER_SECONDS;
    } else if (bossBand === 'inRange' && t >= bossReachAt) {
      bossBand = 'contact';
    }

    // Damage out, spent on what is inside the ring, closest first.
    let budget = dmgPerSec * STEP;
    const spend = (bodies) => {
      const affordable = Math.min(bodies, budget / hp);
      budget -= affordable * hp;
      return affordable;
    };
    contact -= spend(contact);
    if (budget > 0 && bossBand === 'contact') {
      const dealt = Math.min(budget, bossLeft);
      bossLeft -= dealt;
      budget -= dealt;
      if (bossLeft <= 0) bossBand = 'dead';
    }
    inRange -= spend(inRange);
    if (budget > 0 && bossBand === 'inRange') {
      const dealt = Math.min(budget, bossLeft);
      bossLeft -= dealt;
      budget -= dealt;
      if (bossLeft <= 0) bossBand = 'dead';
    }

    if (spawned >= count && walking < 0.001 && inRange < 0.001 && contact < 0.001 && bossBand === 'dead') {
      return { survived: true, time: t };
    }

    // Damage in, capped by i-frames: contact is a switch, not a multiplier.
    if (contact > 0.5 || bossBand === 'contact') state.hp -= incomingPerContact * STEP;
    state.hpMax = maxHp(state);
    state.hp = Math.min(state.hpMax, state.hp + regen * STEP);
    if (state.hp <= 0) return { survived: false, time: t };

    t += STEP;
  }
  // A wave that cannot be cleared IS the wall, even with the tower still alive:
  // a player with enough HP and regen to outlast one contact could otherwise
  // stall forever on a wave they could never finish, and the tool would report
  // no wall at all.
  return { survived: false, time: t };
}

/** One run. Returns the wave the tower died on. */
function simulateRun(seed, meta) {
  const rng = mulberry32(seed);
  const state = makeState();
  // Meta is a MULTIPLIER, matching compounding ether and talent ranks. Modelled
  // additively it flattens out and prestige stops moving the wall, which is
  // precisely the failure this tool exists to catch.
  //
  // Applied BEFORE seeding health: setting hp from the un-multiplied max left
  // every prestiged run starting at a fraction of its own health bar.
  state.metaDmgMul = meta.dmgMul;
  state.metaHpMul = meta.hpMul;
  state.gold = BAL.startGold + meta.startGold;
  state.hpMax = maxHp(state);
  state.hp = state.hpMax;

  let totalTime = 0;

  for (let wave = 1; wave <= MAX_WAVE; wave++) {
    const count = enemyCount(wave);
    const hp = enemyHp(wave);
    const boss = isBossWave(wave);

    const outcome = fightWave(state, wave, count, hp, boss ? hp * bossHpMult(wave) : 0);
    totalTime += outcome.time + BAL.gap;
    if (!outcome.survived) {
      return { wave, time: totalTime, gold: state.gold, level: state.level };
    }

    // Rewards. Every coin lands: gold is credited on death, so unlike the
    // dropped-pickup model nothing is lost to the arena floor.
    state.gold += count * goldDrop(wave) * goldMul(state) * (boss ? BAL.bossGoldMult / 8 : 1);
    if (wave % BAL.cardEveryWaves === 0) {
      state.level++;
      // A card pick, averaged: the offer is 60% commons, so the expected pick
      // is a common-sized stat bump. Modelling exact card choice would need the
      // full offer machinery for no extra signal about the CURVE.
      const roll = rng();
      if (roll < 0.45) state.cardDmgPct += 0.18;
      else if (roll < 0.75) state.cardRatePct += 0.12;
      else state.cardHpPct += 0.15;
    }

    // Spend.
    let guard = 0;
    for (;;) {
      const idx = POLICIES_CURRENT.pick(state);
      const u = UPGRADES[idx];
      if (u.maxLevel > 0 && state.levels[idx] >= u.maxLevel) break;
      const cost = upgradeCost(u, state.levels[idx]);
      if (state.gold < cost) break;
      state.gold -= cost;
      const beforeMaxHp = maxHp(state);
      state.levels[idx]++;
      state.purchases++;
      // Buying VIDA heals by what it adds, mirroring the rule in the game.
      state.hpMax = maxHp(state);
      state.hp = Math.min(state.hpMax, state.hp + Math.max(0, state.hpMax - beforeMaxHp));
      if (++guard > 5000) break;
    }
  }
  return { wave: MAX_WAVE, time: totalTime, gold: state.gold, level: state.level };
}

/**
 * Incoming damage per second while anything is touching the tower, at wave 1.
 *
 * This is a DERIVED number, not a fitted one: i-frames cap incoming damage at
 * one hit per `iframes` seconds regardless of how many enemies are in contact,
 * so the cap is `grunt damage / iframes`. An earlier version of this tool used
 * a hand-picked 4.5 here and was consequently far too optimistic about
 * survival — the simulated player reached wave 15 while the real one died at 5.
 */
const GRUNT_DAMAGE = 4;
const MIX = 1.8;
const ENEMY_DPS_BASE = (GRUNT_DAMAGE * MIX) / numField(balanceSrc, 'iframes');

/**
 * Seconds from the spawn ring to the tower for a front-rank enemy:
 * (R_SPAWN - range) / speed, roughly (560 - 300) / 55.
 */
const WALK_IN_SECONDS = 4.7;

/**
 * Seconds from crossing the range ring to touching the tower: range / speed,
 * roughly 300 / 55. The tower shoots for this whole stretch and takes nothing.
 */
const RANGE_TO_TOWER_SECONDS = 5.5;

let POLICIES_CURRENT = POLICIES[0];

function runPolicy(policy, meta) {
  POLICIES_CURRENT = policy;
  const waves = [];
  let time = 0;
  for (let r = 0; r < RUNS; r++) {
    const out = simulateRun(0x1000 + r, meta);
    waves.push(out.wave);
    time += out.time;
  }
  waves.sort((a, b) => a - b);
  return {
    policy: policy.name,
    mean: waves.reduce((a, b) => a + b, 0) / waves.length,
    p10: waves[Math.floor(waves.length * 0.1)],
    median: waves[Math.floor(waves.length * 0.5)],
    p90: waves[Math.floor(waves.length * 0.9)],
    minutes: time / RUNS / 60,
  };
}

const SCENARIOS = [
  { name: 'run 1 (sem meta)', meta: { dmgMul: 1, hpMul: 1, startGold: 0 }, target: [12, 20] },
  {
    name: 'apos ~1h de meta',
    // Roughly what an hour of cores buys: a few ranks of the cheap War and
    // Fortress nodes, plus some starting gold from Fortune.
    meta: { dmgMul: 1.35, hpMul: 1.4, startGold: 100 },
    target: [35, 50],
  },
  {
    name: 'pos-prestigio',
    // A handful of rebirths worth of compounding ether.
    meta: { dmgMul: 3.0, hpMul: 2.5, startGold: 400 },
    target: [60, 140],
  },
];

const report = [];
for (const scenario of SCENARIOS) {
  for (const policy of POLICIES) {
    report.push({ scenario: scenario.name, target: scenario.target, ...runPolicy(policy, scenario.meta) });
  }
}

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\niron-spire · simulação de balanceamento · ${RUNS} runs por política\n`);
  let lastScenario = '';
  for (const row of report) {
    if (row.scenario !== lastScenario) {
      lastScenario = row.scenario;
      console.log(`  ${row.scenario}  (alvo: onda ${row.target[0]}–${row.target[1]})`);
    }
    console.log(
      `    ${row.policy.padEnd(14)} media ${row.mean.toFixed(1).padStart(6)}` +
        `   p10 ${String(row.p10).padStart(4)}` +
        `   mediana ${String(row.median).padStart(4)}` +
        `   p90 ${String(row.p90).padStart(4)}` +
        `   ${row.minutes.toFixed(1)} min`,
    );
  }
  console.log('');
}

if (CHECK) {
  /*
   * What the gate actually asserts, and why it is not simply "greedy is in the
   * band": the three policies BRACKET play. `espalhado` is a player who spreads
   * gold thin, `guloso` is an optimiser who plays better than almost anyone.
   * Demanding both land in one band would be demanding that skill stop
   * mattering, which is the opposite of the design.
   *
   *  1. The representative policy lands inside the scenario's band.
   *  2. No policy runs forever — a curve with no wall is a broken curve.
   *  3. Even careless play clears a few waves — the opening cannot be a wall.
   */
  const REPRESENTATIVE = 'iniciante';
  let failed = 0;

  for (const scenario of SCENARIOS) {
    const row = report.find((r) => r.scenario === scenario.name && r.policy === REPRESENTATIVE);
    if (row === undefined) continue;
    const [lo, hi] = scenario.target;
    if (row.median < lo || row.median > hi) {
      console.error(
        `FALHA: "${scenario.name}" (${REPRESENTATIVE}) mediana ${row.median}, fora de ${lo}–${hi}`,
      );
      failed++;
    }
  }

  for (const row of report) {
    if (row.median >= MAX_WAVE) {
      console.error(`FALHA: "${row.scenario}" / ${row.policy} nunca encontra a parede`);
      failed++;
    }
  }

  const opening = report.find((r) => r.scenario.startsWith('run 1') && r.policy === 'espalhado');
  if (opening !== undefined && opening.median < 5) {
    console.error(`FALHA: jogo casual morre na onda ${opening.median}; a abertura está dura demais`);
    failed++;
  }

  if (failed > 0) process.exit(1);
  console.log('Balanceamento dentro das faixas alvo.');
}

void pathToFileURL;
void policyDamage;
