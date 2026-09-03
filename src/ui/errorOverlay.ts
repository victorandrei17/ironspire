import { el, button, setText, show } from './dom.ts';
import { t } from '../data/strings.ts';

/**
 * Global error surface (SPEC §7 polish list).
 *
 * A white screen tells the player nothing and loses their trust permanently.
 * This tells them their progress is safe, gives them the report, and offers
 * the one action that helps.
 */
export class ErrorOverlay {
  readonly root: HTMLDivElement;

  private readonly bodyEl: HTMLDivElement;
  private readonly detailEl: HTMLPreElement;
  private readonly statusEl: HTMLDivElement;
  private report = '';
  private shown = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'modal error-overlay', parent);
    this.root.hidden = true;
    const title = el('div', 'modal-title', this.root);
    title.textContent = t('error.title');
    this.bodyEl = el('div', 'error-body', this.root);
    this.bodyEl.textContent = t('error.body');
    this.detailEl = el('pre', 'error-detail', this.root);

    const copy = button(t('error.copy'), 'interactive', this.root);
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.report).then(
        () => setText(this.statusEl, t('error.copied')),
        () => {
          // Clipboard can be blocked; selecting the text still lets them copy.
          const range = document.createRange();
          range.selectNodeContents(this.detailEl);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        },
      );
    });
    const reload = button(t('error.reload'), 'primary interactive', this.root);
    reload.addEventListener('click', () => window.location.reload());
    this.statusEl = el('div', 'option-status', this.root);
  }

  /**
   * Installs the global handlers. Only the FIRST error is shown: an error in a
   * render loop fires sixty times a second and would bury the original.
   */
  install(context: () => string): void {
    const handle = (message: string, stack: string): void => {
      if (this.shown) return;
      this.shown = true;
      this.report = `${message}\n${stack}\n---\n${context()}`;
      setText(this.detailEl, this.report.slice(0, 1200));
      show(this.root, true);
    };
    window.addEventListener('error', (e) => {
      handle(String(e.message), e.error instanceof Error ? (e.error.stack ?? '') : '');
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason: unknown = e.reason;
      handle(
        reason instanceof Error ? reason.message : String(reason),
        reason instanceof Error ? (reason.stack ?? '') : '',
      );
    });
  }
}
