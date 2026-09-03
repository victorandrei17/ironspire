import { describe, it, expect } from 'vitest';
import { YSorter } from '../../src/render/layers.ts';
import { Rng } from '../../src/core/rng.ts';
import { VH } from '../../src/core/constants.ts';

describe('YSorter', () => {
  it('emits alive indices in ascending Y order', () => {
    const n = 500;
    const y = new Float32Array(n);
    const alive = new Uint8Array(n);
    const rng = new Rng(1234);
    for (let i = 0; i < n; i++) {
      y[i] = rng.float(0, VH);
      alive[i] = rng.chance(0.7) ? 1 : 0;
    }
    const s = new YSorter(n);
    s.build(y, alive, n);

    let expected = 0;
    for (let i = 0; i < n; i++) if (alive[i] === 1) expected++;
    expect(s.length).toBe(expected);

    // Bucketed sort: order is monotonic to within one bucket height.
    const bucketH = VH / 96;
    let prev = -Infinity;
    for (let k = 0; k < s.length; k++) {
      const yi = y[s.order[k]!]!;
      expect(yi).toBeGreaterThanOrEqual(prev - bucketH);
      prev = yi;
    }
  });

  it('handles an empty and an all-dead pool', () => {
    const s = new YSorter(8);
    s.build(new Float32Array(8), new Uint8Array(8), 0);
    expect(s.length).toBe(0);
    s.build(new Float32Array(8), new Uint8Array(8), 8);
    expect(s.length).toBe(0);
  });

  it('clamps out-of-arena positions instead of writing out of bounds', () => {
    const y = new Float32Array([-9999, 9999, 100]);
    const alive = new Uint8Array([1, 1, 1]);
    const s = new YSorter(3);
    s.build(y, alive, 3);
    expect(s.length).toBe(3);
    expect(y[s.order[0]!]).toBe(-9999);
    expect(y[s.order[2]!]).toBe(9999);
  });
});
