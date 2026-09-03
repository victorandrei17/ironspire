import { CELL_SIZE } from './constants.ts';

/**
 * Uniform spatial hash rebuilt every tick with counting sort (SPEC §12.5).
 *
 * Zero allocation per rebuild: the bucket table, the prefix offsets and the
 * item list are all preallocated typed arrays. A Map<cell, number[]> would
 * allocate an array per occupied cell per frame — that is the GC saw-tooth the
 * whole design exists to avoid.
 */
export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly minX: number;
  readonly minY: number;

  private readonly counts: Int32Array;
  private readonly starts: Int32Array;
  private readonly cursor: Int32Array;
  private readonly items: Int32Array;
  private itemCount = 0;

  constructor(minX: number, minY: number, width: number, height: number, capacity: number) {
    this.cellSize = CELL_SIZE;
    this.minX = minX;
    this.minY = minY;
    this.cols = Math.max(1, Math.ceil(width / CELL_SIZE));
    this.rows = Math.max(1, Math.ceil(height / CELL_SIZE));
    const cells = this.cols * this.rows;
    this.counts = new Int32Array(cells);
    this.starts = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.items = new Int32Array(capacity);
  }

  /** Cell column for a world X, clamped to the grid. */
  colOf(x: number): number {
    const c = Math.floor((x - this.minX) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  rowOf(y: number): number {
    const r = Math.floor((y - this.minY) / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Rebuilds from a pool's position arrays. O(n + cells). */
  build(x: Float32Array, y: Float32Array, alive: Uint8Array, count: number): void {
    this.counts.fill(0);
    const cap = this.items.length;
    let total = 0;
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      if (total >= cap) break;
      const cell = this.rowOf(y[i] ?? 0) * this.cols + this.colOf(x[i] ?? 0);
      this.counts[cell] = (this.counts[cell] ?? 0) + 1;
      total++;
    }
    let running = 0;
    for (let c = 0; c < this.counts.length; c++) {
      this.starts[c] = running;
      this.cursor[c] = running;
      running += this.counts[c] ?? 0;
    }
    this.starts[this.counts.length] = running;
    this.itemCount = running;

    let written = 0;
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      if (written >= cap) break;
      const cell = this.rowOf(y[i] ?? 0) * this.cols + this.colOf(x[i] ?? 0);
      const slot = this.cursor[cell] ?? 0;
      this.items[slot] = i;
      this.cursor[cell] = slot + 1;
      written++;
    }
  }

  /**
   * Writes candidate indices whose cell overlaps the circle (cx, cy, r) into
   * `out`, returning how many were written. Broad phase only — the caller still
   * does the squared-distance test.
   */
  query(cx: number, cy: number, r: number, out: Int32Array): number {
    const c0 = this.colOf(cx - r);
    const c1 = this.colOf(cx + r);
    const r0 = this.rowOf(cy - r);
    const r1 = this.rowOf(cy + r);
    let n = 0;
    const limit = out.length;
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const cell = base + col;
        const start = this.starts[cell] ?? 0;
        const end = this.starts[cell + 1] ?? start;
        for (let k = start; k < end; k++) {
          if (n >= limit) return n;
          out[n++] = this.items[k] ?? 0;
        }
      }
    }
    return n;
  }

  get size(): number {
    return this.itemCount;
  }
}
