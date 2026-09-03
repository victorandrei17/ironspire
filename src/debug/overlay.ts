/**
 * Debug overlay (SPEC §16.3): FPS, sim/render ms, pool counts.
 *
 * DOM, not canvas, and refreshed at 5 Hz — a per-frame textContent write would
 * itself show up in the profile we are trying to read.
 */
export type DebugStats = {
  fps: number;
  simMs: number;
  renderMs: number;
  steps: number;
  lines: string[];
};

const REFRESH_SEC = 0.2;

export class DebugOverlay {
  visible = false;
  private readonly el: HTMLDivElement;
  private acc = 0;
  private detach: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  attachKeyboard(): void {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    this.detach = (): void => window.removeEventListener('keydown', onKey);
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  update(dt: number, stats: DebugStats): void {
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < REFRESH_SEC) return;
    this.acc = 0;
    // String building here is fine: 5 Hz, and only while the overlay is open.
    let text = `${stats.fps.toFixed(0)} fps · sim ${stats.simMs.toFixed(2)}ms · draw ${stats.renderMs.toFixed(2)}ms · x${stats.steps}`;
    for (let i = 0; i < stats.lines.length; i++) text += '\n' + stats.lines[i];
    this.el.textContent = text;
  }
}
