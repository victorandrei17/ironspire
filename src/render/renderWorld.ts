import type { SpriteKey } from './spriteKeys.gen.ts';

/**
 * What the renderer is allowed to see.
 *
 * The renderer is dumb (SPEC §12.1 rule 5): it reads these arrays and draws.
 * Declaring the shape here instead of importing the pools keeps `render/` from
 * depending on `entities/` internals, and lets M1 stand up before the pools do.
 */
export type SpriteLayer = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly rot: Float32Array;
  readonly scale: Float32Array;
  readonly alive: Uint8Array;
  /** Index into `keys`. */
  readonly spriteIdx: Uint16Array;
  /** 0..1 white flash for hit feedback. */
  readonly flash: Float32Array;
  readonly alpha: Float32Array;
  /** High-water mark for iteration. */
  count: number;
  readonly keys: readonly SpriteKey[];
};

export type TowerView = {
  x: number;
  y: number;
  aimRot: number;
  hp: number;
  hpMax: number;
  range: number;
  /** 0..1 damage flash. */
  flash: number;
  shieldT: number;
};

export type RenderWorld = {
  enemies: SpriteLayer;
  projectiles: SpriteLayer;
  pickups: SpriteLayer;
  particles: SpriteLayer;
  tower: TowerView;
  /** Camera shake offset in world units, already resolved for this frame. */
  shakeX: number;
  shakeY: number;
  /** Draw the targeting range ring — a debug/UX affordance, toggleable. */
  showRange: boolean;
};

/** Allocates an empty layer of `cap` slots. Called at boot, never in a frame. */
export function makeSpriteLayer(cap: number, keys: readonly SpriteKey[]): SpriteLayer {
  return {
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    prevX: new Float32Array(cap),
    prevY: new Float32Array(cap),
    rot: new Float32Array(cap),
    scale: new Float32Array(cap).fill(1),
    alive: new Uint8Array(cap),
    spriteIdx: new Uint16Array(cap),
    flash: new Float32Array(cap),
    alpha: new Float32Array(cap).fill(1),
    count: 0,
    keys,
  };
}
