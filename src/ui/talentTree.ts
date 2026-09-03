import { el, button, setText, setClass, show } from './dom.ts';
import type { Save } from '../save/schema.ts';
import { TALENTS, BRANCH_INFO, type TalentDef } from '../data/talents.ts';
import {
  nextTalentCost,
  talentRank,
  buyTalent,
  respec,
  canRebirth,
  etherForRebirth,
} from '../systems/meta.ts';
import { fmt } from '../core/format.ts';
import { haptic, HAPTIC } from '../platform/haptics.ts';

/**
 * The talent screen (SPEC §10.1).
 *
 * One branch at a time so every row is thumb-sized on a phone, rather than a
 * pannable graph nobody can hit accurately. Respec is free and prominent —
 * a tree the player is afraid to touch is a tree they never use.
 */
export class TalentTree {
  readonly root: HTMLDivElement;

  private readonly coreLabel: HTMLSpanElement;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly rows: {
    def: TalentDef;
    node: HTMLButtonElement;
    name: HTMLSpanElement;
    desc: HTMLSpanElement;
    rank: HTMLSpanElement;
    cost: HTMLSpanElement;
  }[] = [];

  private readonly rebirthBtn: HTMLButtonElement;
  private branch = 0;
  /** Rebirth is irreversible, so the button asks twice. */
  private confirmingRebirth = false;

  constructor(
    parent: HTMLElement,
    private readonly getSave: () => Save,
    private readonly onChanged: () => void,
    private readonly onRebirth: () => void,
    onClose: () => void,
  ) {
    this.root = el('div', 'modal talents', parent);
    this.root.hidden = true;

    const header = el('div', 'talent-header', this.root);
    const title = el('div', 'modal-title', header);
    title.textContent = 'TALENTOS';
    this.coreLabel = el('span', 'core-count', header);

    const tabRow = el('div', 'talent-tabs', this.root);
    for (let b = 0; b < BRANCH_INFO.length; b++) {
      const info = BRANCH_INFO[b];
      if (info === undefined) continue;
      const t = button(`${info.icon} ${info.name}`, 'talent-tab interactive', tabRow);
      const idx = b;
      t.addEventListener('click', () => {
        haptic(HAPTIC.Light);
        this.branch = idx;
        this.refresh();
      });
      this.tabs.push(t);
    }

    const list = el('div', 'talent-list', this.root);
    for (const def of TALENTS) {
      const node = el('button', 'talent-row interactive', list);
      node.type = 'button';
      const left = el('span', 'talent-left', node);
      const name = el('span', 'talent-name', left);
      const desc = el('span', 'talent-desc', left);
      const right = el('span', 'talent-right', node);
      const rank = el('span', 'talent-rank', right);
      const cost = el('span', 'talent-cost', right);
      node.addEventListener('click', () => {
        if (buyTalent(this.getSave(), def)) {
          haptic(HAPTIC.Medium);
          this.onChanged();
        }
        this.refresh();
      });
      this.rows.push({ def, node, name, desc, rank, cost });
    }

    // Rebirth only appears once it is actually reachable; an always-visible
    // locked button is just a nag (SPEC §10.3).
    this.rebirthBtn = button('', 'rebirth interactive', this.root);
    this.rebirthBtn.hidden = true;
    this.rebirthBtn.addEventListener('click', () => {
      if (!this.confirmingRebirth) {
        this.confirmingRebirth = true;
        this.refresh();
        return;
      }
      this.confirmingRebirth = false;
      haptic(HAPTIC.Heavy);
      this.onRebirth();
      this.refresh();
    });

    const footer = el('div', 'talent-footer', this.root);
    const respecBtn = button('RESPEC GRÁTIS', 'interactive', footer);
    respecBtn.addEventListener('click', () => {
      haptic(HAPTIC.Medium);
      respec(this.getSave());
      this.onChanged();
      this.refresh();
    });
    const close = button('VOLTAR', 'primary interactive', footer);
    close.addEventListener('click', () => {
      haptic(HAPTIC.Light);
      onClose();
    });
  }

  refresh(): void {
    const save = this.getSave();
    setText(
      this.coreLabel,
      save.meta.ether > 0 ? `◈ ${fmt(save.meta.nucleos)}   ✵ ${fmt(save.meta.ether)}` : `◈ ${fmt(save.meta.nucleos)}`,
    );

    const ready = canRebirth(save);
    show(this.rebirthBtn, ready);
    if (ready) {
      const gain = etherForRebirth(save.stats.bestWaveEver);
      setText(
        this.rebirthBtn,
        this.confirmingRebirth
          ? `CONFIRMAR: zera Núcleos e talentos por ✵ ${fmt(gain)}`
          : `RENASCER  ·  ✵ ${fmt(gain)}`,
      );
      setClass(this.rebirthBtn, 'confirming', this.confirmingRebirth);
    }
    for (let i = 0; i < this.tabs.length; i++) {
      setClass(this.tabs[i]!, 'on', i === this.branch);
    }
    for (const row of this.rows) {
      const visible = row.def.branch === this.branch;
      show(row.node, visible);
      if (!visible) continue;
      const rank = talentRank(save, row.def.id);
      const cost = nextTalentCost(save, row.def);
      setText(row.name, row.def.name);
      setText(row.desc, rank > 0 ? row.def.desc(rank) : row.def.desc(1));
      setText(row.rank, `${rank}/${row.def.maxRank}`);
      setText(row.cost, Number.isFinite(cost) ? `◈ ${fmt(cost)}` : 'MÁX');
      setClass(row.node, 'dim', !Number.isFinite(cost) || save.meta.nucleos < cost);
      setClass(row.node, 'owned', rank > 0);
    }
  }

  setVisible(v: boolean): void {
    show(this.root, v);
    if (v) {
      this.confirmingRebirth = false;
      this.refresh();
    }
  }
}
