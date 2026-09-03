/**
 * Typed event bus for system → UI notifications (CLAUDE.md §3).
 *
 * Payloads are three numbers, not an object, because `emit` runs inside the
 * simulation tick and must not allocate. Anything richer than three numbers
 * belongs in GameState; the event is only the notification that it changed.
 */

export const EV = {
  WaveStart: 0,
  WaveEnd: 1,
  EnemyKilled: 2,
  TowerDamaged: 3,
  TowerDied: 4,
  GoldChanged: 5,
  XpChanged: 6,
  LevelUp: 7,
  CardOffered: 8,
  CardPicked: 9,
  UpgradeBought: 10,
  BossSpawned: 11,
  BossKilled: 12,
  RunStarted: 13,
  RunEnded: 14,
  SceneChanged: 15,
  Shake: 16,
  Sfx: 17,
} as const;

export type EventType = (typeof EV)[keyof typeof EV];

export type Listener = (a: number, b: number, c: number) => void;

const EVENT_COUNT = 18;

/**
 * Fixed-size bucket-per-event bus. Listener arrays are created once at
 * construction; `emit` only indexes, never allocates.
 */
export class EventBus {
  private readonly buckets: Listener[][];
  /** Depth guard: mutating a bucket mid-dispatch is a footgun, so we defer removal. */
  private readonly pendingOff: Listener[][];
  private dispatching = 0;

  constructor() {
    this.buckets = new Array<Listener[]>(EVENT_COUNT);
    this.pendingOff = new Array<Listener[]>(EVENT_COUNT);
    for (let i = 0; i < EVENT_COUNT; i++) {
      this.buckets[i] = [];
      this.pendingOff[i] = [];
    }
  }

  on(type: EventType, fn: Listener): void {
    this.buckets[type]?.push(fn);
  }

  off(type: EventType, fn: Listener): void {
    if (this.dispatching > 0) {
      this.pendingOff[type]?.push(fn);
      return;
    }
    const b = this.buckets[type];
    if (b === undefined) return;
    const i = b.indexOf(fn);
    if (i >= 0) b.splice(i, 1);
  }

  emit(type: EventType, a = 0, b = 0, c = 0): void {
    const bucket = this.buckets[type];
    if (bucket === undefined) return;
    this.dispatching++;
    for (let i = 0; i < bucket.length; i++) {
      bucket[i]?.(a, b, c);
    }
    this.dispatching--;
    if (this.dispatching === 0) this.flushPendingOff(type);
  }

  private flushPendingOff(type: EventType): void {
    const pend = this.pendingOff[type];
    const bucket = this.buckets[type];
    if (pend === undefined || bucket === undefined || pend.length === 0) return;
    for (let i = 0; i < pend.length; i++) {
      const fn = pend[i];
      if (fn === undefined) continue;
      const j = bucket.indexOf(fn);
      if (j >= 0) bucket.splice(j, 1);
    }
    pend.length = 0;
  }

  /** Drops every listener. Used when tearing down a scene. */
  clear(): void {
    for (let i = 0; i < EVENT_COUNT; i++) {
      const b = this.buckets[i];
      if (b !== undefined) b.length = 0;
      const p = this.pendingOff[i];
      if (p !== undefined) p.length = 0;
    }
  }
}

/** The single bus instance for the running game. */
export const bus = new EventBus();
