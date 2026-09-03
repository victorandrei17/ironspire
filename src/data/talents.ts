import { ST } from './stats.ts';

/**
 * The permanent talent tree (SPEC §10.1).
 *
 * Four branches, cost `base * 1.28^rank`, respec always free. Punishing
 * experimentation in a tree the player cannot see the end of just makes them
 * stop touching it.
 */

export const BRANCH = {
  War: 0,
  Fortress: 1,
  Fortune: 2,
  Arcane: 3,
} as const;

export type Branch = (typeof BRANCH)[keyof typeof BRANCH];

export const BRANCH_INFO = [
  { id: 'war', name: 'Guerra', icon: '⚔️', color: '#e2564d' },
  { id: 'fortress', name: 'Fortaleza', icon: '🛡️', color: '#4ea8f2' },
  { id: 'fortune', name: 'Fortuna', icon: '💰', color: '#f2c14e' },
  { id: 'arcane', name: 'Arcano', icon: '✦', color: '#a86ff0' },
] as const;

/**
 * How a rank turns into an effect.
 * `statFlat`/`statPct` feed the tower's meta layer; `special` feeds a named
 * modifier that a system reads by name.
 */
export type TalentKind = 'statFlat' | 'statPct' | 'special';

export type SpecialId =
  | 'upgradeCostMult'
  | 'startGold'
  | 'offlineRate'
  | 'offlineCapHours'
  | 'rerolls'
  | 'reviveOnce'
  | 'bossDamagePct'
  | 'damageReductionPct'
  | 'iframeBonus'
  | 'cardLuckPct'
  | 'coreGainPct'
  | 'abilitySlot'
  | 'autoCast';

export type TalentDef = {
  readonly id: string;
  readonly branch: Branch;
  readonly name: string;
  readonly desc: (rank: number) => string;
  readonly maxRank: number;
  readonly costBase: number;
  readonly kind: TalentKind;
  /** For statFlat / statPct. */
  readonly stat?: number;
  /** For special. */
  readonly special?: SpecialId;
  readonly perRank: number;
};

/** Cost of the NEXT rank when `rank` are already owned (SPEC §10.1). */
export const TALENT_COST_GROWTH = 1.28;

export function talentCost(def: TalentDef, rank: number): number {
  return Math.floor(def.costBase * Math.pow(TALENT_COST_GROWTH, rank));
}

const pctText = (v: number) => `${Math.round(v * 1000) / 10}%`;

