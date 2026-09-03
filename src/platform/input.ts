import type { Viewport } from '../render/viewport.ts';

export const PTR_DOWN = 0;
export const PTR_MOVE = 1;
export const PTR_UP = 2;

const QUEUE_CAP = 64;

/**
 * Pointer events are captured as they arrive and consumed once per tick.
 *
 * The queue is struct-of-arrays and fixed-size: an input burst (a 5-finger
 * mash) must not allocate mid-frame. Overflow drops the oldest events, which
 * is correct — a stale pointer position is worthless anyway.
 */
export class Input {
  private readonly type = new Uint8Array(QUEUE_CAP);
  private readonly id = new Int32Array(QUEUE_CAP);
  private readonly wx = new Float32Array(QUEUE_CAP);
  private readonly wy = new Float32Array(QUEUE_CAP);
  private head = 0;
  private tail = 0;

  /** Live pointers, for hold/multi-touch queries. Index = slot, not pointerId. */
  private readonly activeId = new Int32Array(10).fill(-1);
  private readonly activeX = new Float32Array(10);
  private readonly activeY = new Float32Array(10);
  private readonly activeHeld = new Float32Array(10);
  activeCount = 0;

  /** Set by the 4-finger gesture; the debug overlay consumes and clears it. */
  fourFingerTap = false;

  private detach: (() => void) | null = null;

  constructor(private readonly viewport: Viewport) {}

  attach(el: HTMLElement): void {
    const down = (e: PointerEvent): void => this.push(PTR_DOWN, e);
    const move = (e: PointerEvent): void => this.push(PTR_MOVE, e);
    const up = (e: PointerEvent): void => this.push(PTR_UP, e);
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', up, { passive: true });
    this.detach = (): void => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  private push(type: number, e: PointerEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const next = (this.tail + 1) % QUEUE_CAP;
    if (next === this.head) this.head = (this.head + 1) % QUEUE_CAP; // drop oldest
    this.type[this.tail] = type;
    this.id[this.tail] = e.pointerId;
    this.wx[this.tail] = this.viewport.screenToWorldX(sx);
    this.wy[this.tail] = this.viewport.screenToWorldY(sy);
    this.tail = next;
  }

  /**
   * Drains the queue into the active-pointer table. Called once per tick, first
   * thing (SPEC §12.3 step 1). The handler receives world coordinates.
   */
  flush(dt: number, onEvent?: (type: number, id: number, wx: number, wy: number) => void): void {
    while (this.head !== this.tail) {
      const i = this.head;
      const t = this.type[i] ?? PTR_UP;
      const pid = this.id[i] ?? -1;
      const x = this.wx[i] ?? 0;
      const y = this.wy[i] ?? 0;
      this.head = (this.head + 1) % QUEUE_CAP;

      if (t === PTR_DOWN) this.addActive(pid, x, y);
      else if (t === PTR_MOVE) this.moveActive(pid, x, y);
      else this.removeActive(pid);

      onEvent?.(t, pid, x, y);
    }
    for (let i = 0; i < this.activeId.length; i++) {
      if (this.activeId[i] !== -1) this.activeHeld[i] = (this.activeHeld[i] ?? 0) + dt;
    }
    // Four simultaneous fingers = debug overlay toggle (no keyboard on mobile).
    if (this.activeCount >= 4) this.fourFingerTap = true;
  }

  private addActive(pid: number, x: number, y: number): void {
    for (let i = 0; i < this.activeId.length; i++) {
      if (this.activeId[i] === -1) {
        this.activeId[i] = pid;
        this.activeX[i] = x;
        this.activeY[i] = y;
        this.activeHeld[i] = 0;
        this.activeCount++;
        return;
      }
    }
  }

  private moveActive(pid: number, x: number, y: number): void {
    for (let i = 0; i < this.activeId.length; i++) {
      if (this.activeId[i] === pid) {
        this.activeX[i] = x;
        this.activeY[i] = y;
        return;
      }
    }
  }

  private removeActive(pid: number): void {
    for (let i = 0; i < this.activeId.length; i++) {
      if (this.activeId[i] === pid) {
        this.activeId[i] = -1;
        this.activeHeld[i] = 0;
        this.activeCount--;
        return;
      }
    }
  }

  /** Seconds the pointer in `slot` has been held, or -1 if that slot is free. */
  heldSeconds(slot: number): number {
    return this.activeId[slot] === -1 ? -1 : (this.activeHeld[slot] ?? 0);
  }

  /** Releases every pointer — used when the app loses focus mid-touch. */
  clearActive(): void {
    this.activeId.fill(-1);
    this.activeHeld.fill(0);
    this.activeCount = 0;
    this.head = this.tail;
  }
}
