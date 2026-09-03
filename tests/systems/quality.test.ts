import { describe, it, expect } from 'vitest';
import { QualitySystem, QUALITY, PARTICLE_SHARE } from '../../src/systems/quality.ts';
import { ParticlePool } from '../../src/entities/particlePool.ts';

/** Feeds `seconds` of frames at a steady frame rate. */
function run(q: QualitySystem, fps: number, seconds: number): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds * fps; t++) q.sample(dt);
}

/** Burns off the startup warm-up window so a test measures steady state. */
function warmup(q: QualitySystem): void {
  run(q, 60, 4);
}

describe('automatic quality (SPEC §16.4 rule 8)', () => {
  it('starts high and stays there at a healthy frame rate', () => {
    const q = new QualitySystem();
    run(q, 60, 30);
    expect(q.level).toBe(QUALITY.High);
  });

  it('steps down when the frame rate sags', () => {
    const q = new QualitySystem();
    warmup(q);
    run(q, 40, 3);
    expect(q.level).toBe(QUALITY.Medium);
    run(q, 40, 3);
    expect(q.level).toBe(QUALITY.Low);
  });

  it('never drops below the lowest level', () => {
    const q = new QualitySystem();
    warmup(q);
    run(q, 20, 60);
    expect(q.level).toBe(QUALITY.Low);
  });

  it('recovers only after a sustained good streak', () => {
    const q = new QualitySystem();
    warmup(q);
    run(q, 30, 4);
    const dropped = q.level;
    expect(dropped).toBeLessThan(QUALITY.High);

    // A brief good patch must not bounce the level straight back: a level that
    // oscillates is worse than one that sits slightly too low.
    run(q, 60, 6);
    expect(q.level).toBeLessThan(QUALITY.High);

    run(q, 60, 40);
    expect(q.level).toBe(QUALITY.High);
  });

  it('ignores startup jank instead of downgrading on it', () => {
    const q = new QualitySystem();
    // A terrible first two seconds — page load, first decode — then fine.
    run(q, 12, 2);
    run(q, 60, 10);
    expect(q.level).toBe(QUALITY.High);
  });

  it('leaves the level alone once the player pins it', () => {
    const q = new QualitySystem();
    q.manual = true;
    run(q, 15, 30);
    expect(q.level).toBe(QUALITY.High);
  });

  it('reports the particle share for its level', () => {
    const q = new QualitySystem();
    expect(q.particleShare).toBe(PARTICLE_SHARE[QUALITY.High]);
    warmup(q);
    run(q, 30, 6);
    expect(q.particleShare).toBeLessThan(1);
  });
});

describe('particle throttling', () => {
  it('spawns roughly the requested share, deterministically', () => {
    const pool = new ParticlePool(2000);
    pool.share = 0.3;
    let made = 0;
    for (let k = 0; k < 1000; k++) {
      if (pool.spawn(0, 0, 0, 0, 100, 1, 0) >= 0) made++;
    }
    // Dithered, not random: 300 of 1000, give or take one.
    expect(made).toBeGreaterThanOrEqual(299);
    expect(made).toBeLessThanOrEqual(301);
  });

  it('spawns everything at full share', () => {
    const pool = new ParticlePool(500);
    pool.share = 1;
    let made = 0;
    for (let k = 0; k < 400; k++) if (pool.spawn(0, 0, 0, 0, 100, 1, 0) >= 0) made++;
    expect(made).toBe(400);
  });

  it('throttling never blocks gameplay pools — it is particles only', () => {
    // A regression guard: the share lives on the particle pool alone. If it
    // ever moved somewhere shared, enemies would silently stop spawning on a
    // slow device, which is a bug that would be very hard to see.
    const pool = new ParticlePool(64);
    pool.share = 0;
    expect(pool.spawn(0, 0, 0, 0, 1, 1, 0)).toBe(-1);
    expect(pool.liveCount).toBe(0);
  });
});
