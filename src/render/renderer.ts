import { VW, VH, ENEMY_CAP, R_TOWER_BODY } from '../core/constants.ts';
import type { Viewport } from './viewport.ts';
import type { RenderWorld, SpriteLayer } from './renderWorld.ts';
import { drawSprite, setWorldTransform, applyWorldTransform } from './drawSprite.ts';
import { Ground } from './ground.ts';
import { YSorter } from './layers.ts';
import './placeholderArt.ts';

/**
 * Reads world state, draws a frame. Decides nothing, mutates nothing
 * (SPEC §12.1 rule 5).
 *
 * `alpha` interpolates between the previous and current simulation states so
 * motion is smooth even when rAF jitters against the fixed timestep.
 */
export class Renderer {
  private readonly ground = new Ground();
  private readonly ySorter = new YSorter(ENEMY_CAP);

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly viewport: Viewport,
  ) {}

  render(world: RenderWorld, alpha: number): void {
    const ctx = this.ctx;
    const vp = this.viewport;
    const pixelScale = vp.scale * vp.dpr;

    // alpha:false means every pixel must be written each frame, but the arena
    // blit covers the middle — so only the letterbox bars need clearing. On a
    // fill-rate bound device this is one full-screen fill saved per frame.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    const barX = Math.ceil(vp.offsetX * vp.dpr);
    const barY = Math.ceil(vp.offsetY * vp.dpr);
    if (barY > 0) {
      ctx.fillRect(0, 0, vp.pixelW, barY);
      ctx.fillRect(0, vp.pixelH - barY - 1, vp.pixelW, barY + 1);
    }
    if (barX > 0) {
      ctx.fillRect(0, 0, barX, vp.pixelH);
      ctx.fillRect(vp.pixelW - barX - 1, 0, barX + 1, vp.pixelH);
    }

    const ox = (vp.offsetX + world.shakeX * vp.scale) * vp.dpr;
    const oy = (vp.offsetY + world.shakeY * vp.scale) * vp.dpr;
    setWorldTransform(pixelScale, 0, 0, pixelScale, ox, oy);
    applyWorldTransform(ctx);

    const groundCanvas = this.ground.ensure(Math.min(pixelScale, 2));
    if (groundCanvas !== null) {
      ctx.drawImage(groundCanvas, 0, 0, groundCanvas.width, groundCanvas.height, 0, 0, VW, VH);
    } else {
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, VW, VH);
    }

    this.drawShadows(world, alpha);
    this.drawLayer(world.pickups, alpha);

    if (world.showRange) this.drawRangeRing(world);

    this.drawEnemiesSorted(world.enemies, alpha);
    this.drawTower(world);
    this.drawLayer(world.projectiles, alpha);
    this.drawLayer(world.particles, alpha);
  }

  /** One flattened ellipse per enemy: cheap grounding, no shadowBlur. */
  private drawShadows(world: RenderWorld, alpha: number): void {
    const e = world.enemies;
    applyWorldTransform(this.ctx);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < e.count; i++) {
      if (e.alive[i] === 0) continue;
      const x = lerpArr(e.prevX, e.x, i, alpha);
      const y = lerpArr(e.prevY, e.y, i, alpha);
      const r = (e.scale[i] ?? 1) * 13;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.65, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawEnemiesSorted(e: SpriteLayer, alpha: number): void {
    this.ySorter.build(e.y, e.alive, e.count);
    const order = this.ySorter.order;
    for (let k = 0; k < this.ySorter.length; k++) {
      const i = order[k] ?? 0;
      const key = e.keys[e.spriteIdx[i] ?? 0];
      if (key === undefined) continue;
      drawSprite(
        this.ctx,
        key,
        lerpArr(e.prevX, e.x, i, alpha),
        lerpArr(e.prevY, e.y, i, alpha),
        e.rot[i] ?? 0,
        e.scale[i] ?? 1,
        e.alpha[i] ?? 1,
        e.flash[i] ?? 0,
      );
    }
  }

  private drawLayer(layer: SpriteLayer, alpha: number): void {
    for (let i = 0; i < layer.count; i++) {
      if (layer.alive[i] === 0) continue;
      const key = layer.keys[layer.spriteIdx[i] ?? 0];
      if (key === undefined) continue;
      drawSprite(
        this.ctx,
        key,
        lerpArr(layer.prevX, layer.x, i, alpha),
        lerpArr(layer.prevY, layer.y, i, alpha),
        layer.rot[i] ?? 0,
        layer.scale[i] ?? 1,
        layer.alpha[i] ?? 1,
        layer.flash[i] ?? 0,
      );
    }
  }

  private drawTower(world: RenderWorld): void {
    const t = world.tower;
    drawSprite(this.ctx, 'tower/base', t.x, t.y, 0, 1, 1, t.flash);
    drawSprite(this.ctx, 'tower/cannon', t.x, t.y, t.aimRot, 1, 1, t.flash);
    drawSprite(this.ctx, 'tower/core', t.x, t.y, 0, 1, 1, 0);
    if (t.shieldT > 0) {
      drawSprite(this.ctx, 'tower/shield', t.x, t.y, 0, 1 + 0.04 * t.shieldT, t.shieldT, 0);
    }
  }

  private drawRangeRing(world: RenderWorld): void {
    const ctx = this.ctx;
    applyWorldTransform(ctx);
    ctx.strokeStyle = 'rgba(159,232,255,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(world.tower.x, world.tower.y, world.tower.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(159,232,255,0.10)';
    ctx.beginPath();
    ctx.arc(world.tower.x, world.tower.y, R_TOWER_BODY, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function lerpArr(prev: Float32Array, cur: Float32Array, i: number, a: number): number {
  const p = prev[i] ?? 0;
  const c = cur[i] ?? 0;
  return p + (c - p) * a;
}
