import { el, button, setText, setClass, show } from './dom.ts';
import type { SavePrefs } from '../save/schema.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';
import { t } from '../data/strings.ts';

/**
 * Options (SPEC §11.4, §15.3).
 *
 * Only controls that DO something today are here. A volume slider that moves
 * nothing until M7 is worse than no slider: it teaches the player the settings
 * screen lies.
 */
export class OptionsScreen {
  readonly root: HTMLDivElement;

  private readonly toggles: {
    key: 'haptics' | 'reduceFlash' | 'reduceShake' | 'lefty';
    node: HTMLButtonElement;
  }[] = [];
  private readonly scaleBtns: HTMLButtonElement[] = [];
  private readonly codeBox: HTMLTextAreaElement;
  private readonly statusEl: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly getPrefs: () => SavePrefs,
    private readonly onChanged: () => void,
    private readonly onExport: () => string,
    private readonly onImport: (code: string) => boolean,
    onClose: () => void,
  ) {
    this.root = el('div', 'modal options', parent);
    this.root.hidden = true;
    const title = el('div', 'modal-title', this.root);
    title.textContent = t('options.title');

    const list = el('div', 'option-list', this.root);
    this.addToggle(list, 'haptics', t('options.haptics'));
    this.addToggle(list, 'reduceFlash', t('options.reduceFlash'));
    this.addToggle(list, 'reduceShake', t('options.reduceShake'));
    this.addToggle(list, 'lefty', t('options.lefty'));

    const scaleRow = el('div', 'option-row', list);
    const scaleLabel = el('span', 'option-label', scaleRow);
    scaleLabel.textContent = t('options.uiScale');
    const scaleWrap = el('span', 'scale-wrap', scaleRow);
    // 0 = small, 1 = medium, 2 = large (SPEC §11.4).
    for (const [i, label] of ['P', 'M', 'G'].entries()) {
      const b = button(label, 'scale-btn interactive', scaleWrap);
      b.addEventListener('click', () => {
        haptic(HAPTIC.Light);
        this.getPrefs().uiScale = i;
        applyUiScale(i);
        this.onChanged();
        this.refresh();
      });
      this.scaleBtns.push(b);
    }

    const saveBox = el('div', 'option-save', this.root);
    const saveTitle = el('div', 'option-label', saveBox);
    saveTitle.textContent = t('options.backup');
    this.codeBox = el('textarea', 'save-code interactive', saveBox);
    this.codeBox.rows = 3;
    this.codeBox.spellcheck = false;
    this.codeBox.placeholder = 'Cole aqui um código para importar';

    const codeRow = el('div', 'option-row', saveBox);
    const exportBtn = button(t('options.export'), 'interactive', codeRow);
    exportBtn.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      this.codeBox.value = this.onExport();
      this.codeBox.select();
      setText(this.statusEl, t('options.exported'));
    });
    const importBtn = button(t('options.import'), 'interactive', codeRow);
    importBtn.addEventListener('click', () => {
      const ok = this.onImport(this.codeBox.value);
      haptic(ok ? HAPTIC.Medium : HAPTIC.Light);
      setText(this.statusEl, ok ? t('options.imported') : t('options.importFailed'));
      if (ok) this.onChanged();
    });
    this.statusEl = el('div', 'option-status', saveBox);

    const close = button(t('talents.back'), 'primary interactive', this.root);
    close.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onClose();
    });
  }

  private addToggle(
    parent: HTMLElement,
    key: 'haptics' | 'reduceFlash' | 'reduceShake' | 'lefty',
    label: string,
  ): void {
    const row = el('div', 'option-row', parent);
    const l = el('span', 'option-label', row);
    l.textContent = label;
    const b = button('', 'toggle interactive', row);
    b.addEventListener('click', () => {
      const prefs = this.getPrefs();
      prefs[key] = !prefs[key];
      haptic(HAPTIC.Light);
      this.onChanged();
      this.refresh();
    });
    this.toggles.push({ key, node: b });
  }

  refresh(): void {
    const prefs = this.getPrefs();
    for (const toggle of this.toggles) {
      const on = prefs[toggle.key];
      setText(toggle.node, on ? t('options.on') : t('options.off'));
      setClass(toggle.node, 'on', on);
    }
    for (let i = 0; i < this.scaleBtns.length; i++) {
      setClass(this.scaleBtns[i]!, 'on', i === prefs.uiScale);
    }
  }

  setVisible(v: boolean): void {
    show(this.root, v);
    if (v) {
      this.refresh();
      setText(this.statusEl, '');
    }
  }
}

/** Pushes the UI scale into the CSS variable the whole layout reads. */
export function applyUiScale(index: number): void {
  const scale = [0.9, 1, 1.15][index] ?? 1;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}
