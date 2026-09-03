/**
 * Struct-of-arrays pool with a free list (SPEC §12.4).
 *
 * This base owns liveness and slot recycling; subclasses add their own typed
 * arrays for the actual fields. There is no generic ECS here on purpose: an
 * entity is an index, its fields are parallel arrays, and iteration is a plain
 * indexed for-loop with no indirection.
 *
 * Slots are NEVER compacted — an index is a reference. That is also why every
 * slot carries a generation counter: without it a stale index silently points
 * at whatever was spawned in the recycled slot (a projectile chasing a dead
 * enemy would just retarget onto its replacement).
 */
export class Pool {
  readonly cap: number;
  readonly alive: Uint8Array;
  readonly gen: Uint16Array;

  /** High-water mark: iterate `[0, count)`, not `[0, cap)`. */
  count = 0;
  /** Number of alive slots, for diagnostics and the debug overlay. */
  liveCount = 0;
  /** Spawns refused because the pool was full. A rising number is a design bug. */
  droppedSpawns = 0;

  private readonly freeList: Int32Array;
  private freeCount: number;

  constructor(cap: number) {
    this.cap = cap;
    this.alive = new Uint8Array(cap);
    this.gen = new Uint16Array(cap);
    this.freeList = new Int32Array(cap);
    // Seeded high-to-low so the LIFO stack hands out index 0 first, which keeps
    // `count` (and therefore every iteration) as tight as possible.
    for (let i = 0; i < cap; i++) this.freeList[i] = cap - 1 - i;
    this.freeCount = cap;
  }

  /**
   * Claims a slot. Returns its index, or -1 when full.
   * The pool never grows: growing mid-run means a multi-megabyte reallocation
   * and a visible stall (SPEC §12.4).
   */
  alloc(): number {
    if (this.freeCount === 0) {
      this.droppedSpawns++;
      return -1;
    }
    const i = this.freeList[--this.freeCount] ?? 0;
    this.alive[i] = 1;
    this.liveCount++;
    if (i >= this.count) this.count = i + 1;
    return i;
  }

  /** Releases a slot and bumps its generation so old handles stop resolving. */
  free(i: number): void {
    if (this.alive[i] === 0) return;
    this.alive[i] = 0;
    this.gen[i] = ((this.gen[i] ?? 0) + 1) & 0xffff;
    this.freeList[this.freeCount++] = i;
    this.liveCount--;
    // Pull the high-water mark back down when the tail dies, so iteration does
    // not keep scanning a long dead suffix after a wave clears.
    while (this.count > 0 && this.alive[this.count - 1] === 0) this.count--;
  }

  /** Frees every slot. Used between runs. */
  reset(): void {
    this.alive.fill(0);
    for (let i = 0; i < this.cap; i++) this.freeList[i] = this.cap - 1 - i;
    this.freeCount = this.cap;
    this.count = 0;
    this.liveCount = 0;
    this.droppedSpawns = 0;
  }

  /** Packs index + generation into one 32-bit number safe to store anywhere. */
  handle(i: number): number {
    return (((this.gen[i] ?? 0) << 16) | (i & 0xffff)) >>> 0;
  }

  /** Resolves a handle back to a live index, or -1 if that entity is gone. */
  resolve(handle: number): number {
    const i = handle & 0xffff;
    if (i >= this.cap || this.alive[i] === 0) return -1;
    return this.gen[i] === (handle >>> 16) ? i : -1;
  }

  get freeSlots(): number {
    return this.freeCount;
  }
}
