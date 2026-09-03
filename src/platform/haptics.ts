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

/** Set by the native bridge at boot. Web keeps the vibration fallback. */
type NativeHaptics = { impact(options: { style: string }): Promise<void> };
const NATIVE_STYLE = ['LIGHT', 'MEDIUM', 'HEAVY'] as const;
let native: NativeHaptics | null = null;

export function setNativeHaptics(plugin: NativeHaptics | null): void {
  native = plugin;
}

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Set by the game so a tap can click as well as buzz, without ui/ knowing. */
let onTap: ((kind: HapticKind) => void) | null = null;

export function setTapListener(fn: (kind: HapticKind) => void): void {
  onTap = fn;
}

export function haptic(kind: HapticKind): void {
  onTap?.(kind);
  if (!enabled) return;
  if (native !== null) {
    // The native engine gives real taptic feedback; navigator.vibrate on iOS
    // does nothing at all.
    void native.impact({ style: NATIVE_STYLE[kind] ?? 'LIGHT' }).catch(() => undefined);
    return;
  }
  const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(DURATIONS[kind] ?? 8);
  } catch {
    // Some browsers throw when the page is not user-activated. Never fatal.
  }
}
