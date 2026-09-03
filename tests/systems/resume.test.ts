import { describe, it, expect } from 'vitest';
import { RunState } from '../../src/core/state.ts';
import { UPGRADE_COUNT } from '../../src/data/upgrades.ts';
import { CARD_COUNT } from '../../src/data/cards.ts';
import { SaveManager } from '../../src/save/save.ts';
import { SlotStorage, MemoryBackend } from '../../src/platform/storage.ts';
import { migrate } from '../../src/save/migrations.ts';
import type { RunSnapshot } from '../../src/save/schema.ts';
import { xpToNext } from '../../src/systems/progression.ts';

const NOW = 1_700_000_000_000;

function snapshotOf(run: RunState, towerHp: number): RunSnapshot {
  return {
    seed: run.seed,
    wave: run.wave,
    time: run.time,
    gold: run.gold,
    goldEarned: run.goldEarned,
    xp: run.xp,
    xpToNext: run.xpToNext,
    level: run.level,
    kills: run.kills,
    policy: run.policy,
    pendingCards: run.pendingCards,
    rerollsLeft: run.rerollsLeft,
    waveMax: run.waveMax,
    upgradeLevels: Array.from(run.upgradeLevels),
    cardLevels: Array.from(run.cardLevels),
    towerHp,
  };
}

describe('interrupted run (SPEC §15.2)', () => {
  it('survives a full write/read cycle with every field intact', () => {
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(0xabc, xpToNext(1), 2);
    run.wave = 7;
    run.time = 214.5;
    run.gold = 1234;
    run.goldEarned = 5678;
    run.xp = 9;
    run.level = 6;
    run.kills = 88;
    run.waveMax = 7;
    run.upgradeLevels[0] = 12;
    run.upgradeLevels[3] = 4;
    run.cardLevels[1] = 3;

    const backend = new MemoryBackend();
    const mgr = new SaveManager(new SlotStorage(backend), () => NOW);
    mgr.load();
    mgr.storeRunSnapshot(snapshotOf(run, 63.5));
    mgr.flush();

    const reloaded = new SaveManager(new SlotStorage(backend), () => NOW);
    reloaded.load();
    const snap = reloaded.save.run;
    expect(snap).toBeDefined();
    expect(snap?.seed).toBe(0xabc);
    expect(snap?.wave).toBe(7);
    expect(snap?.gold).toBe(1234);
    expect(snap?.level).toBe(6);
    expect(snap?.kills).toBe(88);
    expect(snap?.towerHp).toBeCloseTo(63.5);
    expect(snap?.upgradeLevels[0]).toBe(12);
    expect(snap?.upgradeLevels[3]).toBe(4);
    expect(snap?.cardLevels[1]).toBe(3);
    // A save written mid-run must still verify (the key-order regression).
    expect(reloaded.localOnly).toBe(false);
  });

  it('clearing the snapshot removes it from the file', () => {
    const backend = new MemoryBackend();
    const mgr = new SaveManager(new SlotStorage(backend), () => NOW);
    mgr.load();
    const run = new RunState(UPGRADE_COUNT, CARD_COUNT);
    run.reset(1, 12, 1);
    mgr.storeRunSnapshot(snapshotOf(run, 100));
    mgr.flush();
    expect(new SlotStorage(backend).read().raw).toContain('"run"');

    mgr.clearRunSnapshot();
    mgr.flush();
    const raw = new SlotStorage(backend).read().raw ?? '';
    expect(migrate(JSON.parse(raw), NOW).save.run).toBeUndefined();
  });

  it('a truncated snapshot is dropped rather than resumed into', () => {
    const backend = new MemoryBackend();
    const good = {
      v: 1,
      meta: {},
      stats: {},
      prefs: {},
      idle: {},
      run: { seed: 1, wave: 2 }, // missing towerHp and the level arrays
      sig: '',
    };
    backend.set('ironspire.save.a', JSON.stringify(good));
    const mgr = new SaveManager(new SlotStorage(backend), () => NOW);
    mgr.load();
    expect(mgr.save.run).toBeUndefined();
  });
});
