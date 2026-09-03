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

/** Enemies additionally expose health and flags, for hit bars and elite trim. */
export type EnemyLayer = SpriteLayer & {
  readonly hp: Float32Array;
  readonly hpMax: Float32Array;
  readonly radius: Float32Array;
  readonly flags: Uint16Array;
};

/** Floating numbers are blitted from the digit atlas, not from a sprite key. */
export type NumberLayer = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly value: Float32Array;
  readonly life: Float32Array;
  readonly lifeMax: Float32Array;
  readonly scale: Float32Array;
  readonly row: Uint8Array;
  readonly alive: Uint8Array;
  count: number;
};

/** Boss telegraphs and ground zones, drawn under everything else. */
export type HazardLayer = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly life: Float32Array;
  readonly lifeMax: Float32Array;
  readonly telegraphT: Float32Array;
  readonly telegraphMax: Float32Array;
  readonly kind: Uint8Array;
  readonly alive: Uint8Array;
  count: number;
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
  enemies: EnemyLayer;
  damageNumbers: NumberLayer;
  hazards: HazardLayer;
  projectiles: SpriteLayer;
  pickups: SpriteLayer;
  particles: SpriteLayer;
  tower: TowerView;
  /** Camera shake offset in world units, already resolved for this frame. */
  shakeX: number;
  shakeY: number;
  /** Draw the targeting range ring — a debug/UX affordance, toggleable. */
  showRange: boolean;
  /** Global multiplier on every hit flash (accessibility, SPEC §11.4). */
  flashScale: number;
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
