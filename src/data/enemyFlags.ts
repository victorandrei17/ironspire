/**
 * Enemy state and capability constants.
 *
 * These live in `data/` rather than next to the pool because `data/enemies.ts`
 * needs them and data must never import from `entities/` — that is the wrong
 * way down the dependency chain (CLAUDE.md §3) and would make the two files
 * mutually dependent.
 */

/** Behaviour states (SPEC §4.3). Plain numbers: a TS enum emits runtime code. */
export const ES = {
  Seek: 0,
  Attack: 1,
  Approach: 2,
  Shoot: 3,
  Dying: 4,
} as const;

/** Capability bits. A bitmask beats `instanceof` and keeps the check branchless. */
export const EF = {
  Elite: 1 << 0,
  Boss: 1 << 1,
  Ranged: 1 << 2,
  Phasing: 1 << 3,
  Shielded: 1 << 4,
  Healer: 1 << 5,
  Splits: 1 << 6,
  ArmoredAffix: 1 << 7,
  SwiftAffix: 1 << 8,
  VampiricAffix: 1 << 9,
  ExplosiveAffix: 1 << 10,
} as const;
