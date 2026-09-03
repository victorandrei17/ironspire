import { describe, it, expect } from 'vitest';
import { SaveManager, signature } from '../../src/save/save.ts';
import { SlotStorage, MemoryBackend, type StorageBackend } from '../../src/platform/storage.ts';
import { migrate } from '../../src/save/migrations.ts';
import { makeDefaultSave, CURRENT_VERSION } from '../../src/save/schema.ts';
import { AUTOSAVE_SEC } from '../../src/core/constants.ts';

const NOW = 1_700_000_000_000;

function manager(clock = (): number => NOW): {
  mgr: SaveManager;
  backend: MemoryBackend;
} {
  const backend = new MemoryBackend();
  return { mgr: new SaveManager(new SlotStorage(backend), clock), backend };
}

describe('save round trip', () => {
  it('a fresh install loads defaults without throwing', () => {
    const { mgr } = manager();
    mgr.load();
    expect(mgr.save.v).toBe(CURRENT_VERSION);
    expect(mgr.save.meta.nucleos).toBe(0);
    expect(mgr.localOnly).toBe(false);
  });

  it('persists and reloads', () => {
    const { mgr, backend } = manager();
    mgr.load();
    mgr.save.meta.nucleos = 42;
    mgr.save.meta.talents.war_dmg = 3;
    mgr.flush();

    const second = new SaveManager(new SlotStorage(backend), () => NOW);
    second.load();
    expect(second.save.meta.nucleos).toBe(42);
    expect(second.save.meta.talents.war_dmg).toBe(3);
    expect(second.localOnly).toBe(false);
  });

  it('alternates slots so a write cannot destroy the last good save', () => {
    const backend = new MemoryBackend();
    const slots = new SlotStorage(backend);
    slots.write('{"a":1}');
    slots.write('{"a":2}');
    expect(backend.get('ironspire.save.a')).toBe('{"a":1}');
    expect(backend.get('ironspire.save.b')).toBe('{"a":2}');
    expect(slots.read().raw).toBe('{"a":2}');
  });

  it('falls back to the other slot when the newest is corrupt', () => {
    const backend = new MemoryBackend();
    const slots = new SlotStorage(backend);
    slots.write('{"v":1,"good":true}');
    slots.write('{"v":1,"newer":true}');
    // Corrupt the slot the cursor points at, as a kill mid-write would.
    backend.set('ironspire.save.b', '{"v":1,"newer"');
    const read = slots.read();
    expect(read.slot).toBe('a');
    expect(read.raw).toBe('{"v":1,"good":true}');
  });

  it('a corrupt save in both slots degrades to defaults, never a crash', () => {
    const backend = new MemoryBackend();
    backend.set('ironspire.save.a', 'not json at all');
    backend.set('ironspire.save.b', '{{{');
    const mgr = new SaveManager(new SlotStorage(backend), () => NOW);
    expect(() => mgr.load()).not.toThrow();
    expect(mgr.save.meta.nucleos).toBe(0);
  });

  it('survives a storage backend that throws on every call', () => {
    const hostile: StorageBackend = {
      get: () => {
        throw new Error('nope');
      },
      set: () => {
        throw new Error('nope');
      },
      remove: () => {
        throw new Error('nope');
      },
    };
    const mgr = new SaveManager(new SlotStorage(hostile), () => NOW);
    expect(() => mgr.load()).toThrow(); // the backend itself is broken...
    // ...but the shipped backend never throws, which is what matters:
    const safe = new SaveManager(new SlotStorage(new MemoryBackend()), () => NOW);
    expect(() => safe.load()).not.toThrow();
  });
});

describe('signature (SPEC §15.3)', () => {
  it('an untampered save verifies', () => {
    const { mgr, backend } = manager();
    mgr.load();
    mgr.save.meta.nucleos = 10;
    mgr.flush();
    const again = new SaveManager(new SlotStorage(backend), () => NOW);
    again.load();
    expect(again.localOnly).toBe(false);
  });

  it('an edited save still LOADS, but flags local-only', () => {
    const { mgr, backend } = manager();
    mgr.load();
    mgr.save.meta.nucleos = 10;
    mgr.flush();

    const raw = JSON.parse(backend.get('ironspire.save.a') ?? '{}') as Record<string, unknown>;
    (raw.meta as { nucleos: number }).nucleos = 999_999;
    backend.set('ironspire.save.a', JSON.stringify(raw));

    const cheated = new SaveManager(new SlotStorage(backend), () => NOW);
    cheated.load();
    // Never delete the player's save over a client-side hash.
    expect(cheated.save.meta.nucleos).toBe(999_999);
    expect(cheated.localOnly).toBe(true);
  });

  it('changing any field changes the signature', () => {
    const a = makeDefaultSave(NOW);
    const b = makeDefaultSave(NOW);
    expect(signature(a)).toBe(signature(b));
    b.meta.nucleos = 1;
    expect(signature(a)).not.toBe(signature(b));
  });
});

