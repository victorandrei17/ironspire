import { Capacitor } from '@capacitor/core';

/**
 * The native bridge (SPEC §17.3).
 *
 * Every native call is optional and guarded. The same build runs as a web page,
 * a PWA and a packaged app, and the web path must never pay for — or break on —
 * a plugin that is not there.
 */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platformName(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

/**
 * Keeps the screen on during a run.
 *
 * Loaded dynamically because `@capacitor/keep-awake` is optional: it could not
 * be installed in this environment, and the game must not fail to build
 * because a screen-wake plugin is missing. Wire the real import here once the
 * package is available.
 */
type KeepAwakePlugin = { keepAwake: () => Promise<void>; allowSleep: () => Promise<void> };

let keepAwake: KeepAwakePlugin | null = null;
let keepAwakeTried = false;

async function loadKeepAwake(): Promise<KeepAwakePlugin | null> {
  if (keepAwakeTried) return keepAwake;
  keepAwakeTried = true;
  if (!isNative()) return null;
  try {
    // The specifier is built at runtime so TypeScript and the bundler do not
    // try to resolve a package that is intentionally optional.
    const name = ['@capacitor', 'keep-awake'].join('/');
    const mod: unknown = await import(/* @vite-ignore */ name);
    const plugin = (mod as { KeepAwake?: KeepAwakePlugin }).KeepAwake;
    keepAwake = plugin ?? null;
  } catch {
    keepAwake = null;
  }
  return keepAwake;
}

/** Screen stays awake only DURING a run — never on menus (SPEC §17.3). */
export function setScreenAwake(on: boolean): void {
  void loadKeepAwake().then((plugin) => {
    if (plugin === null) return;
    void (on ? plugin.keepAwake() : plugin.allowSleep()).catch(() => undefined);
  });
}
