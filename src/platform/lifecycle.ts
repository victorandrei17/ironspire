/**
 * App lifecycle: visibility, focus, and the timestamp bookkeeping the offline
 * reward depends on (SPEC §10.2). Web-only here; Capacitor's pause/resume hooks
 * into the same callbacks in M8.
 */
export type LifecycleHandlers = {
  onPause: () => void;
  onResume: (awaySeconds: number) => void;
};

export class Lifecycle {
  /** Wall-clock ms at the moment we went to background. 0 = never. */
  lastHiddenAt = 0;
  paused = false;

  private detach: (() => void) | null = null;

  constructor(
    private readonly handlers: LifecycleHandlers,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  attach(): void {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.pause();
      else this.resume();
    };
    const onBlur = (): void => this.pause();
    const onFocus = (): void => this.resume();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    this.detach = (): void => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.lastHiddenAt = this.clock();
    this.handlers.onPause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const now = this.clock();
    // Clock moved backwards (user changed the device clock): treat as 0 away.
    const away = this.lastHiddenAt > 0 && now > this.lastHiddenAt ? (now - this.lastHiddenAt) / 1000 : 0;
    this.handlers.onResume(away);
  }
}
