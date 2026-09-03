import { FIXED_DT, MAX_FRAME, MAX_CATCHUP } from './constants.ts';

export type SimulateFn = (dt: number) => void;
/** `alpha` is the interpolation factor between the last two sim states. */
export type RenderFn = (alpha: number) => void;

/**
 * Fixed-timestep loop with an accumulator (SPEC §12.2).
 *
 * Pure by design: it owns no DOM. `main.ts` feeds it timestamps from rAF, and
 * the tests feed it synthetic ones. That is what makes the loop testable.
 */
export class GameLoop {
  /** 1 = normal, 0 = paused, 0.15 = level-up slow-mo, 2 = fast-forward. */
  timeScale = 1;

  /** Rolling diagnostics, read by the debug overlay. */
  simMs = 0;
  renderMs = 0;
  fps = 0;
  stepsLastFrame = 0;

  private acc = 0;
  private prevTime = -1;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private readonly simulate: SimulateFn,
    private readonly render: RenderFn,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Discards accumulated time — call after a pause so we do not catch up. */
  reset(): void {
    this.acc = 0;
    this.prevTime = -1;
  }

  /** Advances one displayed frame. `nowMs` is a monotonic millisecond clock. */
  frame(nowMs: number): void {
    if (this.prevTime < 0) this.prevTime = nowMs;
    // MAX_FRAME caps a long stall so we never queue a hundred catch-up ticks.
    const delta = Math.min((nowMs - this.prevTime) / 1000, MAX_FRAME);
    this.prevTime = nowMs;

    this.fpsAcc += delta;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.acc += delta * this.timeScale;

    let steps = 0;
    const t0 = this.now();
    while (this.acc >= FIXED_DT && steps < MAX_CATCHUP) {
      this.simulate(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    // Ran out of catch-up budget: drop the backlog instead of compounding it.
    if (steps === MAX_CATCHUP && this.acc >= FIXED_DT) this.acc = 0;
    const t1 = this.now();

    this.stepsLastFrame = steps;
    this.render(this.acc / FIXED_DT);
    const t2 = this.now();

    // Smoothed so the overlay is readable instead of strobing.
    this.simMs += (t1 - t0 - this.simMs) * 0.1;
    this.renderMs += (t2 - t1 - this.renderMs) * 0.1;
  }
}
