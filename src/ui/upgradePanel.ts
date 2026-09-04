import { el, setText, setVar, setClass, show } from './dom.ts';
import type { RunState } from '../core/state.ts';
import { ST, type TowerStats } from '../entities/tower.ts';
import { UPGRADES } from '../data/upgrades.ts';
import { costOf, isMaxed, buyUpgrade, buyMax, maxAffordable } from '../systems/upgrades.ts';
import { fmt } from '../core/format.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';
import { t } from '../data/strings.ts';

/** Hold this long before auto-repeat kicks in (SPEC §7.2). */
const HOLD_DELAY = 0.4;
/** Then buy this often while the finger stays down. */
const REPEAT_PERIOD = 0.09;

/**
 * The 4x2 upgrade grid (SPEC §7.2, §11.1).
 *
 * Buttons dim when unaffordable but NEVER disappear: a grid that reflows under
 * the thumb is how you get mis-taps, and the player needs to see what they are
 * saving for.
 */
export class UpgradePanel {
  readonly root: HTMLDivElement;

  private readonly buttons: HTMLButtonElement[] = [];
  private readonly names: HTMLSpanElement[] = [];
  private readonly levels: HTMLSpanElement[] = [];
  private readonly costs: HTMLSpanElement[] = [];
  private readonly maxBtn: HTMLButtonElement;
  private readonly nextWaveBtn: HTMLButtonElement;
  private readonly nextWaveFill: HTMLDivElement;
  private readonly nextWaveLabel: HTMLSpanElement;
  private readonly nextWaveBonus: HTMLSpanElement;

  /** Index being held, or -1. */
  private holding = -1;
  private holdT = 0;
  private repeatT = 0;
  /** When true, a press buys as many levels as the gold allows. */
  private maxMode = false;
  /** Mirrors the wave system: a press before the timer fills does nothing. */
  private nextWaveReady = false;

  constructor(
    parent: HTMLElement,
    private readonly run: RunState,
    private readonly stats: TowerStats,
    /** Talent-discounted price multiplier, read fresh on every refresh. */
    private readonly costMult: () => number,
    private readonly onNextWave: () => void,
    /**
     * Called after any purchase, with the tower's max HP from before it.
     *
     * Buying VIDA heals by the amount it adds — the same rule the hp_up card
     * has always had. Without it the button is a trap mid-wave: it raises the
     * ceiling while the player is dying under it, which is when they press it.
     */
    private readonly onBought: (previousMaxHp: number) => void,
  ) {
    this.root = el('div', 'upgrades', parent);

    const grid = el('div', 'upgrade-grid', this.root);
    for (let i = 0; i < UPGRADES.length; i++) {
      const def = UPGRADES[i];
      if (def === undefined) continue;
      const b = el('button', 'up-btn interactive', grid);
      b.type = 'button';
      const name = el('span', 'up-name', b);
      name.textContent = def.name;
      const level = el('span', 'up-level', b);
      const cost = el('span', 'up-cost', b);
      this.buttons.push(b);
      this.names.push(name);
      this.levels.push(level);
      this.costs.push(cost);
      this.bindHold(b, i);
    }

    // The rail carries both column buttons: the wave call sits above MAX, in a
    // fixed slot. It used to be a full-width row that appeared and disappeared,
    // which shoved the whole grid up and down under the player's thumb.
    const rail = el('div', 'upgrade-rail', this.root);

    this.nextWaveBtn = el('button', 'next-wave interactive', rail);
    this.nextWaveBtn.type = 'button';
    this.nextWaveFill = el('div', 'next-fill', this.nextWaveBtn);
    this.nextWaveLabel = el('span', 'next-label', this.nextWaveBtn);
    this.nextWaveBonus = el('span', 'next-bonus', this.nextWaveBtn);

    this.maxBtn = el('button', 'max-btn interactive', rail);
    this.maxBtn.type = 'button';
    this.maxBtn.textContent = 'MAX';
    this.maxBtn.addEventListener('click', () => {
      this.maxMode = !this.maxMode;
      setClass(this.maxBtn, 'on', this.maxMode);
      haptic(HAPTIC.Light);
    });

    this.nextWaveBtn.addEventListener('click', () => {
      if (!this.nextWaveReady) return;
      haptic(HAPTIC.Medium);
      this.onNextWave();
    });
  }

  private bindHold(b: HTMLButtonElement, idx: number): void {
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      this.holding = idx;
      this.holdT = 0;
      this.repeatT = 0;
      this.buy(idx);
    };
    const up = (): void => {
      if (this.holding === idx) this.holding = -1;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  private buy(idx: number): void {
    const mult = this.costMult();
    const beforeMaxHp = this.stats.get(ST.HpMax);
    const bought = this.maxMode
      ? buyMax(this.run, this.stats, idx, mult) > 0
      : buyUpgrade(this.run, this.stats, idx, mult);
    if (bought) {
      haptic(HAPTIC.Light);
      this.onBought(beforeMaxHp);
    }
  }

  /** Drives auto-repeat. Called from the fixed tick so the rate is stable. */
  update(dt: number): void {
    if (this.holding >= 0) {
      this.holdT += dt;
      if (this.holdT >= HOLD_DELAY) {
        this.repeatT += dt;
        while (this.repeatT >= REPEAT_PERIOD) {
          this.repeatT -= REPEAT_PERIOD;
          this.buy(this.holding);
        }
      }
    }
    this.refresh();
  }

  private refresh(): void {
    const mult = this.costMult();
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      const levelEl = this.levels[i];
      const costEl = this.costs[i];
      if (b === undefined || levelEl === undefined || costEl === undefined) continue;

      const level = this.run.upgradeLevels[i] ?? 0;
      setText(levelEl, level > 0 ? `Lv.${level}` : '');

      if (isMaxed(this.run, i)) {
        setText(costEl, t('talents.max'));
        setClass(b, 'dim', true);
        continue;
      }
      if (this.maxMode) {
        const { levels, cost } = maxAffordable(this.run, i, mult);
        setText(costEl, levels > 0 ? `${levels}× ${fmt(cost)}` : fmt(costOf(this.run, i, mult)));
        setClass(b, 'dim', levels === 0);
      } else {
        const cost = costOf(this.run, i, mult);
        setText(costEl, fmt(cost));
        setClass(b, 'dim', this.run.gold < cost);
      }
    }
  }

/**
   * Drives the early-call button. `fill` is 0..1 and drives the timer sweep;
   * the button is always in place, so nothing in the panel moves when it
   * becomes available.
   */
  setNextWave(available: boolean, bonusPct: number, fill: number): void {
    this.nextWaveReady = available;
    setVar(this.nextWaveFill, '--p', (Math.max(0, Math.min(1, fill)) * 100).toFixed(1) + '%');
    setClass(this.nextWaveBtn, 'ready', available);
    setText(this.nextWaveLabel, t('hud.nextWaveShort'));
    setText(this.nextWaveBonus, `+${Math.round(bonusPct * 100)}%`);
  }

  setVisible(v: boolean): void {
    show(this.root, v);
    if (!v) this.holding = -1;
  }
}
