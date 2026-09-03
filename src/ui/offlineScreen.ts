import { el, button, setText, show } from './dom.ts';
import type { OfflineReward } from '../systems/meta.ts';
import { fmt, fmtDuration } from '../core/format.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';
import { t } from '../data/strings.ts';

/**
 * The "welcome back" screen (SPEC §10.2).
 *
 * Shown only when the reward is worth showing: a modal for eleven gold trains
 * the player to dismiss it without reading, which kills the one screen that is
 * supposed to make coming back feel good.
 */
export class OfflineScreen {
  readonly root: HTMLDivElement;

  private readonly awayEl: HTMLDivElement;
  private readonly goldEl: HTMLSpanElement;
  private readonly coreEl: HTMLSpanElement;
  private readonly noteEl: HTMLDivElement;

  constructor(parent: HTMLElement, onClaim: () => void) {
    this.root = el('div', 'modal offline', parent);
    this.root.hidden = true;
    const title = el('div', 'modal-title', this.root);
    title.textContent = t('offline.title');
    this.awayEl = el('div', 'offline-away', this.root);

    const rewards = el('div', 'offline-rewards', this.root);
    this.goldEl = el('span', 'offline-gold', rewards);
    this.coreEl = el('span', 'offline-cores', rewards);
    this.noteEl = el('div', 'offline-note', this.root);

    const claim = button(t('offline.claim'), 'primary interactive', this.root);
    claim.addEventListener('click', () => {
      haptic(HAPTIC.Medium);
      onClaim();
    });
  }

  render(reward: OfflineReward): void {
    setText(this.awayEl, `${t('offline.away')} ${fmtDuration(reward.seconds)}`);
    setText(this.goldEl, `🪙 ${fmt(reward.gold)}`);
    setText(this.coreEl, `◈ ${fmt(reward.nucleos)}`);
    // Telling the player they hit the cap is what sells the Fortune talent.
    const capped = reward.seconds >= reward.cappedAt - 1 && reward.cappedAt > 0;
    setText(
      this.noteEl,
      capped ? `${t('offline.capped')} (${fmtDuration(reward.cappedAt)})` : '',
    );
    show(this.noteEl, capped);
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}
