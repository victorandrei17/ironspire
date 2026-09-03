import { el, setText, show } from './dom.ts';
import { t } from '../data/strings.ts';
import type { StringKey } from '../data/strings.ts';

/**
 * Three contextual hints, shown once ever (SPEC §7 polish list).
 *
 * Not a tutorial sequence: no gates, no forced taps, no "press here to
 * continue". A hint appears when the thing it describes first becomes
 * relevant, and never again — which is why it is tied to the SAVE, not to
 * the run.
 */
type Hint = { id: string; key: StringKey };

const HINTS: readonly Hint[] = [
  { id: 'tut_upgrades', key: 'tutorial.upgrades' },
  { id: 'tut_cards', key: 'tutorial.cards' },
  { id: 'tut_nextwave', key: 'tutorial.nextWave' },
];

export class Tutorial {
  readonly root: HTMLDivElement;
  private timer = 0;

  constructor(
    parent: HTMLElement,
    private readonly seen: (id: string) => boolean,
    private readonly markSeen: (id: string) => void,
  ) {
    this.root = el('div', 'hint', parent);
    this.root.hidden = true;
  }

  /** Shows hint `index` if it has never been shown. */
  trigger(index: number): void {
    const hint = HINTS[index];
    if (hint === undefined || this.seen(hint.id)) return;
    this.markSeen(hint.id);
    setText(this.root, t(hint.key));
    show(this.root, true);
    this.timer = 5;
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) show(this.root, false);
  }
}

export const HINT_UPGRADES = 0;
export const HINT_CARDS = 1;
export const HINT_NEXT_WAVE = 2;
