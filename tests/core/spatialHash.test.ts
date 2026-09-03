import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../../src/core/spatialHash.ts';
import { Rng } from '../../src/core/rng.ts';
import { dist2 } from '../../src/core/math.ts';

const MIN_X = -400;
const MIN_Y = -200;
const W = 1600;
const H = 1700;

function bruteForce(
  x: Float32Array,
  y: Float32Array,
  alive: Uint8Array,
  n: number,
  cx: number,
  cy: number,
  r: number,
): Set<number> {
  const out = new Set<number>();
  const r2 = r * r;
  for (let i = 0; i < n; i++) {
    if (alive[i] === 0) continue;
    if (dist2(x[i]!, y[i]!, cx, cy) <= r2) out.add(i);
  }
  return out;
}

describe('SpatialHash', () => {
  it('is a superset of brute force for 10k random queries', () => {
    const n = 400;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const alive = new Uint8Array(n);
    const rng = new Rng(777);
    for (let i = 0; i < n; i++) {
      x[i] = rng.float(MIN_X, MIN_X + W);
      y[i] = rng.float(MIN_Y, MIN_Y + H);
      alive[i] = rng.chance(0.8) ? 1 : 0;
    }
    const hash = new SpatialHash(MIN_X, MIN_Y, W, H, n);
    hash.build(x, y, alive, n);

    const out = new Int32Array(n);
    let misses = 0;
    let deadReturned = 0;
    for (let q = 0; q < 10_000; q++) {
      const cx = rng.float(MIN_X, MIN_X + W);
      const cy = rng.float(MIN_Y, MIN_Y + H);
      const r = rng.float(1, 200);
      const count = hash.query(cx, cy, r, out);
      const candidates = new Set<number>();
      for (let k = 0; k < count; k++) {
        const i = out[k]!;
        candidates.add(i);
        if (alive[i] === 0) deadReturned++;
      }
      // Broad phase must never miss a true hit; extra candidates are expected.
      for (const truth of bruteForce(x, y, alive, n, cx, cy, r)) {
        if (!candidates.has(truth)) misses++;
      }
    }
    expect(misses).toBe(0);
    expect(deadReturned).toBe(0);
  });

  it('indexes every alive entity exactly once', () => {
    const n = 300;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const alive = new Uint8Array(n);
    const rng = new Rng(31);
    let expected = 0;
    for (let i = 0; i < n; i++) {
      x[i] = rng.float(MIN_X, MIN_X + W);
      y[i] = rng.float(MIN_Y, MIN_Y + H);
      alive[i] = rng.chance(0.6) ? 1 : 0;
      if (alive[i] === 1) expected++;
    }
    const hash = new SpatialHash(MIN_X, MIN_Y, W, H, n);
    hash.build(x, y, alive, n);
    expect(hash.size).toBe(expected);

    // A query covering the whole grid must return each alive index once.
    const out = new Int32Array(n);
    const count = hash.query(MIN_X + W / 2, MIN_Y + H / 2, W + H, out);
    const seen = new Set<number>();
    for (let k = 0; k < count; k++) seen.add(out[k]!);
    expect(count).toBe(expected);
    expect(seen.size).toBe(expected);
  });

  it('clamps entities outside the grid instead of dropping them', () => {
    const x = new Float32Array([-99_999, 99_999, 0]);
    const y = new Float32Array([-99_999, 99_999, 0]);
    const alive = new Uint8Array([1, 1, 1]);
    const hash = new SpatialHash(MIN_X, MIN_Y, W, H, 3);
    hash.build(x, y, alive, 3);
    expect(hash.size).toBe(3);
  });

  it('rebuild is idempotent and leaks nothing between frames', () => {
    const n = 64;
    const x = new Float32Array(n).fill(100);
    const y = new Float32Array(n).fill(100);
    const alive = new Uint8Array(n).fill(1);
    const hash = new SpatialHash(MIN_X, MIN_Y, W, H, n);
    const out = new Int32Array(n);
    hash.build(x, y, alive, n);
    expect(hash.query(100, 100, 10, out)).toBe(n);
    alive.fill(0);
    hash.build(x, y, alive, n);
    expect(hash.query(100, 100, 10, out)).toBe(0);
    expect(hash.size).toBe(0);
  });

  it('never writes past the callers output buffer', () => {
    const n = 200;
    const x = new Float32Array(n).fill(50);
    const y = new Float32Array(n).fill(50);
    const alive = new Uint8Array(n).fill(1);
    const hash = new SpatialHash(MIN_X, MIN_Y, W, H, n);
    hash.build(x, y, alive, n);
    const small = new Int32Array(10);
    expect(hash.query(50, 50, 100, small)).toBe(10);
  });
});
