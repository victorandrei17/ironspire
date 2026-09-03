import { describe, it, expect } from 'vitest';
import { Rng, mixSeed } from '../../src/core/rng.ts';

describe('Rng (mulberry32)', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('diverges for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
    expect(same).toBeLessThan(3);
  });

  it('stays in [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 100_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const r = new Rng(99);
    const buckets = new Array<number>(10).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r.next() * 10)]!++;
    for (const b of buckets) expect(Math.abs(b / n - 0.1)).toBeLessThan(0.005);
  });

  it('int() covers the inclusive range', () => {
    const r = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(r.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('state can be snapshotted and restored', () => {
    const r = new Rng(4242);
    for (let i = 0; i < 50; i++) r.next();
    const snap = r.state;
    const a = [r.next(), r.next(), r.next()];
    r.state = snap;
    expect([r.next(), r.next(), r.next()]).toEqual(a);
  });

  it('weighted() respects zero weights and rough proportions', () => {
    const r = new Rng(31337);
    const w = [0, 3, 1, 0];
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i++) counts[r.weighted(w, w.length)]!++;
    expect(counts[0]).toBe(0);
    expect(counts[3]).toBe(0);
    expect(counts[1]! / counts[2]!).toBeGreaterThan(2.7);
    expect(counts[1]! / counts[2]!).toBeLessThan(3.3);
  });

  it('weighted() returns -1 when every weight is zero', () => {
    expect(new Rng(1).weighted([0, 0, 0], 3)).toBe(-1);
  });

  it('mixSeed decorrelates neighbouring inputs', () => {
    const a = new Rng(mixSeed(1000, 1)).next();
    const b = new Rng(mixSeed(1000, 2)).next();
    expect(Math.abs(a - b)).toBeGreaterThan(0.001);
  });
});
