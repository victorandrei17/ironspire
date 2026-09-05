import { describe, it, expect } from 'vitest';
import { BAL } from '../../src/data/balance.ts';
import { GameLoop } from '../../src/core/loop.ts';
import { FIXED_DT, MAX_CATCHUP } from '../../src/core/constants.ts';

function makeLoop(): { loop: GameLoop; sims: number[]; alphas: number[] } {
  const sims: number[] = [];
  const alphas: number[] = [];
  const loop = new GameLoop(
    (dt) => sims.push(dt),
    (a) => alphas.push(a),
    () => 0,
  );
  return { loop, sims, alphas };
}

describe('GameLoop', () => {
  it('runs exactly one fixed step per 1/60 s of real time', () => {
    const { loop, sims } = makeLoop();
    loop.frame(0);
    for (let i = 1; i <= 60; i++) loop.frame(i * (1000 / 60));
    expect(sims.length).toBe(60);
    for (const dt of sims) expect(dt).toBe(FIXED_DT);
  });

  it('catches up on a slow frame but never past MAX_CATCHUP', () => {
    const { loop, sims } = makeLoop();
    loop.frame(0);
    loop.frame(1000); // a full second of stall
    expect(sims.length).toBe(MAX_CATCHUP);
  });

  it('drops the backlog instead of spiralling', () => {
    const { loop, sims } = makeLoop();
    loop.frame(0);
    loop.frame(1000);
    const after = sims.length;
    loop.frame(1050); // 50 ms later: exactly three steps owed, no backlog
    expect(sims.length - after).toBe(3);
  });

  it('timeScale 0 pauses simulation but still renders', () => {
    const { loop, sims, alphas } = makeLoop();
    loop.timeScale = 0;
    loop.frame(0);
    for (let i = 1; i <= 30; i++) loop.frame(i * 16.7);
    expect(sims.length).toBe(0);
    expect(alphas.length).toBe(31);
  });

  it('slow-motion timeScale stretches simulated time', () => {
    const { loop, sims } = makeLoop();
    loop.timeScale = 0.5;
    loop.frame(0);
    for (let i = 1; i <= 60; i++) loop.frame(i * (1000 / 60));
    expect(sims.length).toBe(30);
  });

  it('a fast-forward timeScale runs extra fixed steps, not bigger ones', () => {
    for (const speed of BAL.speeds) {
      const { loop, sims } = makeLoop();
      loop.timeScale = speed;
      loop.frame(0);
      for (let i = 1; i <= 60; i++) loop.frame(i * (1000 / 60));
      // One second of wall clock at `speed` is `speed` seconds of simulation,
      // and every step is still FIXED_DT — the whole determinism argument
      // depends on the step never growing.
      expect(sims.length).toBe(Math.round(60 * speed));
      for (const dt of sims) expect(dt).toBe(FIXED_DT);
    }
  });

  it('alpha stays within [0,1)', () => {
    const { loop, alphas } = makeLoop();
    loop.frame(0);
    for (let i = 1; i <= 200; i++) loop.frame(i * 7.3);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('reset() discards accumulated time', () => {
    const { loop, sims } = makeLoop();
    loop.frame(0);
    loop.frame(15); // just under one step
    loop.reset();
    loop.frame(1000);
    expect(sims.length).toBe(0);
  });
});
