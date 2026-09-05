import { describe, it, expect } from 'vitest';
import { World } from '../../src/entities/world.ts';
import { RunState } from '../../src/core/state.ts';
import { Spawner } from '../../src/systems/spawner.ts';
import { WaveSystem, WAVE_PHASE } from '../../src/systems/waves.ts';
import { UPGRADE_COUNT } from '../../src/data/upgrades.ts';
import { CARD_COUNT } from '../../src/data/cards.ts';
import { BAL } from '../../src/data/balance.ts';
import { enemyCount, isBossWave, spawnWindow } from '../../src/data/waves.ts';
import { EF } from '../../src/data/enemyFlags.ts';
import { FIXED_DT, R_SPAWN } from '../../src/core/constants.ts';
import {
  updateProgression,
  wavesToNextCard,
  coresForRun,
} from '../../src/systems/progression.ts';

function setup(): { world: World; run: RunState; spawner: Spawner; waves: WaveSystem } {
  const world = new World();
  const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
  run.reset(12345, BAL.progression.cardEveryWaves, 1);
  const spawner = new Spawner();
  const waves = new WaveSystem();
  waves.reset();
  return { world, run, spawner, waves };
}

function tick(
  s: ReturnType<typeof setup>,
  seconds: number,
  clearEnemies = false,
): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let t = 0; t < steps; t++) {
    s.waves.update(s.world, s.run, s.spawner, FIXED_DT);
    if (clearEnemies) s.world.enemies.reset();
  }
}

/** Runs until the current wave ends, killing everything as it spawns. */
function tickUntilGap(s: ReturnType<typeof setup>, maxSeconds = 120): void {
  const steps = Math.round(maxSeconds / FIXED_DT);
  for (let t = 0; t < steps; t++) {
    s.waves.update(s.world, s.run, s.spawner, FIXED_DT);
    s.world.enemies.reset();
    if (s.waves.phase === WAVE_PHASE.Gap) return;
  }
}

