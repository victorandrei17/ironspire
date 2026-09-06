import { el, setText, setVar, setClass, show } from './dom.ts';
import type { RunState } from '../core/state.ts';
import type { World } from '../entities/world.ts';
import { fmt } from '../core/format.ts';
import { PATTERN_INFO } from '../data/waves.ts';
import { t } from '../data/strings.ts';
import { BAL } from '../data/balance.ts';

/**
 * The in-run HUD (SPEC §11.1).
 *
 * DOM over the canvas: it gets native accessibility, the system font scale and
 * safe areas for free, and it leaves the whole frame budget to the game.
 * Everything below is built once and mutated in place.
 */
export class Hud {
  readonly root: HTMLDivElement;

  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly cardFill: HTMLDivElement;
  private readonly cardText: HTMLSpanElement;
  /** The HP strip, so the camera can keep the tower clear of it. */
  readonly barsEl: HTMLDivElement;
  private readonly waveText: HTMLSpanElement;
  private readonly goldText: HTMLSpanElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly clearedEl: HTMLDivElement;
  private readonly bossWrap: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossName: HTMLSpanElement;

  private bannerT = 0;
  private clearedT = 0;
  private bossLabel = 'CHEFE';

  constructor(
    parent: HTMLElement,
    /**
     * The solid panel at the bottom of the screen. The readouts live in it
     * rather than floating over the arena, so nothing walks behind them — and
     * so the tabs planned for this strip have somewhere to attach.
     */
    dock: HTMLElement,
  ) {
    this.root = el('div', 'hud', parent);

    const top = el('div', 'hud-top', this.root);
    this.waveText = el('span', 'hud-wave', top);
    this.bannerEl = el('div', 'hud-banner', this.root);
    this.bannerEl.hidden = true;
    this.clearedEl = el('div', 'hud-cleared', this.root);
    this.clearedEl.hidden = true;

    this.bossWrap = el('div', 'boss-bar', this.root);
    this.bossWrap.hidden = true;
    this.bossName = el('span', 'boss-name', this.bossWrap);
    const bossTrack = el('div', 'bar-track boss-track', this.bossWrap);
    this.bossFill = el('div', 'bar-fill boss-fill', bossTrack);

    const bars = el('div', 'hud-bars', dock);
    this.barsEl = bars;

    const hpTrack = el('div', 'bar-track hp-track', bars);
    this.hpFill = el('div', 'bar-fill hp-fill', hpTrack);
    // Inside the track, not beside it: the readout belongs to the bar, and
    // outside it the pair cost twice the width for the same information.
    this.hpText = el('span', 'bar-inline', hpTrack);

    // Half the HP bar, right beside it: waves cleared toward the next card.
    const cardTrack = el('div', 'bar-track card-track', bars);
    this.cardFill = el('div', 'bar-fill card-fill', cardTrack);
    this.cardText = el('span', 'bar-inline', cardTrack);

    // Same row as the bars: the purse used to own a line of its own for one
    // number, and that line was a line of arena.
    this.goldText = el('span', 'gold', bars);
  }

  /** Named by the boss system when one spawns, so the HUD stays data-free. */
  setBossName(name: string): void {
    this.bossLabel = name;
  }

  /** Announces the wave pattern for a beat before the wave lands (SPEC §6.4). */
  /**
   * "ONDA 7 CONCLUÍDA" — the beat between the last kill and the next wave.
   *
   * Toggling `hidden` restarts the CSS fade, so two waves cleared back to back
   * each get their own animation instead of the second one inheriting a
   * half-faded element.
   */
  waveCleared(wave: number): void {
    setText(this.clearedEl, `${t('hud.wave')} ${wave} ${t('hud.cleared')}`);
    show(this.clearedEl, false);
    void this.clearedEl.offsetWidth;
    show(this.clearedEl, true);
    this.clearedT = 1;
  }

  banner(patternIdx: number, wave: number): void {
    const info = PATTERN_INFO[patternIdx] ?? PATTERN_INFO[0];
    setText(this.bannerEl, `${info.icon}  ${t('hud.wave')} ${wave} · ${info.name}`);
    show(this.bannerEl, true);
    this.bannerT = 1.4;
  }

  update(run: RunState, world: World, dt: number): void {
    if (this.clearedT > 0) {
      this.clearedT -= dt;
      if (this.clearedT <= 0) show(this.clearedEl, false);
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) show(this.bannerEl, false);
    }

    const tower = world.tower;
    const hpPct = Math.max(0, Math.min(1, tower.hp / Math.max(1, tower.hpMax)));
    setVar(this.hpFill, '--p', (hpPct * 100).toFixed(1) + '%');
    // Ceil the current HP so a sliver never reads as 0, but never let it print
    // above the max: at full health a float hair over the max used to show
    // "268 / 267".
    const hpMax = Math.round(tower.hpMax);
    setText(this.hpText, `${Math.min(hpMax, Math.ceil(tower.hp))} / ${hpMax}`);
    // Colour shift below a quarter health: readable at a glance, no text needed.
    setClass(this.hpFill, 'critical', hpPct < 0.25);

    const every = Math.max(1, BAL.progression.cardEveryWaves);
    const done = every - Math.max(0, Math.min(every, run.nextCardWave - run.wavesCleared));
    setVar(this.cardFill, '--p', ((done / every) * 100).toFixed(1) + '%');
    setText(this.cardText, `${done}/${every}`);

    setText(this.waveText, `${t('hud.wave')} ${Math.max(1, run.wave)}`);
    setText(this.goldText, `🪙 ${fmt(run.gold)}`);

    this.updateBossBar(world);
  }

  private updateBossBar(world: World): void {
    const e = world.enemies;
    let bossIdx = -1;
    for (let i = 0; i < e.count; i++) {
      // Flag bit 1 is EF.Boss; read directly to avoid importing gameplay data
      // into the HUD for a single bit test.
      if (e.alive[i] === 1 && ((e.flags[i] ?? 0) & 2) !== 0) {
        bossIdx = i;
        break;
      }
    }
    if (bossIdx < 0) {
      show(this.bossWrap, false);
      return;
    }
    show(this.bossWrap, true);
    const pct = Math.max(0, Math.min(1, (e.hp[bossIdx] ?? 0) / Math.max(1, e.hpMax[bossIdx] ?? 1)));
    setVar(this.bossFill, '--p', (pct * 100).toFixed(1) + '%');
    setText(this.bossName, this.bossLabel);
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}
