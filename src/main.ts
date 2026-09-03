import { Game } from './game.ts';

/**
 * Bootstrap only. Everything that decides anything lives in `Game`.
 */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

// alpha:false lets the browser skip transparency compositing (SPEC §16.4).
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

const game = new Game(canvas, uiRoot, ctx);
game.start();

// Exposed for the headless smoke test only.
(globalThis as unknown as { ironSpire: unknown }).ironSpire = {
  get state(): Record<string, unknown> {
    return game.diagnostics;
  },
  play(): void {
    game.debugStartRun();
  },
};
