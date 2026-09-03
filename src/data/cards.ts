import type { SpriteKey } from '../render/spriteKeys.gen.ts';
import { ST, TF, STAT_COUNT } from './stats.ts';

/**
 * Roguelite cards (SPEC §8).
 *
 * `apply` is PURE: it only writes into the stat layers of the object it is
 * handed. Cards with behaviour (aura, nova, chain) set a flag plus its
 * tunables, and a dedicated system reads them. There is never gameplay inside
 * a data file.
 */

export const RARITY = {
  Common: 0,
  Rare: 1,
  Epic: 2,
  Legendary: 3,
} as const;

export type Rarity = (typeof RARITY)[keyof typeof RARITY];

/** Base offer weights (SPEC §8.1). */
export const RARITY_WEIGHTS = new Float32Array([60, 28, 10, 2]);

export const RARITY_NAME = ['Comum', 'Rara', 'Épica', 'Lendária'] as const;

export type CardTag = 'offense' | 'defense' | 'economy' | 'utility';

/**
 * The subset of TowerStats a card may touch. Declaring it structurally keeps
 * `data/` from importing `entities/`, and makes `apply` trivially testable
 * against a plain object.
 */
export type CardTarget = {
  readonly flatCard: Float32Array;
  readonly pctCard: Float32Array;
  readonly prodMult: Float32Array;
  flags: number;
  slowAuraRadius: number;
  slowAuraMul: number;
  thornsPct: number;
  lifestealPct: number;
  lifestealCap: number;
  chainJumps: number;
  chainRadius: number;
  chainFalloff: number;
  orbitalCount: number;
  orbitalRadius: number;
  explosiveRadius: number;
  explosivePct: number;
  frostNovaCd: number;
  frostNovaRadius: number;
  frostNovaFreeze: number;
  overchargeDrainPct: number;
  deathmarkEvery: number;
  deathmarkThreshold: number;
  deathmarkBossMult: number;
};

export type CardDef = {
  readonly id: string;
  readonly name: string;
  /** Level-aware description text, PT-BR. */
  readonly desc: (lvl: number) => string;
  readonly rarity: Rarity;
  readonly maxLevel: number;
  readonly icon: SpriteKey;
  readonly tags: readonly CardTag[];
  /** Pure. Called with the cumulative level, never incrementally. */
  readonly apply: (s: CardTarget, lvl: number) => void;
  readonly requires?: readonly string[];
  /** Offered as a fusion once this card and `partner` are both maxed. */
  readonly evolvesWith?: { readonly partner: string; readonly into: string };
  /** Marks a fusion result: only offered when both parents are maxed. */
  readonly evolutionOf?: readonly [string, string];
};

/** Creates a blank target — used by tests and by the stat recompute. */
export function makeCardTarget(): CardTarget {
  return {
    flatCard: new Float32Array(STAT_COUNT),
    pctCard: new Float32Array(STAT_COUNT),
    prodMult: new Float32Array(STAT_COUNT).fill(1),
    flags: 0,
    slowAuraRadius: 0,
    slowAuraMul: 1,
    thornsPct: 0,
    lifestealPct: 0,
    lifestealCap: 0,
    chainJumps: 0,
    chainRadius: 0,
    chainFalloff: 1,
    orbitalCount: 0,
    orbitalRadius: 0,
    explosiveRadius: 0,
    explosivePct: 0,
    frostNovaCd: 0,
    frostNovaRadius: 0,
    frostNovaFreeze: 0,
    overchargeDrainPct: 0,
    deathmarkEvery: 0,
    deathmarkThreshold: 0,
    deathmarkBossMult: 1,
  };
}

function pct(s: CardTarget, stat: number, amount: number): void {
  s.pctCard[stat] = (s.pctCard[stat] ?? 0) + amount;
}

function flat(s: CardTarget, stat: number, amount: number): void {
  s.flatCard[stat] = (s.flatCard[stat] ?? 0) + amount;
}

/** Multiplicative — reserved for rare-and-up cards (SPEC §4.1). */
function mult(s: CardTarget, stat: number, factor: number): void {
  s.prodMult[stat] = (s.prodMult[stat] ?? 1) * factor;
}

// --- Commons (SPEC §8.2, levels 1-5) ----------------------------------------

