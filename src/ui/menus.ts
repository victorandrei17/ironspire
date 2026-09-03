import { el, button, setText, show } from './dom.ts';
import { fmt, fmtTime } from '../core/format.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';

/**
 * Menu, pause and result screens (SPEC §12.6).
 *
 * One modal at a time, always (SPEC §11.2 rule 7): each screen owns its own
 * root and the scene manager shows exactly one.
 */

export class MainMenu {
  readonly root: HTMLDivElement;

  private readonly resumeBtn: HTMLButtonElement;
  private readonly coreLabel: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    onPlay: () => void,
    onTalents: () => void,
    onResume: () => void,
  ) {
    this.root = el('div', 'modal menu', parent);
    this.root.hidden = true;
    const title = el('div', 'game-title', this.root);
    title.textContent = 'IRON SPIRE';
    const sub = el('div', 'game-sub', this.root);
    sub.textContent = 'Fique. Fique mais forte que elas.';

    // Resume comes first when it exists: a player who closed mid-run wants
    // their run back, not a fresh one.
    this.resumeBtn = button('CONTINUAR RUN', 'primary interactive', this.root);
    this.resumeBtn.hidden = true;
    this.resumeBtn.addEventListener('click', () => {
      haptic(HAPTIC.Medium);
      onResume();
    });

    const play = button('JOGAR', 'primary interactive', this.root);
    play.addEventListener('click', () => {
      haptic(HAPTIC.Medium);
      onPlay();
    });
    const talents = button('TALENTOS', 'interactive', this.root);
    talents.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onTalents();
    });

    this.coreLabel = el('div', 'menu-cores', this.root);
  }

  render(cores: number, bestWave: number, canResume: boolean): void {
    show(this.resumeBtn, canResume);
    setText(
      this.coreLabel,
      bestWave > 0 ? `◈ ${fmt(cores)}  ·  melhor onda ${bestWave}` : `◈ ${fmt(cores)}`,
    );
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}

export class PauseScreen {
  readonly root: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    onResume: () => void,
    onQuit: () => void,
    onOptions: () => void,
  ) {
    this.root = el('div', 'modal pause', parent);
    this.root.hidden = true;
    const title = el('div', 'modal-title', this.root);
    title.textContent = 'PAUSA';

    const resume = button('CONTINUAR', 'primary interactive', this.root);
    resume.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onResume();
    });
    // Retreat pays full reward on purpose: punishing the exit makes players
    // leave the app running in a pocket, which burns battery and metrics
    // (SPEC §2.3).
    const opts = button('OPÇÕES', 'interactive', this.root);
    opts.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onOptions();
    });
    const quit = button('RETIRAR-SE (100% da recompensa)', 'interactive', this.root);
    quit.addEventListener('click', () => {
      haptic(HAPTIC.Medium);
      onQuit();
    });
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}

export type RunResult = {
  wave: number;
  kills: number;
  timeSec: number;
  gold: number;
  cores: number;
  died: boolean;
};

export class ResultScreen {
  readonly root: HTMLDivElement;

  private readonly title: HTMLDivElement;
  private readonly waveEl: HTMLSpanElement;
  private readonly killsEl: HTMLSpanElement;
  private readonly timeEl: HTMLSpanElement;
  private readonly goldEl: HTMLSpanElement;
  private readonly coresEl: HTMLSpanElement;

  constructor(parent: HTMLElement, onAgain: () => void, onMenu: () => void) {
    this.root = el('div', 'modal result', parent);
    this.root.hidden = true;
    this.title = el('div', 'modal-title', this.root);

    const stats = el('div', 'result-stats', this.root);
    this.waveEl = statRow(stats, 'Onda alcançada');
    this.killsEl = statRow(stats, 'Abates');
    this.timeEl = statRow(stats, 'Tempo');
    this.goldEl = statRow(stats, 'Ouro ganho');
    this.coresEl = statRow(stats, 'Núcleos ◈');

    const again = button('JOGAR DE NOVO', 'primary interactive', this.root);
    again.addEventListener('click', () => {
      haptic(HAPTIC.Medium);
      onAgain();
    });
    const menu = button('MENU', 'interactive', this.root);
    menu.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onMenu();
    });
  }

  render(r: RunResult): void {
    setText(this.title, r.died ? 'A TORRE CAIU' : 'RETIRADA');
    setText(this.waveEl, String(r.wave));
    setText(this.killsEl, fmt(r.kills));
    setText(this.timeEl, fmtTime(r.timeSec));
    setText(this.goldEl, fmt(r.gold));
    setText(this.coresEl, fmt(r.cores));
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}

function statRow(parent: HTMLElement, label: string): HTMLSpanElement {
  const row = el('div', 'stat-row', parent);
  const l = el('span', 'stat-label', row);
  l.textContent = label;
  return el('span', 'stat-value', row);
}

/** Small top-bar controls that live outside the modals. */
export class TopBar {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onPause: () => void) {
    this.root = el('div', 'topbar', parent);
    const pause = button('⏸', 'icon-btn interactive', this.root);
    pause.setAttribute('aria-label', 'Pausar');
    pause.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onPause();
    });
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}
