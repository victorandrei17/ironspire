import { isNative } from './native.ts';
import { setNativeHaptics } from './haptics.ts';
import { createNativeBackend, type StorageBackend } from './storage.ts';

/**
 * Wires the native plugins at boot (SPEC §17.3).
 *
 * Everything here is best-effort. The web build takes the same path and simply
 * gets nulls, which is why every consumer already handles their absence.
 */
export type NativeBoot = {
  storage: StorageBackend | null;
  /** Android hardware back button. Returns true if the app should exit. */
  onBackButton: ((handler: () => boolean) => void) | null;
  /** Called when the OS suspends or resumes the app. */
  onLifecycle: ((pause: () => void, resume: () => void) => void) | null;
  hideSplash: (() => void) | null;
};

export async function bootNative(): Promise<NativeBoot> {
  const out: NativeBoot = {
    storage: null,
    onBackButton: null,
    onLifecycle: null,
    hideSplash: null,
  };
  if (!isNative()) return out;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    out.storage = await createNativeBackend(Preferences);
  } catch {
    // Falls back to localStorage, which still works inside the WebView — it is
    // just not durable, which is what the double slot already hedges against.
  }

  try {
    const { Haptics } = await import('@capacitor/haptics');
    setNativeHaptics(Haptics as unknown as { impact(o: { style: string }): Promise<void> });
  } catch {
    /* web vibration fallback stays */
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  } catch {
    /* no status bar to style */
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    out.hideSplash = (): void => void SplashScreen.hide().catch(() => undefined);
  } catch {
    out.hideSplash = null;
  }

  try {
    const { App } = await import('@capacitor/app');
    out.onBackButton = (handler): void => {
      void App.addListener('backButton', () => {
        // Android's back button must always do something sensible: close the
        // top modal, or ask before leaving from the root (SPEC §11.2 rule 8).
        if (handler()) void App.exitApp();
      });
    };
    out.onLifecycle = (pause, resume): void => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) resume();
        else pause();
      });
    };
  } catch {
    /* web lifecycle listeners already cover this case */
  }

  return out;
}