export const TALENTS: readonly TalentDef[] = [
  // --- War -------------------------------------------------------------------
  {
    id: 'war_dmg',
    branch: BRANCH.War,
    name: 'Fio Eterno',
    desc: (r) => `+${pctText(0.06 * r)} de dano base`,
    maxRank: 10,
    costBase: 4,
    kind: 'statPct',
    stat: ST.Dmg,
    perRank: 0.06,
  },
  {
    id: 'war_rate',
    branch: BRANCH.War,
    name: 'Engrenagem Fina',
    desc: (r) => `+${pctText(0.04 * r)} de cadência base`,
    maxRank: 10,
    costBase: 6,
    kind: 'statPct',
    stat: ST.FireRate,
    perRank: 0.04,
  },
  {
    id: 'war_crit',
    branch: BRANCH.War,
    name: 'Olho de Falcão',
    desc: (r) => `+${pctText(0.01 * r)} de chance de crítico`,
    maxRank: 8,
    costBase: 8,
    kind: 'statFlat',
    stat: ST.CritChance,
    perRank: 0.01,
  },
  {
    id: 'war_critdmg',
    branch: BRANCH.War,
    name: 'Golpe Brutal',
    desc: (r) => `+${pctText(0.08 * r)} de dano crítico`,
    maxRank: 8,
    costBase: 10,
    kind: 'statPct',
    stat: ST.CritMult,
    perRank: 0.08,
  },
  {
    id: 'war_proj',
    branch: BRANCH.War,
    // Capped at 2: a third free projectile makes the multishot card redundant.
    name: 'Salva Inicial',
    desc: (r) => `Começa a run com +${r} projétil${r > 1 ? 'is' : ''}`,
    maxRank: 2,
    costBase: 60,
    kind: 'statFlat',
    stat: ST.Projectiles,
    perRank: 1,
  },
  {
    id: 'war_boss',
    branch: BRANCH.War,
    name: 'Caçador de Colossos',
    desc: (r) => `+${pctText(0.08 * r)} de dano contra chefes`,
    maxRank: 8,
    costBase: 14,
    kind: 'special',
    special: 'bossDamagePct',
    perRank: 0.08,
  },
  {
    id: 'war_pierce',
    branch: BRANCH.War,
    name: 'Ponta Adamantina',
    desc: (r) => `+${r} de perfuração inicial`,
    maxRank: 2,
    costBase: 80,
    kind: 'statFlat',
    stat: ST.Pierce,
    perRank: 1,
  },
  {
    id: 'war_projspeed',
    branch: BRANCH.War,
    name: 'Pólvora Seca',
    desc: (r) => `+${pctText(0.08 * r)} de velocidade de projétil`,
    maxRank: 6,
    costBase: 5,
    kind: 'statPct',
    stat: ST.ProjSpeed,
    perRank: 0.08,
  },
  {
    id: 'war_range',
    branch: BRANCH.War,
    name: 'Torre Alta',
    desc: (r) => `+${pctText(0.05 * r)} de alcance`,
    maxRank: 8,
    costBase: 7,
    kind: 'statPct',
    stat: ST.Range,
    perRank: 0.05,
  },

  // --- Fortress --------------------------------------------------------------
  {
    id: 'fort_hp',
    branch: BRANCH.Fortress,
    name: 'Alicerce',
    desc: (r) => `+${pctText(0.07 * r)} de vida máxima`,
    maxRank: 10,
    costBase: 4,
    kind: 'statPct',
    stat: ST.HpMax,
    perRank: 0.07,
  },
  {
    id: 'fort_regen',
    branch: BRANCH.Fortress,
    name: 'Argamassa Viva',
    desc: (r) => `+${(0.15 * r).toFixed(2)} de vida por segundo`,
    maxRank: 10,
    costBase: 9,
    kind: 'statFlat',
    stat: ST.HpRegen,
    perRank: 0.15,
  },
  {
    id: 'fort_reduce',
    branch: BRANCH.Fortress,
    name: 'Placas de Ferro',
    // Multiplicative per rank so it converges instead of reaching immunity.
    desc: (r) => `−${pctText(1 - Math.pow(0.97, r))} do dano recebido`,
    maxRank: 10,
    costBase: 12,
    kind: 'special',
    special: 'damageReductionPct',
    perRank: 0.03,
  },
  {
    id: 'fort_iframe',
    branch: BRANCH.Fortress,
    name: 'Reflexo de Pedra',
    desc: (r) => `+${(0.03 * r).toFixed(2)} s de invulnerabilidade após dano`,
    maxRank: 5,
    costBase: 20,
    kind: 'special',
    special: 'iframeBonus',
    perRank: 0.03,
  },
  {
    id: 'fort_revive',
    branch: BRANCH.Fortress,
    name: 'Segunda Chance',
    desc: () => 'Revive uma vez por run com 40% da vida',
    maxRank: 1,
    costBase: 150,
    kind: 'special',
    special: 'reviveOnce',
    perRank: 1,
  },

  // --- Fortune ---------------------------------------------------------------
  {
    id: 'fortune_gold',
    branch: BRANCH.Fortune,
    name: 'Cofre Fundo',
    desc: (r) => `+${pctText(0.06 * r)} de ouro`,
    maxRank: 10,
    costBase: 5,
    kind: 'statPct',
    stat: ST.GoldMult,
    perRank: 0.06,
  },
  {
    id: 'fortune_cost',
    branch: BRANCH.Fortune,
    name: 'Barganha',
    desc: (r) => `−${pctText(1 - Math.pow(0.97, r))} no custo dos upgrades`,
    maxRank: 10,
    costBase: 11,
    kind: 'special',
    special: 'upgradeCostMult',
    perRank: 0.03,
  },
  {
    id: 'fortune_start',
    branch: BRANCH.Fortune,
    name: 'Herança',
    desc: (r) => `Começa a run com ${25 * r} de ouro`,
    maxRank: 10,
    costBase: 8,
    kind: 'special',
    special: 'startGold',
    perRank: 25,
  },
  {
    id: 'fortune_pickup',
    branch: BRANCH.Fortune,
    name: 'Mão Longa',
    desc: (r) => `+${8 * r} de raio de coleta`,
    maxRank: 8,
    costBase: 6,
    kind: 'statFlat',
    stat: ST.PickupRadius,
    perRank: 8,
  },
  {
    id: 'fortune_offline',
    branch: BRANCH.Fortune,
    name: 'Turno da Noite',
    desc: (r) => `+${pctText(0.08 * r)} de ganho offline`,
    maxRank: 10,
    costBase: 15,
    kind: 'special',
    special: 'offlineRate',
    perRank: 0.08,
  },
  {
    id: 'fortune_cap',
    branch: BRANCH.Fortune,
    name: 'Reserva Profunda',
    desc: (r) => `+${2 * r} h de acúmulo offline`,
    maxRank: 8,
    costBase: 25,
    kind: 'special',
    special: 'offlineCapHours',
    perRank: 2,
  },
  {
    id: 'fortune_cores',
    branch: BRANCH.Fortune,
    name: 'Refinaria',
    desc: (r) => `+${pctText(0.05 * r)} de Núcleos ao fim da run`,
    maxRank: 10,
    costBase: 18,
    kind: 'special',
    special: 'coreGainPct',
    perRank: 0.05,
  },

  // --- Arcane ----------------------------------------------------------------
  {
    id: 'arcane_reroll',
    branch: BRANCH.Arcane,
    name: 'Segunda Leitura',
    desc: (r) => `+${r} resorteio${r > 1 ? 's' : ''} de carta por run`,
    maxRank: 5,
    costBase: 22,
    kind: 'special',
    special: 'rerolls',
    perRank: 1,
  },
  {
    id: 'arcane_nova',
    branch: BRANCH.Arcane,
    name: 'Pulso de Choque',
    desc: () => 'Desbloqueia a habilidade Pulso de Choque',
    maxRank: 1,
    costBase: 30,
    kind: 'special',
    special: 'abilitySlot',
    perRank: 1, // bit 0
  },
  {
    id: 'arcane_fury',
    branch: BRANCH.Arcane,
    name: 'Fúria',
    desc: () => 'Desbloqueia a habilidade Fúria',
    maxRank: 1,
    costBase: 70,
    kind: 'special',
    special: 'abilitySlot',
    perRank: 2, // bit 1
  },
  {
    id: 'arcane_bulwark',
    branch: BRANCH.Arcane,
    name: 'Baluarte',
    desc: () => 'Desbloqueia a habilidade Baluarte',
    maxRank: 1,
    costBase: 120,
    kind: 'special',
    special: 'abilitySlot',
    perRank: 4, // bit 2
  },
  {
    id: 'arcane_automation',
    branch: BRANCH.Arcane,
    // The promise of the genre: the game has to keep playing with the screen
    // off (SPEC §9).
    name: 'Automação',
    desc: () => 'Habilidades disparam sozinhas quando a condição é atendida',
    maxRank: 1,
    costBase: 200,
    kind: 'special',
    special: 'autoCast',
    perRank: 1,
  },
  {
    id: 'arcane_luck',
    branch: BRANCH.Arcane,
    name: 'Sorte do Arcanista',
    desc: (r) => `+${pctText(0.1 * r)} de chance de cartas raras ou melhores`,
    maxRank: 8,
    costBase: 26,
    kind: 'special',
    special: 'cardLuckPct',
    perRank: 0.1,
  },
];

export type TalentId = (typeof TALENTS)[number]['id'];
export const TALENT_COUNT = TALENTS.length;

export function talentIndex(id: string): number {
  for (let i = 0; i < TALENTS.length; i++) if (TALENTS[i]?.id === id) return i;
  return -1;
}

/** Talent ids per branch, in display order. */
export function talentsInBranch(branch: Branch): TalentDef[] {
  return TALENTS.filter((t) => t.branch === branch);
}
