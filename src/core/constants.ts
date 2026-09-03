/**
 * Canonical world constants (SPEC §22).
 * Everything here is in *virtual units* (u). Nothing here is a screen pixel.
 */

/** Virtual design resolution — portrait 9:16. All gameplay math lives in this space. */
export const VW = 720;
export const VH = 1280;

/**
 * Tower sits slightly above the geometric center so the bottom HUD does not
 * compete with the action (SPEC §3.3).
 */
export const TOWER_X = 360;
export const TOWER_Y = 620;

export const R_SPAWN = 560;
export const R_DESPAWN = 700;
export const R_TOWER_BODY = 34;
/** Radius of the floor vignette/tint gradient. */
export const ARENA_TINT_R = 520;

export const FIXED_DT = 1 / 60;
/** Clamps the death spiral: a 3s stall must not queue 180 catch-up ticks. */
export const MAX_FRAME = 0.25;
export const MAX_CATCHUP = 5;

export const CELL_SIZE = 64;

export const ENEMY_CAP = 400;
export const PROJ_CAP = 800;
export const PARTICLE_CAP = 1200;
export const PICKUP_CAP = 300;
export const DMGNUM_CAP = 120;

export const TARGETING_HZ = 10;
export const AURA_HZ = 10;

export const AUTOSAVE_SEC = 10;
export const WAVE_GAP = 2.0;
export const IFRAME_SEC = 0.25;

/** Above 2 the fill-rate cost is not worth it on small screens (SPEC §3.2). */
export const MAX_DPR = 2;

export const TAU = Math.PI * 2;
