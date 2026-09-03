import { describe, it, expect } from 'vitest';
import { TALENTS, BRANCH_INFO, talentIndex, talentsInBranch } from '../../src/data/talents.ts';
import { ABILITY_COUNT } from '../../src/data/abilities.ts';
import { makeDefaultSave } from '../../src/save/schema.ts';
import { makeModifiers } from '../../src/core/metaModifiers.ts';
import { applyTalents } from '../../src/systems/meta.ts';
import { TowerStats } from '../../src/entities/tower.ts';

describe('talent tree shape (SPEC §10.1)', () => {
  it('covers all four branches with several nodes each', () => {
    for (let b = 0; b < BRANCH_INFO.length; b++) {
      expect(talentsInBranch(b as never).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('unlocks exactly one talent per ability slot, plus automation', () => {
    const slots = TALENTS.filter((t) => t.special === 'abilitySlot');
    expect(slots.length).toBe(ABILITY_COUNT);
    // Each carries a distinct bit, or two slots would unlock the same ability.
    const bits = new Set(slots.map((t) => t.perRank));
    expect(bits.size).toBe(ABILITY_COUNT);
    expect(TALENTS.some((t) => t.special === 'autoCast')).toBe(true);
  });

  it('ability unlocks map to the right slots', () => {
    const save = makeDefaultSave(0);
    const mods = makeModifiers();
    save.meta.talents.arcane_nova = 1;
    applyTalents(save, new TowerStats(), mods);
    expect(mods.abilityUnlocks & 1).toBe(1);
    expect(mods.abilityUnlocks & 2).toBe(0);

    save.meta.talents.arcane_bulwark = 1;
    applyTalents(save, new TowerStats(), mods);
    expect(mods.abilityUnlocks & 4).toBe(4);
  });

  it('automation is off until its talent is taken', () => {
    const save = makeDefaultSave(0);
    const mods = makeModifiers();
    applyTalents(save, new TowerStats(), mods);
    expect(mods.autoCast).toBe(false);
    save.meta.talents.arcane_automation = 1;
    applyTalents(save, new TowerStats(), mods);
    expect(mods.autoCast).toBe(true);
  });

  it('every talent id is unique and findable', () => {
    const seen = new Set<string>();
    for (const t of TALENTS) {
      expect(seen.has(t.id)).toBe(false);
      seen.add(t.id);
      expect(talentIndex(t.id)).toBeGreaterThanOrEqual(0);
    }
    expect(talentIndex('nope')).toBe(-1);
  });
});
