import { GameLoop } from './core/loop.ts';
import { Rng } from './core/rng.ts';
import { Viewport } from './render/viewport.ts';
import { Input } from './platform/input.ts';
import { Lifecycle } from './platform/lifecycle.ts';
import { DebugOverlay } from './debug/overlay.ts';
import { Renderer } from './render/renderer.ts';
import { AssetRegistry } from './render/assetRegistry.ts';
import { missingSpriteKeys } from './render/drawSprite.ts';
import { createWorldView, syncWorldView } from './render/worldView.ts';
import { World } from './entities/world.ts';
import { AiSystem } from './systems/ai.ts';
import {
  integrateEnemies,
  integrateProjectiles,
  integrateParticles,
  integratePickups,
  integrateDamageNumbers,
  despawnStrays,
} from './systems/movement.ts';
import { stressFill } from './debug/stressSpawner.ts';
import { ST } from './entities/tower.ts';

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
const ai = new AiSystem();
const rng = new Rng(0x1205_9128);

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

/** M2 load check: keep the arena saturated so the profile is worst case. */
const STRESS_TARGET = readIntParam('enemies', 400);

function readIntParam(name: string, dflt: number): number {
  const raw = new URLSearchParams(window.location.search).get(name);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : dflt;
}
stressFill(world, STRESS_TARGET, rng);

const debugLines: string[] = ['', '', ''];

function simulate(dt: number): void {
  input.flush(dt);
  if (input.fourFingerTap) {
    input.fourFingerTap = false;
    overlay.toggle();
  }

  // Order per SPEC §12.3. Combat systems slot in between these at M3.
  world.rebuildHash();
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
  integrateParticles(world.particles, dt);
  integrateDamageNumbers(world.damageNumbers, dt);
  despawnStrays(world.enemies, world.tower.x, world.tower.y);

  // Top the arena back up so the load stays constant while profiling.
  stressFill(world, STRESS_TARGET, rng);

  debugLines[0] = `enemies ${world.enemies.liveCount}/${world.enemies.cap} · grid ${world.hash.size}`;
  debugLines[1] = `atlas ${assets.loaded ? 'on' : 'placeholders'} · drops ${world.enemies.droppedSpawns}`;
  const missing = missingSpriteKeys();
  debugLines[2] = missing.length === 0 ? 'sprites ok' : `MISSING ${missing.length}`;
  overlay.update(dt, {
    fps: loop.fps,
    simMs: loop.simMs,
    renderMs: loop.renderMs,
    steps: loop.stepsLastFrame,
    lines: debugLines,
  });
}

function render(alpha: number): void {
  syncWorldView(view, world, 0, 0);
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
  get simMs(): number {
    return Number(loop.simMs.toFixed(2));
  },
  get renderMs(): number {
    return Number(loop.renderMs.toFixed(2));
  },
};
