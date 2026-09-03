import { el, setText, setVar, setClass, show } from './dom.ts';
import { ABILITIES, ABILITY_COUNT } from '../data/abilities.ts';
import type { AbilitySystem } from '../systems/abilities.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';

/**
 * The three ability buttons (SPEC §9, §11.1).
 *
 * Bottom-right by default, mirrored by the left-handed option. Each carries a
 * cooldown ring driven by a CSS conic gradient, which the compositor animates
 * without touching the frame budget.
 */
export class AbilityBar {
  readonly root: HTMLDivElement;

  private readonly buttons: HTMLButtonElement[] = [];
  private readonly rings: HTMLDivElement[] = [];
  private readonly cds: HTMLSpanElement[] = [];

  constructor(parent: HTMLElement, onCast: (id: number) => void) {
    this.root = el('div', 'abilities', parent);
    for (let i = 0; i < ABILITY_COUNT; i++) {
      const def = ABILITIES[i];
      if (def === undefined) continue;
      const b = el('button', 'ability interactive', this.root);
      b.type = 'button';
      b.hidden = true;
      b.setAttribute('aria-label', def.name);
      const ring = el('div', 'ability-ring', b);
      const label = el('span', 'ability-label', b);
      label.textContent = def.name.slice(0, 3).toUpperCase();
      const cd = el('span', 'ability-cd', b);
      this.cds.push(cd);
      const id = i;
      b.addEventListener('click', () => {
        haptic(HAPTIC.Medium);
        onCast(id);
      });
      this.buttons.push(b);
      this.rings.push(ring);
    }
  }

  update(abilities: AbilitySystem): void {
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      const ring = this.rings[i];
      if (b === undefined || ring === undefined) continue;
      const unlocked = abilities.unlocked[i] === 1;
      show(b, unlocked);
      if (!unlocked) continue;
      const ready = abilities.readiness(i);
      setVar(ring, '--p', (ready * 360).toFixed(0) + 'deg');
      setClass(b, 'ready', ready >= 1);
      setClass(b, 'active', (abilities.active[i] ?? 0) > 0);
      const cdNode = this.cds[i];
      if (cdNode !== undefined) {
        const cd = abilities.cooldown[i] ?? 0;
        setText(cdNode, cd > 0 ? Math.ceil(cd).toString() : '');
      }
    }
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }
}