const COMMONS: readonly CardDef[] = [
  {
    id: 'dmg_up',
    name: 'Lâminas Afiadas',
    desc: (l) => `+${18 * l}% de dano`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => pct(s, ST.Dmg, 0.18 * l),
  },
  {
    id: 'rate_up',
    name: 'Mecanismo Oleado',
    desc: (l) => `+${12 * l}% de cadência`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => pct(s, ST.FireRate, 0.12 * l),
  },
  {
    id: 'hp_up',
    name: 'Muralha Reforçada',
    desc: (l) => `+${15 * l}% de vida máxima`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_defense',
    tags: ['defense'],
    // The matching heal is granted by progression.ts when the card is taken:
    // healing is a side effect, and apply() must stay pure.
    apply: (s, l) => pct(s, ST.HpMax, 0.15 * l),
  },
  {
    id: 'crit_up',
    name: 'Ponto Fraco',
    desc: (l) => `+${4 * l}% de chance de crítico`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => flat(s, ST.CritChance, 0.04 * l),
  },
  {
    id: 'range_up',
    name: 'Mira Longa',
    desc: (l) => `+${12 * l}% de alcance`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_utility',
    tags: ['utility'],
    apply: (s, l) => pct(s, ST.Range, 0.12 * l),
  },
  {
    id: 'gold_up',
    name: 'Ganância',
    desc: (l) => `+${15 * l}% de ouro`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_economy',
    tags: ['economy'],
    apply: (s, l) => pct(s, ST.GoldMult, 0.15 * l),
  },
  {
    id: 'speed_up',
    name: 'Balística',
    desc: (l) => `+${20 * l}% de velocidade de projétil`,
    rarity: RARITY.Common,
    maxLevel: 5,
    icon: 'ui/card_utility',
    tags: ['utility'],
    apply: (s, l) => pct(s, ST.ProjSpeed, 0.2 * l),
  },
];

// --- Rares (levels 1-4) ------------------------------------------------------

const RARES: readonly CardDef[] = [
  {
    id: 'multishot',
    name: 'Tiro Múltiplo',
    desc: (l) => `+${l} projétil${l > 1 ? 's' : ''}, −${8 * l}% de dano por projétil`,
    rarity: RARITY.Rare,
    maxLevel: 4,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => {
      flat(s, ST.Projectiles, l);
      // The damage cut is multiplicative so stacking multishot converges
      // instead of hitting zero at level 4 (4 x -25% additive would).
      mult(s, ST.Dmg, Math.pow(0.92, l));
    },
  },
  {
    id: 'pierce',
    name: 'Perfurante',
    desc: (l) => `+${l} de perfuração`,
    rarity: RARITY.Rare,
    maxLevel: 4,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => flat(s, ST.Pierce, l),
  },
  {
    id: 'slow_aura',
    name: 'Aura Gélida',
    desc: (l) => `Inimigos a menos de 180 u ficam ${Math.round((1 - Math.pow(0.78, l)) * 100)}% mais lentos`,
    rarity: RARITY.Rare,
    maxLevel: 4,
    icon: 'ui/card_utility',
    tags: ['utility', 'defense'],
    apply: (s, l) => {
      s.flags |= TF.SlowAura;
      s.slowAuraRadius = 180;
      // Multiplicative, not `1 - 0.22*l`: additive stacking hits the sensible
      // floor at level 3 and makes level 4 a dead level. Compounding keeps
      // every level worth taking and can never reach a full stop.
      s.slowAuraMul = Math.pow(0.78, l);
    },
  },
  {
    id: 'thorns',
    name: 'Espinhos',
    desc: (l) => `Reflete ${35 * l}% do dano corpo a corpo`,
    rarity: RARITY.Rare,
    maxLevel: 4,
    icon: 'ui/card_defense',
    tags: ['defense'],
    apply: (s, l) => {
      s.flags |= TF.Thorns;
      s.thornsPct = 0.35 * l;
    },
  },
  {
    id: 'lifesteal',
    name: 'Sanguessuga',
    desc: (l) => `${(1.5 * l).toFixed(1)}% do dano vira cura (máx ${3 * l} por acerto)`,
    rarity: RARITY.Rare,
    maxLevel: 4,
    icon: 'ui/card_defense',
    tags: ['defense'],
    apply: (s, l) => {
      s.flags |= TF.Lifesteal;
      s.lifestealPct = 0.015 * l;
      s.lifestealCap = 3 * l;
    },
  },
];

// --- Epics (levels 1-3) ------------------------------------------------------

