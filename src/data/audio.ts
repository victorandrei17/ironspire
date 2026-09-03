import type { SoundVoice } from '../platform/audio.ts';

/**
 * The sound catalogue (SPEC §14).
 *
 * Sounds are synthesised parameters, not files, which keeps the same promise
 * the sprite system makes: the game is complete with no assets, and recorded
 * audio can replace these later without touching a single call site.
 */
export const SFX = {
  Shoot: 0,
  Hit: 1,
  EnemyDeath: 2,
  TowerHit: 3,
  Pickup: 4,
  LevelUp: 5,
  UiTap: 6,
  Purchase: 7,
  Ability: 8,
  BossSpawn: 9,
} as const;

export type SfxId = (typeof SFX)[keyof typeof SFX];

export const SFX_VOICES: readonly SoundVoice[] = [
  { freq: 620, dur: 0.05, type: 'square', gain: 0.14, sweepTo: 340, bus: 'sfx' },
  { freq: 300, dur: 0.04, type: 'triangle', gain: 0.1, sweepTo: 180, bus: 'sfx' },
  { freq: 180, dur: 0.13, type: 'sawtooth', gain: 0.16, sweepTo: 60, bus: 'sfx' },
  { freq: 120, dur: 0.2, type: 'sawtooth', gain: 0.3, sweepTo: 48, bus: 'sfx' },
  { freq: 880, dur: 0.06, type: 'sine', gain: 0.12, sweepTo: 1320, bus: 'sfx' },
  { freq: 520, dur: 0.35, type: 'triangle', gain: 0.26, sweepTo: 1040, bus: 'ui' },
  { freq: 700, dur: 0.03, type: 'sine', gain: 0.1, sweepTo: 0, bus: 'ui' },
  { freq: 460, dur: 0.07, type: 'square', gain: 0.12, sweepTo: 720, bus: 'ui' },
  { freq: 240, dur: 0.28, type: 'sawtooth', gain: 0.28, sweepTo: 900, bus: 'sfx' },
  { freq: 90, dur: 0.7, type: 'sawtooth', gain: 0.34, sweepTo: 40, bus: 'sfx' },
];
