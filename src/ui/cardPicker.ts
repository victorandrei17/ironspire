import { el, setText, setClass, show } from './dom.ts';
import type { RunState } from '../core/state.ts';
import type { CardOffer } from '../systems/cards.ts';
import { CARDS, RARITY_NAME } from '../data/cards.ts';
import { OFFER_SIZE } from '../systems/cards.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';
import { t } from '../data/strings.ts';

const RARITY_CLASS = ['r-common', 'r-rare', 'r-epic', 'r-legend'] as const;

/**
 * The level-up card screen (SPEC §8.1).
 *
 * No timer, by design: mobile play gets interrupted, and a countdown on a
 * decision screen punishes the player for living their life.
 */
export class CardPicker {
  readonly root: HTMLDivElement;

  private readonly cards: HTMLButtonElement[] = [];
  private readonly names: HTMLSpanElement[] = [];
  private readonly descs: HTMLSpanElement[] = [];
  private readonly rarities: HTMLSpanElement[] = [];
  private readonly levels: HTMLSpanElement[] = [];
  private readonly rerollBtn: HTMLButtonElement;
  private readonly title: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly onPick: (slot: number) => void,
    private readonly onReroll: () => void,
  ) {
    this.root = el('div', 'modal card-picker', parent);
    this.root.hidden = true;

    this.title = el('div', 'modal-title', this.root);
    this.title.textContent = t('cards.title');

    const list = el('div', 'card-list', this.root);
    for (let i = 0; i < OFFER_SIZE; i++) {
      const b = el('button', 'card interactive', list);
      b.type = 'button';
      const rarity = el('span', 'card-rarity', b);
      const name = el('span', 'card-name', b);
      const desc = el('span', 'card-desc', b);
      const level = el('span', 'card-level', b);
      const slot = i;
      b.addEventListener('click', () => {
        haptic(HAPTIC.Medium);
        this.onPick(slot);
      });
      this.cards.push(b);
      this.names.push(name);
      this.descs.push(desc);
      this.rarities.push(rarity);
      this.levels.push(level);
    }

    this.rerollBtn = el('button', 'reroll interactive', this.root);
    this.rerollBtn.type = 'button';
    this.rerollBtn.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      this.onReroll();
    });
  }

  /** Renders the current offer. Called when it opens and after a reroll. */
  render(offer: CardOffer, run: RunState): void {
    for (let i = 0; i < OFFER_SIZE; i++) {
      const b = this.cards[i];
      if (b === undefined) continue;
      const idx = offer.slots[i] ?? -1;
      const def = idx >= 0 ? CARDS[idx] : undefined;
      if (def === undefined) {
        show(b, false);
        continue;
      }
      show(b, true);
      // The level shown is what the card WILL be after taking it.
      const nextLevel = (run.cardLevels[idx] ?? 0) + 1;
      setText(this.names[i]!, def.name);
      setText(this.descs[i]!, def.desc(nextLevel));
      setText(this.rarities[i]!, RARITY_NAME[def.rarity] ?? '');
      setText(this.levels[i]!, nextLevel > 1 ? `${t('hud.level')}${nextLevel}/${def.maxLevel}` : t('cards.new'));
      for (const cls of RARITY_CLASS) setClass(b, cls, false);
      setClass(b, RARITY_CLASS[def.rarity] ?? 'r-common', true);
    }

    setText(this.rerollBtn, `${t('cards.reroll')} (${run.rerollsLeft})`);
    setClass(this.rerollBtn, 'dim', run.rerollsLeft <= 0);
    setText(
      this.title,
      run.pendingCards > 1
        ? `${t('cards.title')} ${run.level}  ·  ${run.pendingCards}`
        : `${t('cards.title')} ${run.level}`,
    );
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}
