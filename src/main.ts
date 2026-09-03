import { GameLoop } from './core/loop.ts';
import { Viewport } from './render/viewport.ts';
import { Input } from './platform/input.ts';
import { Lifecycle } from './platform/lifecycle.ts';
import { DebugOverlay } from './debug/overlay.ts';
import { Renderer } from './render/renderer.ts';
import { AssetRegistry } from './render/assetRegistry.ts';
import { missingSpriteKeys } from './render/drawSprite.ts';
import { buildDemoWorld, animateDemoWorld } from './debug/demoScene.ts';
import { FIXED_DT } from './core/constants.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

// alpha:false lets the browser skip transparency compositing (SPEC §16.4).
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

const viewport = new Viewport(canvas);
const input = new Input(viewport);
const overlay = new DebugOverlay(uiRoot);
const renderer = new Renderer(ctx, viewport);
const assets = new AssetRegistry();
const world = buildDemoWorld();

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

// The atlas is optional by contract: if it is absent the placeholders carry the
// whole game (SPEC §13.6). Nothing below waits on this promise.
void assets.load('game', viewport.dpr);

let elapsed = 0;
const debugLines: string[] = ['', '', ''];

function simulate(dt: number): void {
  input.flush(dt);
  if (input.fourFingerTap) {
    input.fourFingerTap = false;
    overlay.toggle();
  }
  elapsed += dt;
  animateDemoWorld(world, elapsed);

  debugLines[0] = `atlas ${assets.loaded ? 'loaded' : 'absent → placeholders'}`;
  debugLines[1] = `enemies ${world.enemies.count} · vp ${viewport.cssW}x${viewport.cssH} @${viewport.dpr}`;
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
  renderer.render(world, alpha);
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
  get simSteps(): number {
    return Math.round(elapsed / FIXED_DT);
  },
  get simMs(): number {
    return Number(loop.simMs.toFixed(2));
  },
  get renderMs(): number {
    return Number(loop.renderMs.toFixed(2));
  },
};
