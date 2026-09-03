/** Allocation-free scalar math. Nothing here may create an object. */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp, clamped. Returns 0 when a === b (avoids NaN). */
export function invLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return clamp01((v - a) / (b - a));
}

/** Squared distance. Never take a sqrt just to compare — see CLAUDE.md §4.2. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

/** Moves `cur` toward `target` by at most `maxDelta`. */
export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  if (cur > target) return Math.max(cur - maxDelta, target);
  return cur;
}

/** Shortest signed angular difference from `a` to `b`, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Frame-rate independent exponential smoothing. `rate` = fraction remaining per second. */
export function damp(cur: number, target: number, rate: number, dt: number): number {
  return target + (cur - target) * Math.pow(rate, dt);
}

/**
 * Closed-form geometric-progression sum: base * (g^0 + g^1 + ... + g^(n-1)).
 * Used by the MAX-buy button so it never loops (SPEC §7.2).
 */
export function geoSum(base: number, growth: number, n: number): number {
  if (n <= 0) return 0;
  if (growth === 1) return base * n;
  return (base * (Math.pow(growth, n) - 1)) / (growth - 1);
}

/**
 * Largest n such that geoSum(base*growth^level, growth, n) <= budget.
 * Solved analytically, then corrected by at most a step or two for float drift.
 */
export function geoAffordable(
  base: number,
  growth: number,
  level: number,
  budget: number,
  maxN: number,
): number {
  const first = base * Math.pow(growth, level);
  if (first > budget) return 0;
  if (growth === 1) return Math.min(maxN, Math.floor(budget / first));
  const raw = Math.log((budget * (growth - 1)) / first + 1) / Math.log(growth);
  let n = clamp(Math.floor(raw), 0, maxN);
  // Float drift can put us one step off in either direction; walk it back to exact.
  while (n > 0 && geoSum(first, growth, n) > budget) n--;
  while (n < maxN && geoSum(first, growth, n + 1) <= budget) n++;
  return n;
}

export function sign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}