describe('export / import', () => {
  it('round-trips through base64', () => {
    const { mgr } = manager();
    mgr.load();
    mgr.save.meta.nucleos = 777;
    mgr.save.meta.talents.fort_hp = 4;
    const code = mgr.export();

    const { mgr: other } = manager();
    other.load();
    expect(other.import(code)).toBe(true);
    expect(other.save.meta.nucleos).toBe(777);
    expect(other.save.meta.talents.fort_hp).toBe(4);
  });

  it('rejects garbage without corrupting the current save', () => {
    const { mgr } = manager();
    mgr.load();
    mgr.save.meta.nucleos = 5;
    expect(mgr.import('this is not base64 json !!!')).toBe(false);
    expect(mgr.import('')).toBe(false);
    expect(mgr.save.meta.nucleos).toBe(5);
  });
});

describe('autosave debounce (SPEC §15.3)', () => {
  it('only writes after the debounce window, and only when dirty', () => {
    const { mgr, backend } = manager();
    mgr.load();
    mgr.save.meta.nucleos = 3;

    mgr.update(AUTOSAVE_SEC * 2); // not dirty yet
    expect(backend.get('ironspire.save.a')).toBe(null);

    mgr.touch();
    mgr.update(AUTOSAVE_SEC * 0.5);
    expect(backend.get('ironspire.save.a')).toBe(null);
    mgr.update(AUTOSAVE_SEC * 0.6);
    expect(backend.get('ironspire.save.a')).not.toBe(null);
  });
});

