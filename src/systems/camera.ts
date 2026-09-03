import { bus, EV } from '../core/events.ts';
import type { Rng } from '../core/rng.ts';

/**
 * Trauma-based screen shake (SPEC §3.1).
 *
 * Shake is driven by a `trauma` value that decays linearly while the offset
 * uses trauma SQUARED. That is what makes a big hit feel different from a small
 * one: linear trauma would make every shake feel the same size on the way out.
 */
export class CameraSystem {
  trauma = 0;
  x = 0;
  y = 0;
  /** Player setting: reduce-shake scales the whole effect (SPEC §11.4). */
  intensity = 1;

  private readonly maxOffset = 14;
  private readonly decayPerSec = 1.6;
  private t = 0;

  constructor(private readonly rng: Rng) {
    bus.on(EV.Shake, (amount) => this.addTrauma(amount));
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    if (this.trauma <= 0) {
      this.x = 0;
      this.y = 0;
      return;
    }
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decayPerSec * dt);
    const power = this.trauma * this.trauma * this.intensity;
    const amp = this.maxOffset * power;
    this.x = (this.rng.next() * 2 - 1) * amp;
    this.y = (this.rng.next() * 2 - 1) * amp;
  }

  reset(): void {
    this.trauma = 0;
    this.x = 0;
    this.y = 0;
    this.t = 0;
  }
}
