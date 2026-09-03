import { el } from './dom.ts';

/**
 * Scene fade and boot dismissal (SPEC §7 polish list).
 *
 * A CSS opacity transition, driven by a class: the compositor animates it, so a
 * transition never competes with the simulation for frame budget.
 */
const FADE_MS = 180;

export class Transition {
  private readonly fade: HTMLDivElement;
  private readonly boot: HTMLElement | null;

  constructor(parent: HTMLElement) {
    this.fade = el('div', '', parent);
    this.fade.id = 'fade';
    this.boot = document.getElementById('boot');
  }

  /** Fades out, runs `swap` while the screen is covered, then fades back in. */
  run(swap: () => void): void {
    this.fade.classList.add('on');
    window.setTimeout(() => {
      swap();
      // A second frame before clearing, so the swap has actually painted.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.fade.classList.remove('on'));
      });
    }, FADE_MS);
  }

  /** Removes the boot screen once the game has drawn its first real frame. */
  dismissBoot(): void {
    const boot = this.boot;
    if (boot === null || boot.classList.contains('gone')) return;
    boot.classList.add('gone');
    // Removed rather than left hidden: it is a full-screen layer the
    // compositor would otherwise keep around for the whole session.
    window.setTimeout(() => boot.remove(), 400);
  }
}
