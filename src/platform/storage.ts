/**
 * Key/value persistence (SPEC §15.1).
 *
 * Web uses localStorage; the native build swaps in Capacitor Preferences at M8
 * because the Android WebView's localStorage is NOT durable — it gets cleared
 * with app data. `save.ts` never learns which one it is talking to.
 */
const SLOT_A = 'ironspire.save.a';
const SLOT_B = 'ironspire.save.b';
const SLOT_CURSOR = 'ironspire.save.cursor';

/** Every key the game owns, so the native backend knows what to hydrate. */
export const ALL_KEYS = [SLOT_A, SLOT_B, SLOT_CURSOR] as const;


export type StorageBackend = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

/** Used when even localStorage throws (private mode, disabled site data). */
class MemoryBackend implements StorageBackend {
  private readonly map = new Map<string, string>();

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  remove(key: string): void {
    this.map.delete(key);
  }
}

class LocalStorageBackend implements StorageBackend {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or storage disabled. Losing a save is bad; crashing the
      // game on every autosave is worse.
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* see above */
    }
  }
}

/**
 * Capacitor Preferences, fronted by an in-memory mirror.
 *
 * Preferences is async and `SaveManager` is synchronous by design (it writes
 * from the fixed tick). So the whole store is read once at boot and kept in
 * memory; writes go to memory immediately and to the device in the background.
 *
 * This exists because the Android WebView's localStorage is NOT durable — it
 * is wiped with app data, which would silently delete a player's progress
 * (SPEC §15.1).
 */
class PreferencesBackend implements StorageBackend {
  private readonly mirror = new Map<string, string>();

  constructor(private readonly prefs: PreferencesPlugin) {}

  /** Loads every known key. Must be awaited before the first read. */
  async hydrate(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        const { value } = await this.prefs.get({ key });
        if (value !== null && value !== undefined) this.mirror.set(key, value);
      } catch {
        // A key that will not read is treated as absent, same as on web.
      }
    }
  }

  get(key: string): string | null {
    return this.mirror.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.mirror.set(key, value);
    void this.prefs.set({ key, value }).catch(() => undefined);
  }

  remove(key: string): void {
    this.mirror.delete(key);
    void this.prefs.remove({ key }).catch(() => undefined);
  }
}

export type PreferencesPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

/**
 * Builds the native backend and loads it. Returns null on web, where
 * localStorage is the right answer.
 */
export async function createNativeBackend(
  prefs: PreferencesPlugin,
): Promise<StorageBackend | null> {
  const backend = new PreferencesBackend(prefs);
  try {
    await backend.hydrate(ALL_KEYS);
    return backend;
  } catch {
    return null;
  }
}

export function defaultBackend(): StorageBackend {
  try {
    if (typeof localStorage === 'undefined') return new MemoryBackend();
    const probe = '__iron_spire_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageBackend();
  } catch {
    return new MemoryBackend();
  }
}

export { MemoryBackend };

export type SlotRead = {
  raw: string | null;
  slot: 'a' | 'b' | null;
};

/**
 * Double-slot writer (SPEC §15.3).
 *
 * Writes alternate between two keys so a process kill mid-write can only ever
 * corrupt the slot that was NOT the last good one. Reads prefer the newest
 * slot and fall back to the other when it fails to parse.
 */
export class SlotStorage {
  constructor(private readonly backend: StorageBackend = defaultBackend()) {}

  /** Returns the newest slot that parses as JSON, or null when neither does. */
  read(): SlotRead {
    const cursor = this.backend.get(SLOT_CURSOR);
    const order: Array<'a' | 'b'> = cursor === 'b' ? ['b', 'a'] : ['a', 'b'];
    for (const slot of order) {
      const raw = this.backend.get(slot === 'a' ? SLOT_A : SLOT_B);
      if (raw === null) continue;
      try {
        JSON.parse(raw);
        return { raw, slot };
      } catch {
        // Corrupt slot: keep going and try the other one.
      }
    }
    return { raw: null, slot: null };
  }

  /** Writes to the slot that is NOT the current one, then flips the cursor. */
  write(raw: string): 'a' | 'b' {
    const cursor = this.backend.get(SLOT_CURSOR);
    const next: 'a' | 'b' = cursor === 'a' ? 'b' : 'a';
    this.backend.set(next === 'a' ? SLOT_A : SLOT_B, raw);
    // Cursor last: if the process dies before this line, the previous slot is
    // still the one we read back.
    this.backend.set(SLOT_CURSOR, next);
    return next;
  }

  clear(): void {
    this.backend.remove(SLOT_A);
    this.backend.remove(SLOT_B);
    this.backend.remove(SLOT_CURSOR);
  }
}
