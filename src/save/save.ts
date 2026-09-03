import { SlotStorage } from '../platform/storage.ts';
import { migrate } from './migrations.ts';
import { makeDefaultSave, type Save, type RunSnapshot } from './schema.ts';
import { AUTOSAVE_SEC } from '../core/constants.ts';

const SALT = 'iron-spire-v1';

/**
 * Save orchestration (SPEC §15).
 *
 * Owns the debounce, the signature and the load/repair path. It knows nothing
 * about where the bytes land — that is `SlotStorage`.
 */
export class SaveManager {
  save: Save;
  /**
   * True when the loaded save failed its signature check.
   *
   * The save still loads: a client-side hash cannot stop a determined cheater
   * and deleting a player's progress over it would be indefensible. It only
   * blocks anything that would be unfair to other players later (SPEC §15.3).
   */
  localOnly = false;
  /** Diagnostics for the debug overlay. */
  lastMigrationSteps = 0;
  loadedFromSlot: 'a' | 'b' | null = null;

  private dirty = false;
  private acc = 0;

  constructor(
    private readonly storage: SlotStorage = new SlotStorage(),
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.save = makeDefaultSave(this.clock());
  }

  /** Reads, migrates and verifies. Never throws — a bad file yields a fresh save. */
  load(): void {
    const now = this.clock();
    const { raw, slot } = this.storage.read();
    this.loadedFromSlot = slot;
    if (raw === null) {
      this.save = makeDefaultSave(now);
      return;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.save = makeDefaultSave(now);
      return;
    }
    const result = migrate(parsed, now);
    this.lastMigrationSteps = result.steps;
    this.save = result.save;
    this.localOnly = !result.recovered && !this.verify(this.save);
  }

  /** Marks the save dirty; the debounce decides when bytes actually move. */
  touch(): void {
    this.dirty = true;
  }

  /** Debounced autosave, driven from the fixed tick (SPEC §15.3). */
  update(dt: number): void {
    if (!this.dirty) return;
    this.acc += dt;
    if (this.acc < AUTOSAVE_SEC) return;
    this.flush();
  }

  /** Writes immediately. Called at wave end, on pause and on visibilitychange. */
  flush(): void {
    this.acc = 0;
    this.dirty = false;
    this.save.idle.lastSeenAt = this.clock();
    this.save.sig = signature(this.save);
    this.storage.write(JSON.stringify(this.save));
  }

  storeRunSnapshot(snapshot: RunSnapshot): void {
    this.save.run = snapshot;
    this.touch();
  }

  clearRunSnapshot(): void {
    delete this.save.run;
    this.touch();
  }

  /** Base64 export for the options screen — cheap to build, saves support time. */
  export(): string {
    this.save.sig = signature(this.save);
    return toBase64(JSON.stringify(this.save));
  }

  /** Returns true when the payload parsed into a usable save. */
  import(encoded: string): boolean {
    let json: string;
    try {
      json = fromBase64(encoded.trim());
    } catch {
      return false;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return false;
    }
    const result = migrate(parsed, this.clock());
    if (result.recovered) return false;
    this.save = result.save;
    this.localOnly = !this.verify(this.save);
    this.flush();
    return true;
  }

  private verify(save: Save): boolean {
    if (save.sig === '') return true; // never signed yet (fresh install)
    return signature(save) === save.sig;
  }

  reset(): void {
    this.storage.clear();
    this.save = makeDefaultSave(this.clock());
    this.localOnly = false;
    this.dirty = false;
  }
}

/**
 * FNV-1a over the payload with the signature field blanked.
 *
 * Deliberately not cryptographic: the secret ships with the client, so this
 * only raises the bar above "edit localStorage in devtools".
 *
 * The payload is serialised with SORTED KEYS. Plain JSON.stringify follows
 * insertion order, and a save written while a run snapshot existed puts `run`
 * after `sig`, while the loader rebuilds it before `sig` — same data, different
 * bytes, and every reload would have flagged the player's own save as tampered.
 */
export function signature(save: Save): string {
  const text = SALT + stableStringify({ ...save, sig: '' });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** JSON with object keys in sorted order, so the bytes depend only on the data. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    if (obj[key] === undefined) continue;
    parts.push(JSON.stringify(key) + ':' + stableStringify(obj[key]));
  }
  return '{' + parts.join(',') + '}';
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(encoded: string): string {
  const bin = atob(encoded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
