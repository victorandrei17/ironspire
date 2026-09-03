import { GameLoop } from './core/loop.ts';
import { Rng } from './core/rng.ts';
import { RunState } from './core/state.ts';
import { Viewport } from './render/viewport.ts';
import { Input } from './platform/input.ts';
import { Lifecycle } from './platform/lifecycle.ts';
import { DebugOverlay } from './debug/overlay.ts';
import { Renderer } from './render/renderer.ts';
import { AssetRegistry } from './render/assetRegistry.ts';
import { missingSpriteKeys } from './render/drawSprite.ts';
import { createWorldView, syncWorldView } from './render/worldView.ts';
import { World } from './entities/world.ts';
import { ST } from './entities/tower.ts';
import { AiSystem } from './systems/ai.ts';
import { TargetingSystem } from './systems/targeting.ts';
import { updateWeapons } from './systems/weapons.ts';
import { ProjectileSystem } from './systems/projectiles.ts';
import { EnemyCombatSystem } from './systems/enemyCombat.ts';
import { StatusSystem } from './systems/status.ts';
import { resolveDamage } from './systems/damage.ts';
import { updateRewards } from './systems/rewards.ts';
import { CameraSystem } from './systems/camera.ts';
import {
  integrateEnemies,
  integrateProjectiles,
  integrateParticles,
  integratePickups,
  integrateDamageNumbers,
  despawnStrays,
} from './systems/movement.ts';
import { stressFill } from './debug/stressSpawner.ts';
import { AURA_HZ } from './core/constants.ts';
import { BAL } from './data/balance.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

// alpha:false lets the browser skip transparency compositing (SPEC §16.4).
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

const viewport = new Viewport(canvas);
const input = new Input(viewport);
const overlay = new DebugOverlay(uiRoot);
const renderer = new Renderer(ctx, viewport);
const assets = new AssetRegistry();

const world = new World();
const view = createWorldView(world);
const run = new RunState();
const rng = new Rng(0x12059128);

const ai = new AiSystem();
const targeting = new TargetingSystem();
const projectiles = new ProjectileSystem();
const enemyCombat = new EnemyCombatSystem();
const status = new StatusSystem();
const camera = new CameraSystem(rng);

run.reset(rng.state, BAL.progression.xpBase, 1);

function resize(): void {
  viewport.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
input.attach(canvas);
overlay.attachKeyboard();

const lifecycle = new Lifecycle({
  onPause: () => {
    loop.timeScale = 0;
    input.clearActive();
  },
  onResume: () => {
    loop.timeScale = 1;
    loop.reset();
  },
});
lifecycle.attach();

// The atlas is optional by contract: absent means placeholders (SPEC §13.6).
void assets.load('game', viewport.dpr);

/** M3 load check: keep the arena saturated so the profile stays worst case. */
const STRESS_TARGET = readIntParam('enemies', 250);

function readIntParam(name: string, dflt: number): number {
  const raw = new URLSearchParams(window.location.search).get(name);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : dflt;
}

stressFill(world, STRESS_TARGET, rng);

const debugLines: string[] = ['', '', '', ''];

/** System order is SPEC §12.3. Do not reorder without updating the spec. */
function simulate(dt: number): void {
  input.flush(dt);
  if (input.fourFingerTap) {
    input.fourFingerTap = false;
    overlay.toggle();
  }

  run.time += dt;

  ai.update(world.enemies, world.hash, world.tower.x, world.tower.y, dt);

  integrateEnemies(world.enemies, dt);
  integrateProjectiles(world.projectiles, dt);
  integratePickups(
    world.pickups,
    dt,
    world.tower.x,
    world.tower.y,
    world.tower.stats.get(ST.PickupRadius),
  );

  world.rebuildHash();

  targeting.update(world.tower, world.enemies, world.hash, run.policy, dt);
  updateWeapons(world, dt);
  projectiles.update(world);
  enemyCombat.update(world, dt);
  status.update(world, dt, AURA_HZ);

  resolveDamage(world, run, rng, dt);
  updateRewards(world, run);

  integrateParticles(world.particles, dt);
  integrateDamageNumbers(world.damageNumbers, dt);
  despawnStrays(world.enemies, world.tower.x, world.tower.y);
  camera.update(dt);

  // Keep the arena topped up, and keep the tower alive, so the profile does not
  // quietly become "an empty screen". Waves and death arrive in M4.
  if (!world.tower.alive) {
    world.tower.hp = world.tower.hpMax;
    run.over = false;
  }
  stressFill(world, STRESS_TARGET, rng);

  debugLines[0] = `enemies ${world.enemies.liveCount} · proj ${world.projectiles.liveCount} · fx ${world.particles.liveCount}`;
  debugLines[1] = `hp ${world.tower.hp.toFixed(0)}/${world.tower.hpMax.toFixed(0)} · gold ${run.gold.toFixed(0)} · xp ${run.xp.toFixed(0)}`;
  debugLines[2] = `kills ${run.kills} · dmg ${run.damageDealt.toFixed(0)} · qOvf ${world.queue.overflow}`;
  const missing = missingSpriteKeys();
  debugLines[3] = missing.length === 0 ? 'sprites ok' : `MISSING ${missing.length}`;
  overlay.update(dt, {
    fps: loop.fps,
    simMs: loop.simMs,
    renderMs: loop.renderMs,
    steps: loop.stepsLastFrame,
    lines: debugLines,
  });
}

function render(alpha: number): void {
  syncWorldView(view, world, camera.x, camera.y);
  renderer.render(view, alpha);
}

const loop = new GameLoop(simulate, render);

function frame(now: number): void {
  requestAnimationFrame(frame);
  loop.frame(now);
}
requestAnimationFrame(frame);

// Exposed for the headless smoke test only.
(globalThis as unknown as { ironSpire: unknown }).ironSpire = {
  get fps(): number {
    return Math.round(loop.fps);
  },
  get missingSprites(): string[] {
    return missingSpriteKeys();
  },
  get atlasLoaded(): boolean {
    return assets.loaded;
  },
  get enemies(): number {
    return world.enemies.liveCount;
  },
  get kills(): number {
    return run.kills;
  },
  get gold(): number {
    return Math.round(run.gold);
  },
  get simMs(): number {
    return Number(loop.simMs.toFixed(2));
  },
  get renderMs(): number {
    return Number(loop.renderMs.toFixed(2));
  },
};
