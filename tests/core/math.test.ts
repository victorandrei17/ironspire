import { describe, it, expect } from 'vitest';
import {
  clamp,
  clamp01,
  lerp,
  invLerp,
  dist2,
  angleTo,
  approach,
  angleDiff,
  geoSum,
  geoAffordable,
} from '../../src/core/math.ts';

describe('scalar math', () => {
  it('clamp / clamp01', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(1, 0, 3)).toBe(1);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-2)).toBe(0);
  });

  it('lerp / invLerp round-trip', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(invLerp(10, 20, 15)).toBe(0.5);
    expect(invLerp(5, 5, 5)).toBe(0);
  });

  it('dist2 is the squared distance', () => {
    expect(dist2(0, 0, 3, 4)).toBe(25);
  });

  it('angleTo', () => {
    expect(angleTo(0, 0, 1, 0)).toBeCloseTo(0);
    expect(angleTo(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
  });

  it('approach never overshoots', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(0, 2, 3)).toBe(2);
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(5, 5, 3)).toBe(5);
  });

  it('angleDiff takes the short way round', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(-3.0, 3.0)).toBeCloseTo(-0.2831853, 5);
  });
});

describe('geometric progression helpers', () => {
  it('geoSum matches a naive loop', () => {
    for (const g of [1, 1.11, 1.145, 1.3]) {
      for (const n of [0, 1, 5, 20, 60]) {
        let naive = 0;
        for (let i = 0; i < n; i++) naive += 20 * Math.pow(g, i);
        expect(geoSum(20, g, n)).toBeCloseTo(naive, 6);
      }
    }
  });

  it('geoAffordable buys exactly what the budget allows', () => {
    const base = 20;
    const growth = 1.115;
    for (const level of [0, 1, 7, 30]) {
      for (const budget of [0, 19, 20, 100, 5000, 1e6, 1e12]) {
        const n = geoAffordable(base, growth, level, budget, 999);
        const first = base * Math.pow(growth, level);
        expect(geoSum(first, growth, n)).toBeLessThanOrEqual(budget + 1e-6);
        if (n < 999) expect(geoSum(first, growth, n + 1)).toBeGreaterThan(budget);
      }
    }
  });

  it('geoAffordable respects the cap', () => {
    expect(geoAffordable(1, 1.1, 0, 1e18, 10)).toBe(10);
  });

  it('geoAffordable handles growth of exactly 1', () => {
    expect(geoAffordable(10, 1, 0, 95, 999)).toBe(9);
  });
});