const EPICS: readonly CardDef[] = [
  {
    id: 'chain',
    name: 'Corrente Arcana',
    desc: (l) => `Projétil salta para +${1 + l} alvos a 140 u (${60}% do dano por salto)`,
    rarity: RARITY.Epic,
    maxLevel: 3,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => {
      s.flags |= TF.Chain;
      s.chainJumps = 1 + l;
      s.chainRadius = 140;
      s.chainFalloff = 0.6;
    },
    evolvesWith: { partner: 'multishot', into: 'arrow_storm' },
  },
  {
    id: 'orbital',
    name: 'Sentinelas',
    desc: (l) => `${1 + l} orbes giram a 90 u causando dano por contato`,
    rarity: RARITY.Epic,
    maxLevel: 3,
    icon: 'ui/card_utility',
    tags: ['offense', 'defense'],
    apply: (s, l) => {
      s.flags |= TF.Orbital;
      s.orbitalCount = 1 + l;
      s.orbitalRadius = 90;
    },
  },
  {
    id: 'explosive',
    name: 'Carga Oca',
    desc: (l) => `Projétil explode em raio ${40 + 20 * l} (${50}% do dano)`,
    rarity: RARITY.Epic,
    maxLevel: 3,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => {
      s.flags |= TF.Explosive;
      s.explosiveRadius = 40 + 20 * l;
      s.explosivePct = 0.5;
    },
  },
  {
    id: 'frost_nova',
    name: 'Nova Gélida',
    desc: (l) => `A cada ${(10 - l).toFixed(0)} s, congela por 1,2 s tudo a menos de 200 u`,
    rarity: RARITY.Epic,
    maxLevel: 3,
    icon: 'ui/card_defense',
    tags: ['defense', 'utility'],
    apply: (s, l) => {
      s.flags |= TF.FrostNova;
      // Levels shorten the cooldown rather than lengthening the freeze: a
      // longer freeze scales toward a permanent stun, a shorter cooldown does not.
      s.frostNovaCd = 10 - l;
      s.frostNovaRadius = 200;
      s.frostNovaFreeze = 1.2;
    },
    evolvesWith: { partner: 'slow_aura', into: 'permafrost' },
  },
];

// --- Legendaries (levels 1-2) ------------------------------------------------

const LEGENDARIES: readonly CardDef[] = [
  {
    id: 'overcharge',
    name: 'Sobrecarga',
    desc: (l) => `+${100 * l}% de cadência, mas perde ${l}% da vida máx./s`,
    rarity: RARITY.Legendary,
    maxLevel: 2,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => {
      s.flags |= TF.Overcharge;
      mult(s, ST.FireRate, 1 + l);
      s.overchargeDrainPct = 0.01 * l;
    },
  },
  {
    id: 'deathmark',
    name: 'Marca Mortal',
    desc: (l) =>
      `A cada ${13 - l}º tiro: executa não-chefes abaixo de ${15 + 5 * l}% de vida; ${4 * l}× em chefes`,
    rarity: RARITY.Legendary,
    maxLevel: 2,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s, l) => {
      s.flags |= TF.Deathmark;
      s.deathmarkEvery = 13 - l;
      s.deathmarkThreshold = 0.15 + 0.05 * l;
      s.deathmarkBossMult = 4 * l;
    },
  },
];

// --- Evolutions (SPEC §8.1) --------------------------------------------------

/**
 * Fusions are offered only when BOTH parents are at max level. They are not in
 * the normal pool — the "I found a combo" moment is the whole point, and it
 * would be spent if the card could just show up on its own.
 */
const EVOLUTIONS: readonly CardDef[] = [
  {
    id: 'arrow_storm',
    name: 'Tempestade de Flechas',
    desc: () => 'Todo projétil salta e o leque dobra: +2 projéteis, +2 saltos, sem penalidade',
    rarity: RARITY.Legendary,
    maxLevel: 1,
    icon: 'ui/card_offense',
    tags: ['offense'],
    apply: (s) => {
      flat(s, ST.Projectiles, 2);
      s.flags |= TF.Chain;
      s.chainJumps += 2;
      s.chainRadius = Math.max(s.chainRadius, 160);
      s.chainFalloff = Math.max(s.chainFalloff, 0.8);
      // Cancels multishot's per-projectile damage cut, which is the reward.
      mult(s, ST.Dmg, 1 / Math.pow(0.92, 4));
    },
    evolutionOf: ['multishot', 'chain'],
  },
  {
    id: 'permafrost',
    name: 'Permafrost',
    desc: () => 'A aura congela em vez de lentificar, e a nova dispara a cada 4 s',
    rarity: RARITY.Legendary,
    maxLevel: 1,
    icon: 'ui/card_defense',
    tags: ['defense', 'utility'],
    apply: (s) => {
      s.flags |= TF.FrostNova | TF.SlowAura;
      s.frostNovaCd = 4;
      s.frostNovaRadius = Math.max(s.frostNovaRadius, 240);
      s.frostNovaFreeze = 1.6;
      s.slowAuraRadius = Math.max(s.slowAuraRadius, 200);
      s.slowAuraMul = Math.min(s.slowAuraMul, 0.3);
    },
    evolutionOf: ['slow_aura', 'frost_nova'],
  },
];

/** The full V1 catalogue (SPEC §8.2), plus the fusion cards. */
export const CARDS: readonly CardDef[] = [
  ...COMMONS,
  ...RARES,
  ...EPICS,
  ...LEGENDARIES,
  ...EVOLUTIONS,
];

export const CARD_COUNT = CARDS.length;

export function cardIndex(id: string): number {
  for (let i = 0; i < CARDS.length; i++) if (CARDS[i]?.id === id) return i;
  return -1;
}
