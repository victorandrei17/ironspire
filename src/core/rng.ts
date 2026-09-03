/**
 * Seeded mulberry32. Deterministic simulation is a hard requirement (SPEC §12.1).
 * Nothing in gameplay may call Math.random — inject an Rng instead.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    // >>> 0 keeps the state an unsigned 32-bit int even for negative/float seeds.
    this.s = seed >>> 0;
  }

  /** Current internal state — enough to snapshot/restore a run mid-flight. */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  float(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** Uniform integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform angle in [0, 2PI). */
  angle(): number {
    return this.next() * Math.PI * 2;
  }

  /** Picks an index of `arr`. Returns -1 for an empty array. */
  pickIndex(len: number): number {
    if (len <= 0) return -1;
    return Math.floor(this.next() * len);
  }

  /**
   * Weighted roulette over `weights[0..len)`. Returns an index, or -1 if the
   * total weight is 0. Does not allocate — caller owns the array.
   */
  weighted(weights: ArrayLike<number>, len: number): number {
    let total = 0;
    for (let i = 0; i < len; i++) total += weights[i] ?? 0;
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < len; i++) {
      r -= weights[i] ?? 0;
      if (r < 0) return i;
    }
    return len - 1;
  }
}

/** Mixes two 32-bit values into a new seed (e.g. runSeed ^ waveNumber, decorrelated). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