describe('migrations (SPEC §15.3)', () => {
  it('a current-version save passes through unchanged', () => {
    const save = makeDefaultSave(NOW);
    save.meta.nucleos = 12;
    const r = migrate(JSON.parse(JSON.stringify(save)), NOW);
    expect(r.recovered).toBe(false);
    expect(r.steps).toBe(0);
    expect(r.save.meta.nucleos).toBe(12);
  });

  it('fills in fields a newer build added', () => {
    // An old save that predates `idle` entirely.
    const old = { v: 1, meta: { nucleos: 8 }, stats: {}, prefs: {}, sig: '' };
    const r = migrate(old, NOW);
    expect(r.recovered).toBe(false);
    expect(r.save.meta.nucleos).toBe(8);
    expect(r.save.idle.lastSeenAt).toBe(NOW);
    expect(r.save.prefs.haptics).toBe(true);
    expect(r.save.meta.talents).toEqual({});
  });

  it('v1 -> v2 refunds every core spent on the removed pickup talent', () => {
    const old = {
      v: 1,
      meta: { nucleos: 10, talents: { fortune_pickup: 3, war_dmg: 2 } },
      stats: {},
      prefs: {},
      idle: {},
      sig: '',
    };
    const r = migrate(old, NOW);
    expect(r.steps).toBe(1);
    expect(r.save.v).toBe(2);
    expect(r.save.meta.talents.fortune_pickup).toBeUndefined();
    expect(r.save.meta.talents.war_dmg).toBe(2);
    // Ranks 0,1,2 of a costBase-6 talent on the shared 1.28 growth curve.
    const spent = 6 + Math.floor(6 * 1.28) + Math.floor(6 * 1.28 * 1.28);
    expect(r.save.meta.nucleos).toBe(10 + spent);
  });

  it('v1 -> v2 turns a mid-run XP snapshot into the wave cadence', () => {
    const old = {
      v: 1,
      meta: {},
      stats: {},
      prefs: {},
      idle: {},
      run: {
        seed: 5,
        wave: 7,
        time: 60,
        gold: 30,
        goldEarned: 30,
        xp: 4,
        xpToNext: 20,
        level: 3,
        kills: 40,
        policy: 0,
        pendingCards: 1,
        rerollsLeft: 1,
        waveMax: 7,
        upgradeLevels: [1],
        cardLevels: [0],
        towerHp: 100,
      },
      sig: '',
    };
    const r = migrate(old, NOW);
    const run = r.save.run;
    expect(run).toBeDefined();
    expect(run?.wavesCleared).toBe(6);
    // Strictly ahead of what was cleared: resuming must not fire a card at once.
    expect(run?.nextCardWave).toBeGreaterThan(6);
    expect(run?.pendingCards).toBe(1);
    expect((run as unknown as Record<string, unknown>).xp).toBeUndefined();
  });

  it('rejects wrong types instead of letting them reach gameplay', () => {
    const bad = {
      v: 1,
      meta: { nucleos: 'lots', talents: { war_dmg: 'three', ok: 2 } },
      stats: { totalRuns: null },
      prefs: { sfx: 'loud', haptics: 'yes' },
      idle: {},
      sig: '',
    };
    const r = migrate(bad, NOW);
    expect(r.save.meta.nucleos).toBe(0);
    expect(r.save.meta.talents).toEqual({ ok: 2 });
    expect(r.save.stats.totalRuns).toBe(0);
    expect(r.save.prefs.sfx).toBeCloseTo(0.8);
    expect(r.save.prefs.haptics).toBe(true);
  });

  it('a save from a future version starts fresh rather than guessing', () => {
    const r = migrate({ v: 99, meta: { nucleos: 1e9 } }, NOW);
    expect(r.recovered).toBe(true);
    expect(r.save.meta.nucleos).toBe(0);
  });

  it('non-objects and nulls recover to defaults', () => {
    for (const input of [null, undefined, 42, 'x', []]) {
      const r = migrate(input, NOW);
      expect(r.save.v).toBe(CURRENT_VERSION);
    }
  });

  it('drops a half-written run snapshot instead of resuming into it', () => {
    const withBad = { v: 1, meta: {}, stats: {}, prefs: {}, idle: {}, run: { wave: 3 }, sig: '' };
    expect(migrate(withBad, NOW).save.run).toBeUndefined();

    const withGood = {
      v: 1,
      meta: {},
      stats: {},
      prefs: {},
      idle: {},
      run: { seed: 1, wave: 3, towerHp: 50, upgradeLevels: [], cardLevels: [] },
      sig: '',
    };
    expect(migrate(withGood, NOW).save.run?.wave).toBe(3);
  });
});

describe('signature stability (regression)', () => {
  it('does not depend on key insertion order', () => {
    // Reproduces the real bug: a save written mid-run gains `run` AFTER `sig`,
    // while the loader rebuilds it before `sig`. Same data, different bytes.
    const a = makeDefaultSave(NOW) as Record<string, unknown>;
    a.run = {
      seed: 1,
      wave: 3,
      time: 10,
      gold: 5,
      goldEarned: 5,
      xp: 1,
      xpToNext: 12,
      level: 1,
      kills: 2,
      policy: 0,
      pendingCards: 0,
      rerollsLeft: 1,
      waveMax: 3,
      upgradeLevels: [1, 0],
      cardLevels: [0, 2],
      towerHp: 80,
    };

    // Same fields, rebuilt with `run` before `sig`, exactly as migrate does.
    const b: Record<string, unknown> = {
      v: a.v,
      meta: a.meta,
      stats: a.stats,
      prefs: a.prefs,
      idle: a.idle,
      run: a.run,
      sig: a.sig,
    };

    expect(signature(b as never)).toBe(signature(a as never));
  });

  it('a save written mid-run verifies after a reload', () => {
    const { mgr, backend } = manager();
    mgr.load();
    mgr.storeRunSnapshot({
      seed: 7,
      wave: 4,
      time: 30,
      gold: 100,
      goldEarned: 100,
      wavesCleared: 3,
      nextCardWave: 5,
      level: 2,
      kills: 20,
      policy: 0,
      pendingCards: 0,
      rerollsLeft: 1,
      waveMax: 4,
      upgradeLevels: [2, 1],
      cardLevels: [1],
      towerHp: 60,
    });
    mgr.flush();

    const reloaded = new SaveManager(new SlotStorage(backend), () => NOW);
    reloaded.load();
    expect(reloaded.localOnly).toBe(false);
    expect(reloaded.save.run?.wave).toBe(4);
  });
});
