import { GameLoop } from './core/loop.ts';
import { Viewport } from './render/viewport.ts';
import { Input } from './platform/input.ts';
import { Lifecycle } from './platform/lifecycle.ts';
import { DebugOverlay } from './debug/overlay.ts';
import { VW, VH, TOWER_X, TOWER_Y, R_TOWER_BODY } from './core/constants.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

// alpha:false lets the browser skip transparency compositing (SPEC §16.4).
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

const viewport = new Viewport(canvas);
const input = new Input(viewport);
const overlay = new DebugOverlay(uiRoot);

let lastTapX = 0;
let lastTapY = 0;

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

const debugLines: string[] = ['', ''];

function simulate(dt: number): void {
  input.flush(dt, (type, _id, wx, wy) => {
    if (type === 0) {
      lastTapX = wx;
      lastTapY = wy;
    }
  });
  if (input.fourFingerTap) {
    input.fourFingerTap = false;
    overlay.toggle();
  }
  debugLines[0] = `tap ${lastTapX.toFixed(0)}, ${lastTapY.toFixed(0)}`;
  debugLines[1] = `vp ${viewport.cssW}x${viewport.cssH} dpr ${viewport.dpr} s ${viewport.scale.toFixed(3)}`;
  overlay.update(dt, {
    fps: loop.fps,
    simMs: loop.simMs,
    renderMs: loop.renderMs,
    steps: loop.stepsLastFrame,
    lines: debugLines,
  });
}

function render(_alpha: number): void {
  const { pixelW, pixelH, scale, offsetX, offsetY, dpr } = viewport;

  // Letterbox bars.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, pixelW, pixelH);

  // World transform: virtual units → device pixels, in one setTransform.
  const s = scale * dpr;
  ctx.setTransform(s, 0, 0, s, offsetX * dpr, offsetY * dpr);

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, VW, VH);

  ctx.strokeStyle = '#141a24';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= VW; x += 60) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VH);
  }
  for (let y = 0; y <= VH; y += 60) {
    ctx.moveTo(0, y);
    ctx.lineTo(VW, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#3a4a63';
  ctx.beginPath();
  ctx.arc(TOWER_X, TOWER_Y, R_TOWER_BODY, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7fd4a8';
  ctx.beginPath();
  ctx.arc(lastTapX, lastTapY, 6, 0, Math.PI * 2);
  ctx.fill();
}

const loop = new GameLoop(simulate, render);

function frame(now: number): void {
  requestAnimationFrame(frame);
  loop.frame(now);
}
requestAnimationFrame(frame);
