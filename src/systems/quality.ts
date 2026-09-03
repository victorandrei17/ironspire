import { bus, EV } from '../core/events.ts';

/**
 * Automatic quality degradation (SPEC §16.4 rule 8).
 *
 * The game protects its own frame rate. If the 2-second average drops under
 * the floor, particle density steps down; if it recovers and holds, it steps
 * back up. A player on a weak device gets a smooth game instead of a pretty
 * slideshow, and never has to find a settings screen to get it.
 */
export const QUALITY = {
  Low: 0,
  Medium: 1,
  High: 2,
} as const;

export type QualityLevel = (typeof QUALITY)[keyof typeof QUALITY];

/** Fraction of requested particles actually spawned, per level. */
export const PARTICLE_SHARE = [0.3, 0.65, 1] as const;

const WINDOW_SEC = 2;
/**
 * Ignore the first seconds after boot. Page load, shader warm-up and the first
 * atlas decode all land in that window, and a downgrade triggered by startup
 * jank punishes a device that would have run fine.
 */
const WARMUP_SEC = 3;
const DROP_BELOW_FPS = 50;
/** Recovery is deliberately stricter and slower than the drop: a level that
 *  oscillates is worse than one that is slightly too low. */
const RAISE_ABOVE_FPS = 58;
const RAISE_AFTER_SEC = 12;

export class QualitySystem {
  level: QualityLevel = QUALITY.High;
  /** True for one frame after an automatic change, so the UI can say so. */
  changed = false;
  /** Set when the player pinned a level in options; auto-tuning stops. */
  manual = false;

  private acc = 0;
  private frames = 0;
  private goodStreak = 0;
  private warmup = 0;

  reset(level: QualityLevel): void {
    this.level = level;
    this.acc = 0;
    this.frames = 0;
    this.goodStreak = 0;
    this.warmup = 0;
    this.changed = false;
  }

  /** Feed one rendered frame. `dt` is real elapsed time, not simulated. */
  sample(dt: number): void {
    this.changed = false;
    if (this.manual || dt <= 0) return;
    if (this.warmup < WARMUP_SEC) {
      this.warmup += dt;
      return;
    }
    this.acc += dt;
    this.frames++;
    if (this.acc < WINDOW_SEC) return;

    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;

    if (fps < DROP_BELOW_FPS && this.level > QUALITY.Low) {
      this.level = (this.level - 1) as QualityLevel;
      this.goodStreak = 0;
      this.changed = true;
      bus.emit(EV.SceneChanged, -1, this.level);
      return;
    }

    if (fps >= RAISE_ABOVE_FPS && this.level < QUALITY.High) {
      this.goodStreak += WINDOW_SEC;
      if (this.goodStreak >= RAISE_AFTER_SEC) {
        this.level = (this.level + 1) as QualityLevel;
        this.goodStreak = 0;
        this.changed = true;
      }
      return;
    }
    this.goodStreak = 0;
  }

  /** 0..1 share of requested particles that should actually spawn. */
  get particleShare(): number {
    return PARTICLE_SHARE[this.level] ?? 1;
  }
}
