/**
 * The damage queue (SPEC §12.3).
 *
 * Storage only — no game rules. `systems/damage.ts` owns resolution. The split
 * exists so `entities/World` can hold the queue without importing a system,
 * which would point the dependency arrow backwards (CLAUDE.md §3).
 *
 * No system anywhere touches HP; they all push here. Damage scattered across
 * systems is where half the bugs in this genre live: two systems both handling
 * one death, order-dependent kills, a reward granted twice.
 */

export const DMG_TARGET_ENEMY = 0;
export const DMG_TARGET_TOWER = 1;

export const DMG_FLAG = {
  /** Eligible for a critical hit roll. */
  CanCrit: 1 << 0,
  /** Came from a projectile — blocked while a wraith is phased out. */
  Projectile: 1 << 1,
  /** Melee contact — triggers thorns when it lands on the tower. */
  Melee: 1 << 2,
  /** Area effect — ignores the warden's directional shield. */
  Area: 1 << 3,
  /** Already critical; skip the roll (chain jumps inherit the parent's crit). */
  PreCrit: 1 << 4,
} as const;

const QUEUE_CAP = 512;

export class DamageQueue {
  readonly targetKind = new Uint8Array(QUEUE_CAP);
  readonly targetHandle = new Int32Array(QUEUE_CAP);
  readonly amount = new Float32Array(QUEUE_CAP);
  readonly flags = new Uint16Array(QUEUE_CAP);
  /** Where the hit came from — used for the warden cone and for thorns. */
  readonly srcX = new Float32Array(QUEUE_CAP);
  readonly srcY = new Float32Array(QUEUE_CAP);

  /** Entries currently queued. The resolver reads this as it goes, so hits
   *  pushed *during* resolution (thorns, explosions) land in the same tick. */
  length = 0;
  /** Entries dropped because the queue filled. Diagnostic only. */
  overflow = 0;

  push(
    kind: number,
    handle: number,
    amount: number,
    flags: number,
    srcX: number,
    srcY: number,
  ): void {
    if (this.length >= QUEUE_CAP) {
      this.overflow++;
      return;
    }
    const i = this.length++;
    this.targetKind[i] = kind;
    this.targetHandle[i] = handle;
    this.amount[i] = amount;
    this.flags[i] = flags;
    this.srcX[i] = srcX;
    this.srcY[i] = srcY;
  }

  clear(): void {
    this.length = 0;
  }

  get capacity(): number {
    return QUEUE_CAP;
  }
}