describe('wave pacing (SPEC §6.1)', () => {
  it('waits out the gap, then starts wave 1', () => {
    const s = setup();
    expect(s.waves.phase).toBe(WAVE_PHASE.Gap);
    expect(s.run.wave).toBe(0);
    tick(s, BAL.wave.gap + 0.1);
    expect(s.waves.phase).toBe(WAVE_PHASE.Active);
    expect(s.run.wave).toBe(1);
  });

  it('releases the whole wave and no more', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.1);
    tick(s, 40);
    expect(s.spawner.allReleased).toBe(true);
    // Splitters can add children, so released is the floor, not the ceiling.
    expect(s.spawner.released).toBeGreaterThanOrEqual(enemyCount(1));
  });

  it('ends the wave only once the arena is clear', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.1);
    tick(s, 40);
    expect(s.waves.phase).toBe(WAVE_PHASE.Active); // enemies still alive
    s.world.enemies.reset();
    tick(s, 0.1);
    expect(s.waves.phase).toBe(WAVE_PHASE.Gap);
  });

  it('calling the next wave early grants the gold bonus', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.1);
    tickUntilGap(s);
    expect(s.waves.canCallEarly).toBe(true);
    expect(s.waves.callEarly(s.world, s.run, s.spawner)).toBe(true);
    expect(s.run.wave).toBe(2);
    expect(s.run.waveGoldBonus).toBeCloseTo(1 + BAL.wave.earlyCallGoldBonus);
  });

  it('the bonus does not carry into the following wave', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.1);
    tickUntilGap(s);
    s.waves.callEarly(s.world, s.run, s.spawner);
    expect(s.run.waveGoldBonus).toBeGreaterThan(1);
    tickUntilGap(s);
    expect(s.run.waveGoldBonus).toBe(1);
  });

  it('cannot be called in the opening of a wave', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.1);
    expect(s.waves.earlyFill).toBeLessThan(1);
    expect(s.waves.canCallEarly).toBe(false);
    expect(s.waves.callEarly(s.world, s.run, s.spawner)).toBe(false);
  });

  it('the last monster of a wave spawns exactly at the end of its window', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.01);
    const window = spawnWindow(s.run.wave, s.spawner.pattern);
    expect(s.spawner.scheduleDuration).toBeCloseTo(window, 5);

    // Nothing is left to release once the window has passed...
    tick(s, window + 0.05);
    expect(s.spawner.allReleased).toBe(true);
    // ...and it was not all dumped early either.
    const s2 = setup();
    tick(s2, BAL.wave.gap + 0.01);
    tick(s2, window * 0.5);
    expect(s2.spawner.allReleased).toBe(false);
  });

  it('the timer fills over `earlyCallAt` of the schedule, then unlocks', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.01);
    const unlockAt = s.spawner.scheduleDuration * BAL.wave.earlyCallAt;
    expect(unlockAt).toBeGreaterThan(0);

    // Just short of the unlock: filling, but not full.
    tick(s, unlockAt * 0.5);
    expect(s.waves.earlyFill).toBeGreaterThan(0.3);
    expect(s.waves.earlyFill).toBeLessThan(1);
    expect(s.waves.canCallEarly).toBe(false);

    tick(s, unlockAt * 0.5 + 0.1);
    expect(s.waves.earlyFill).toBe(1);
    expect(s.waves.canCallEarly).toBe(true);
    // And it tops out BEFORE the wave has finished spawning, which is the
    // whole point: the call overlaps the tail of this wave with the next.
    expect(s.spawner.elapsedSec).toBeLessThan(s.spawner.scheduleDuration);
  });

  it('calling early mid-wave advances the wave and still owes a card', () => {
    const s = setup();
    tick(s, BAL.wave.gap + 0.01);
    tick(s, s.spawner.scheduleDuration * BAL.wave.earlyCallAt + 0.1);
    const cleared = s.run.wavesCleared;
    expect(s.world.enemies.liveCount).toBeGreaterThan(0);

    expect(s.waves.callEarly(s.world, s.run, s.spawner)).toBe(true);
    expect(s.run.wave).toBe(2);
    // Abandoned, not cleared — but it counts, or a player who always calls
    // early would never be offered a card.
    expect(s.run.wavesCleared).toBe(cleared + 1);
    expect(s.waves.earlyFill).toBe(0);
  });
});

