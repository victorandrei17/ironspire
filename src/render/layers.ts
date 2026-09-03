import { VH } from '../core/constants.ts';

/**
 * Draw order (SPEC §13 / PROGRESS M1):
 * ground → shadows → pickups → enemies (Y-sorted) → tower → projectiles → VFX → numbers.
 *
 * The order is a constant, not a data structure: there is no dynamic layer
 * system to walk, the renderer just runs its passes in this sequence.
 */
export const LAYER = {
  Ground: 0,
  Shadows: 1,
  Pickups: 2,
  Enemies: 3,
  Tower: 4,
  Projectiles: 5,
  Vfx: 6,
  Numbers: 7,
} as const;

const BUCKETS = 96;
const BUCKET_H = VH / BUCKETS;

/**
 * Counting-sort by Y into a fixed bucket table.
 *
 * A comparison sort would allocate a closure per frame and cost O(n log n);
 * this is O(n) with zero allocation, and one bucket per ~13 world units is
 * finer than any overlap the eye can catch.
 */
export class YSorter {
  readonly order: Int32Array;
  private readonly counts = new Int32Array(BUCKETS + 1);
  private readonly cursor = new Int32Array(BUCKETS + 1);
  length = 0;

  constructor(capacity: number) {
    this.order = new Int32Array(capacity);
  }

  /** Fills `order[0..length)` with alive indices sorted by ascending Y. */
  build(y: Float32Array, alive: Uint8Array, count: number): void {
    this.counts.fill(0);
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      const b = bucketOf(y[i] ?? 0);
      this.counts[b] = (this.counts[b] ?? 0) + 1;
    }
    let running = 0;
    for (let b = 0; b <= BUCKETS; b++) {
      this.cursor[b] = running;
      running += this.counts[b] ?? 0;
    }
    this.length = running;
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      const b = bucketOf(y[i] ?? 0);
      const slot = this.cursor[b] ?? 0;
      if (slot < this.order.length) this.order[slot] = i;
      this.cursor[b] = slot + 1;
    }
    if (this.length > this.order.length) this.length = this.order.length;
  }
}

function bucketOf(yv: number): number {
  const b = Math.floor(yv / BUCKET_H);
  return b < 0 ? 0 : b > BUCKETS ? BUCKETS : b;
}
