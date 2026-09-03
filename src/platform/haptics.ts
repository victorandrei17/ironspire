/**
 * Haptic feedback (SPEC §11.2 rule 4).
 *
 * Web vibration today; the Capacitor Haptics plugin swaps in behind this same
 * interface at M8. Absence is never an error — a device without a vibrator
 * simply gets nothing.
 */
export const HAPTIC = {
  Light: 0,
  Medium: 1,
  Heavy: 2,
} as const;

export type HapticKind = (typeof HAPTIC)[keyof typeof HAPTIC];

const DURATIONS = [8, 18, 32] as const;

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(DURATIONS[kind] ?? 8);
  } catch {
    // Some browsers throw when the page is not user-activated. Never fatal.
  }
}
