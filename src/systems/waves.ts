import type { World } from '../entities/world.ts';
import type { RunState } from '../core/state.ts';
import type { Spawner } from './spawner.ts';
import { BAL } from '../data/balance.ts';
import { bus, EV } from '../core/events.ts';

export const WAVE_PHASE = {
  /** Between waves; the "next wave" button is live. */
  Gap: 0,
  Active: 1,
} as const;

export type WavePhase = (typeof WAVE_PHASE)[keyof typeof WAVE_PHASE];

/**
 * Wave pacing (SPEC §6.1).
 *
 * A wave ends when every enemy it released is dead or gone, then a short gap
 * runs before the next. Calling the next wave early during that gap trades
 * breathing room for +15% gold — the button that separates a casual player
 * from an optimising one.
 */
export class WaveSystem {
  phase: WavePhase = WAVE_PHASE.Gap;
  /** Seconds left in the gap. */
  gapLeft = 0;
  /** True while the player may call the next wave early. */
  get canCallEarly(): boolean {
    return this.phase === WAVE_PHASE.Gap && this.gapLeft > 0;
  }

  private earlyCalled = false;

  reset(): void {
    this.phase = WAVE_PHASE.Gap;
    // Short breather before wave 1 so the HUD is readable before it starts.
    this.gapLeft = BAL.wave.gap;
    this.earlyCalled = false;
  }

  update(world: World, run: RunState, spawner: Spawner, dt: number): void {
    if (this.phase === WAVE_PHASE.Gap) {
      this.gapLeft -= dt;
      if (this.gapLeft <= 0) this.startNext(world, run, spawner);
      return;
    }

    spawner.update(world, dt);
    // The wave is over once everything is released AND the arena is clear.
    if (spawner.allReleased && world.enemies.liveCount === 0) {
      bus.emit(EV.WaveEnd, run.wave);
      this.phase = WAVE_PHASE.Gap;
      this.gapLeft = BAL.wave.gap;
      this.earlyCalled = false;
      run.waveGoldBonus = 1;
    }
  }

  /** Player pressed "next wave". Grants the early-call gold bonus. */
  callEarly(world: World, run: RunState, spawner: Spawner): boolean {
    if (!this.canCallEarly) return false;
    this.earlyCalled = true;
    this.startNext(world, run, spawner);
    return true;
  }

  private startNext(world: World, run: RunState, spawner: Spawner): void {
    run.wave++;
    run.waveGoldBonus = this.earlyCalled ? 1 + BAL.wave.earlyCallGoldBonus : 1;
    this.phase = WAVE_PHASE.Active;
    this.gapLeft = 0;
    spawner.beginWave(world, run.seed, run.wave);
  }
}
