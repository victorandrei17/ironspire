import { describe, it, expect } from 'vitest';
import { Pool } from '../../src/core/pool.ts';
import { Rng } from '../../src/core/rng.ts';

describe('Pool', () => {
  it('hands out every slot then refuses', () => {
    const p = new Pool(4);
    const got = [p.alloc(), p.alloc(), p.alloc(), p.alloc()];
    expect(got.sort()).toEqual([0, 1, 2, 3]);
    expect(p.alloc()).toBe(-1);
    expect(p.droppedSpawns).toBe(1);
    expect(p.liveCount).toBe(4);
  });

  it('recycles freed slots', () => {
    const p = new Pool(3);
    const a = p.alloc();
    p.alloc();
    p.free(a);
    expect(p.alloc()).toBe(a);
    expect(p.liveCount).toBe(2);
  });

  it('keeps count as a tight high-water mark', () => {
    const p = new Pool(8);
    for (let i = 0; i < 5; i++) p.alloc();
    expect(p.count).toBe(5);
    p.free(4);
    p.free(3);
    expect(p.count).toBe(3); // tail collapses, no dead suffix to scan
    p.free(0);
    expect(p.count).toBe(3); // a hole in the middle must not move the mark
  });

  it('double free is a no-op', () => {
    const p = new Pool(2);
    const i = p.alloc();
    p.free(i);
    p.free(i);
    expect(p.liveCount).toBe(0);
    expect(p.freeSlots).toBe(2);
  });

  it('handles detect a recycled slot', () => {
    const p = new Pool(2);
    const i = p.alloc();
    const h = p.handle(i);
    expect(p.resolve(h)).toBe(i);
    p.free(i);
    expect(p.resolve(h)).toBe(-1);
    const j = p.alloc();
    expect(j).toBe(i); // same slot...
    expect(p.resolve(h)).toBe(-1); // ...but the old handle stays dead
    expect(p.resolve(p.handle(j))).toBe(j);
  });

  it('handles survive generation wrap-around', () => {
    const p = new Pool(1);
    // 65536 cycles wraps gen back to its starting value; the handle must not
    // resolve just because the counter came all the way round on a dead slot.
    for (let k = 0; k < 65_536; k++) {
      const i = p.alloc();
      p.free(i);
    }
    const stale = p.handle(0);
    expect(p.resolve(stale)).toBe(-1); // slot is free, so nothing resolves
  });

  it('reset() restores a pristine pool', () => {
    const p = new Pool(4);
    p.alloc();
    p.alloc();
    p.reset();
    expect(p.count).toBe(0);
    expect(p.liveCount).toBe(0);
    expect(p.freeSlots).toBe(4);
    expect(p.alloc()).toBe(0);
  });

  it('survives 1e6 random spawn/kill ops with an intact free list', () => {
    const cap = 64;
    const p = new Pool(cap);
    const rng = new Rng(0xc0ffee);
    const live: number[] = [];
    const isLive = new Uint8Array(cap);
    let violations = 0;
    // Invariants are counted rather than asserted per op: a million expect()
    // calls costs ten seconds of suite time and proves nothing extra.
    for (let op = 0; op < 1_000_000; op++) {
      if (live.length === 0 || rng.chance(0.5)) {
        const i = p.alloc();
        if (i >= 0) {
          if (isLive[i] === 1) violations++; // handed out a slot already in use
          isLive[i] = 1;
          live.push(i);
        } else if (live.length !== cap) {
          violations++; // refused while slots were still free
        }
      } else {
        const k = rng.pickIndex(live.length);
        const i = live[k]!;
        live[k] = live[live.length - 1]!;
        live.pop();
        isLive[i] = 0;
        p.free(i);
      }
      if (p.liveCount !== live.length) violations++;
      if (p.liveCount + p.freeSlots !== cap) violations++;
    }
    expect(violations).toBe(0);
    expect(p.liveCount + p.freeSlots).toBe(cap);
    let aliveInArray = 0;
    for (let i = 0; i < cap; i++) if (p.alive[i] === 1) aliveInArray++;
    expect(aliveInArray).toBe(live.length);
  });
});
