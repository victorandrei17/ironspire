/**
 * Key/value persistence (SPEC §15.1).
 *
 * Web uses localStorage; the native build swaps in Capacitor Preferences at M8
 * because the Android WebView's localStorage is NOT durable — it gets cleared
 * with app data. `save.ts` never learns which one it is talking to.
 */
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

const SLOT_A = 'ironspire.save.a';
const SLOT_B = 'ironspire.save.b';
const SLOT_CURSOR = 'ironspire.save.cursor';

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
