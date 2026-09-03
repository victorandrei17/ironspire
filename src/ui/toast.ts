import { el, setText, show } from './dom.ts';

/**
 * Transient one-line notice (quality drops, autosave failures).
 *
 * Deliberately not a modal: these are things the player should notice without
 * having to acknowledge, and a dialog for "quality reduced" would be worse than
 * saying nothing.
 */
export class Toast {
  readonly root: HTMLDivElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'toast', parent);
    this.root.hidden = true;
  }

  show(message: string, seconds = 3): void {
    setText(this.root, message);
    show(this.root, true);
    this.timer = seconds;
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) show(this.root, false);
  }
}
