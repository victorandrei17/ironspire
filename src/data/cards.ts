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

/**
 * The V1 catalogue. Epics and legendaries land in M6; the offer system already
 * reads rarity generically, so adding them is a data change only.
 */
export const CARDS: readonly CardDef[] = [...COMMONS, ...RARES];

export const CARD_COUNT = CARDS.length;

export function cardIndex(id: string): number {
  for (let i = 0; i < CARDS.length; i++) if (CARDS[i]?.id === id) return i;
  return -1;
}
