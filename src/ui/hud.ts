import { el, setText, setVar, setClass, show } from './dom.ts';
import type { RunState } from '../core/state.ts';
import type { World } from '../entities/world.ts';
import { POLICY_COUNT } from '../core/state.ts';
import { fmt } from '../core/format.ts';
import { PATTERN_INFO } from '../data/waves.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';
import { t } from '../data/strings.ts';
import { BAL } from '../data/balance.ts';

const POLICY_KEYS = [
  'policy.closest',
  'policy.strongest',
  'policy.weakest',
  'policy.fastest',
  'policy.bossFirst',
] as const;

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
  private readonly waveText: HTMLSpanElement;
  private readonly goldText: HTMLSpanElement;
  private readonly policyBtn: HTMLButtonElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly bossWrap: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossName: HTMLSpanElement;

  private bannerT = 0;
  private bossLabel = 'CHEFE';

  constructor(parent: HTMLElement, onCyclePolicy: () => void) {
    this.root = el('div', 'hud', parent);

    const top = el('div', 'hud-top', this.root);
    this.waveText = el('span', 'hud-wave', top);
    this.bannerEl = el('div', 'hud-banner', this.root);
    this.bannerEl.hidden = true;

    this.bossWrap = el('div', 'boss-bar', this.root);
    this.bossWrap.hidden = true;
    this.bossName = el('span', 'boss-name', this.bossWrap);
    const bossTrack = el('div', 'bar-track boss-track', this.bossWrap);
    this.bossFill = el('div', 'bar-fill boss-fill', bossTrack);

    const bars = el('div', 'hud-bars', this.root);

    const hpRow = el('div', 'bar-row', bars);
    const hpTrack = el('div', 'bar-track', hpRow);
    this.hpFill = el('div', 'bar-fill hp-fill', hpTrack);
    this.hpText = el('span', 'bar-label', hpRow);

    // Was the XP bar. Now it counts down waves to the next card offer, which
    // is the only thing the player can still anticipate on this axis.
    const cardRow = el('div', 'bar-row', bars);
    const cardTrack = el('div', 'bar-track card-track', cardRow);
    this.cardFill = el('div', 'bar-fill card-fill', cardTrack);
    this.cardText = el('span', 'bar-label', cardRow);

    const purse = el('div', 'hud-purse', this.root);
    this.goldText = el('span', 'gold', purse);
    this.policyBtn = el('button', 'policy interactive', purse);
    this.policyBtn.type = 'button';
    this.policyBtn.setAttribute('aria-label', 'Alternar política de mira');
    this.policyBtn.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onCyclePolicy();
    });
  }

  /** Named by the boss system when one spawns, so the HUD stays data-free. */
  setBossName(name: string): void {
    this.bossLabel = name;
  }

  /** Announces the wave pattern for a beat before the wave lands (SPEC §6.4). */
  banner(patternIdx: number, wave: number): void {
    const info = PATTERN_INFO[patternIdx] ?? PATTERN_INFO[0];
    setText(this.bannerEl, `${info.icon}  ${t('hud.wave')} ${wave} · ${info.name}`);
    show(this.bannerEl, true);
    this.bannerT = 1.4;
  }

  update(run: RunState, world: World, dt: number): void {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) show(this.bannerEl, false);
    }

    const tower = world.tower;
    const hpPct = Math.max(0, Math.min(1, tower.hp / Math.max(1, tower.hpMax)));
    setVar(this.hpFill, '--p', (hpPct * 100).toFixed(1) + '%');
    setText(this.hpText, `${Math.ceil(tower.hp)} / ${Math.round(tower.hpMax)}`);
    // Colour shift below a quarter health: readable at a glance, no text needed.
    setClass(this.hpFill, 'critical', hpPct < 0.25);

    const every = Math.max(1, BAL.progression.cardEveryWaves);
    const left = Math.max(0, run.nextCardWave - run.wavesCleared);
    setVar(this.cardFill, '--p', (((every - left) / every) * 100).toFixed(1) + '%');
    setText(this.cardText, `${t('hud.cardIn')} ${left}`);

    setText(this.waveText, `${t('hud.wave')} ${Math.max(1, run.wave)}`);
    setText(this.goldText, `🪙 ${fmt(run.gold)}`);
    setText(this.policyBtn, t(POLICY_KEYS[run.policy % POLICY_COUNT] ?? 'policy.closest'));

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