describe('spawner (SPEC §6.3, §6.4)', () => {
  it('is reproducible from the run seed and wave number', () => {
    const positions = (): number[] => {
      const s = setup();
      s.spawner.beginWave(s.world, 999, 7);
      for (let t = 0; t < 60 * 30; t++) s.spawner.update(s.world, FIXED_DT);
      const out: number[] = [];
      for (let i = 0; i < s.world.enemies.count; i++) {
        out.push(s.world.enemies.x[i] ?? 0, s.world.enemies.y[i] ?? 0, s.world.enemies.defIdx[i] ?? 0);
      }
      return out;
    };
    expect(positions()).toEqual(positions());
  });

  it('different waves of the same run differ', () => {
    const a = setup();
    a.spawner.beginWave(a.world, 999, 7);
    const b = setup();
    b.spawner.beginWave(b.world, 999, 8);
    for (let t = 0; t < 60 * 30; t++) {
      a.spawner.update(a.world, FIXED_DT);
      b.spawner.update(b.world, FIXED_DT);
    }
    expect(a.world.enemies.liveCount).not.toBe(b.world.enemies.liveCount);
  });

  it('spawns on the spawn ring, outside the arena', () => {
    const s = setup();
    s.spawner.beginWave(s.world, 1, 1);
    s.spawner.update(s.world, 1);
    expect(s.world.enemies.liveCount).toBeGreaterThan(0);
    for (let i = 0; i < s.world.enemies.count; i++) {
      if (s.world.enemies.alive[i] === 0) continue;
      const dx = (s.world.enemies.x[i] ?? 0) - s.world.tower.x;
      const dy = (s.world.enemies.y[i] ?? 0) - s.world.tower.y;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(R_SPAWN, 3);
    }
  });

  it('only spawns archetypes unlocked for that wave', () => {
    const s = setup();
    s.spawner.beginWave(s.world, 3, 1);
    for (let t = 0; t < 60 * 30; t++) s.spawner.update(s.world, FIXED_DT);
    for (let i = 0; i < s.world.enemies.count; i++) {
      if (s.world.enemies.alive[i] === 0) continue;
      expect(s.world.enemies.defIdx[i]).toBe(0); // only grunts at wave 1
    }
  });

  it('puts a boss on a boss wave and nowhere else', () => {
    const countBosses = (wave: number): number => {
      const s = setup();
      s.spawner.beginWave(s.world, 42, wave);
      for (let t = 0; t < 60 * 60; t++) s.spawner.update(s.world, FIXED_DT);
      let n = 0;
      for (let i = 0; i < s.world.enemies.count; i++) {
        if (s.world.enemies.alive[i] === 1 && ((s.world.enemies.flags[i] ?? 0) & EF.Boss) !== 0) n++;
      }
      return n;
    };
    expect(isBossWave(10)).toBe(true);
    expect(countBosses(10)).toBe(1);
    expect(countBosses(9)).toBe(0);
  });

  it('never spawns elites before the unlock wave', () => {
    const s = setup();
    for (let wave = 1; wave < BAL.elite.startWave; wave++) {
      s.world.enemies.reset();
      s.spawner.beginWave(s.world, wave * 31, wave);
      for (let t = 0; t < 60 * 60; t++) s.spawner.update(s.world, FIXED_DT);
      for (let i = 0; i < s.world.enemies.count; i++) {
        if (s.world.enemies.alive[i] === 0) continue;
        expect((s.world.enemies.flags[i] ?? 0) & EF.Elite).toBe(0);
      }
    }
  });

  it('skips spawns instead of growing the pool when it is full', () => {
    const s = setup();
    // Fill the pool, then run a late wave that wants far more than fits.
    for (let k = 0; k < s.world.enemies.cap; k++) s.world.enemies.spawn(0, 0, 0, 0, 1, 1);
    s.spawner.beginWave(s.world, 7, 90);
    for (let t = 0; t < 60 * 60; t++) s.spawner.update(s.world, FIXED_DT);
    expect(s.world.enemies.liveCount).toBe(s.world.enemies.cap);
    expect(s.spawner.skipped).toBeGreaterThan(0);
  });
});

describe('progression (SPEC §7.3, §2.3)', () => {
  it('offers one card every `cardEveryWaves` cleared waves, and no sooner', () => {
    const s = setup();
    const every = BAL.progression.cardEveryWaves;
    for (let w = 1; w <= every * 4; w++) {
      s.run.wavesCleared = w;
      updateProgression(s.run);
      expect(s.run.pendingCards).toBe(Math.floor(w / every));
      expect(s.run.level).toBe(1 + Math.floor(w / every));
    }
  });

  it('banks an offer the player has not taken yet', () => {
    const s = setup();
    // Two thresholds cross before anyone opens the card screen.
    s.run.wavesCleared = BAL.progression.cardEveryWaves * 2;
    updateProgression(s.run);
    expect(s.run.pendingCards).toBe(2);
  });

  it('counts down the waves left to the next card', () => {
    const s = setup();
    const every = BAL.progression.cardEveryWaves;
    expect(wavesToNextCard(s.run)).toBe(every);
    s.run.wavesCleared = 1;
    updateProgression(s.run);
    expect(wavesToNextCard(s.run)).toBe(every - 1);
  });

  it('core reward matches the spec examples', () => {
    // SPEC §10.1: wave 12 -> 5, wave 25 -> 18, wave 50 -> 56, wave 100 -> 172
    expect(coresForRun(12)).toBe(5);
    expect(coresForRun(25)).toBe(18);
    expect(coresForRun(50)).toBe(56);
    expect(coresForRun(100)).toBe(172);
  });

  it('a wave-0 run earns nothing', () => {
    expect(coresForRun(0)).toBe(0);
  });
});
