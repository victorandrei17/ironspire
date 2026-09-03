import { VW, VH, ENEMY_CAP, R_TOWER_BODY } from '../core/constants.ts';
import type { Viewport } from './viewport.ts';
import type { RenderWorld, SpriteLayer, EnemyLayer } from './renderWorld.ts';
import { drawSprite, setWorldTransform, applyWorldTransform } from './drawSprite.ts';
import { Ground } from './ground.ts';
import { YSorter } from './layers.ts';
import { drawInt } from './digitAtlas.ts';
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
  private shadowCanvas: HTMLCanvasElement | null = null;
  /** Wall-clock seconds, for cosmetic pulses only — never for simulation. */
  private time = 0;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly viewport: Viewport,
  ) {}

  render(world: RenderWorld, alpha: number): void {
    const ctx = this.ctx;
    const vp = this.viewport;
    const pixelScale = vp.scale * vp.dpr;
    this.flashScale = world.flashScale;
    this.time = performance.now() * 0.001;

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

    // Hazards sit on the floor, under everything that stands on it.
    this.drawHazards(world);
    this.drawShadows(world, alpha);

    if (world.showRange) this.drawRangeRing(world);

    this.drawEnemiesSorted(world.enemies, alpha);
    this.drawTower(world);
    this.drawLayer(world.projectiles, alpha);
    this.drawLayer(world.particles, alpha);
    this.drawEnemyHealthBars(world, alpha);
    this.drawDamageNumbers(world, alpha);
  }

  /**
   * Health pips above wounded enemies. Only drawn for enemies that have
   * actually been hit — 400 permanently full bars is visual noise and 800 extra
   * fills a frame.
   */
  private drawEnemyHealthBars(world: RenderWorld, alpha: number): void {
    const e = world.enemies;
    const ctx = this.ctx;
    applyWorldTransform(ctx);
    for (let i = 0; i < e.count; i++) {
      if (e.alive[i] === 0) continue;
      const hp = e.hp[i] ?? 0;
      const max = e.hpMax[i] ?? 1;
      if (hp >= max || hp <= 0) continue;
      const x = lerpArr(e.prevX, e.x, i, alpha);
      const y = lerpArr(e.prevY, e.y, i, alpha) - (e.radius[i] ?? 12) - 9;
      const w = 26 * (e.scale[i] ?? 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - w / 2, y, w, 3.5);
      ctx.fillStyle = '#e2564d';
      ctx.fillRect(x - w / 2, y, w * (hp / max), 3.5);
    }
  }

  private drawDamageNumbers(world: RenderWorld, alpha: number): void {
    const d = world.damageNumbers;
    const ctx = this.ctx;
    applyWorldTransform(ctx);
    for (let i = 0; i < d.count; i++) {
      if (d.alive[i] === 0) continue;
      const life = d.life[i] ?? 0;
      const max = d.lifeMax[i] ?? 1;
      const t = life / max;
      ctx.globalAlpha = t < 0.35 ? t / 0.35 : 1;
      drawInt(
        ctx,
        d.value[i] ?? 0,
        lerpArr(d.prevX, d.x, i, alpha),
        lerpArr(d.prevY, d.y, i, alpha),
        d.scale[i] ?? 1,
        d.row[i] ?? 0,
      );
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Telegraphs and ground zones (SPEC §5.2).
   *
   * A telegraph fills from the outside in as its timer runs down, so the player
   * reads *when* it lands, not just where. The live zone is a steady fill.
   */
  private drawHazards(world: RenderWorld): void {
    const h = world.hazards;
    if (h.count === 0) return;
    const ctx = this.ctx;
    applyWorldTransform(ctx);
    for (let i = 0; i < h.count; i++) {
      if (h.alive[i] === 0) continue;
      const x = h.x[i] ?? 0;
      const y = h.y[i] ?? 0;
      const r = h.radius[i] ?? 0;
      const tel = h.telegraphT[i] ?? 0;
      const telMax = h.telegraphMax[i] ?? 0;

      if (tel > 0 && telMax > 0) {
        const t = 1 - tel / telMax;
        ctx.fillStyle = 'rgba(226,86,77,0.16)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(226,86,77,0.34)';
        ctx.beginPath();
        ctx.arc(x, y, r * t, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,140,120,0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      const fade = Math.min(1, (h.life[i] ?? 0) / Math.max(0.001, (h.lifeMax[i] ?? 1) * 0.3));
      ctx.fillStyle = `rgba(168,111,240,${(0.26 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(200,160,255,${(0.7 * fade).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Shadows are a baked bitmap blitted per enemy, not a path fill.
   *
   * 400 ellipse fills a frame means 400 path rasterisations; one baked sprite
   * scaled per enemy is a single texture read each. This measured as the single
   * biggest render cost in the M2 load test.
   */
  private drawShadows(world: RenderWorld, alpha: number): void {
    const shadow = this.ensureShadow();
    if (shadow === null) return;
    const e = world.enemies;
    const ctx = this.ctx;
    applyWorldTransform(ctx);
    const src = shadow.width;
    for (let i = 0; i < e.count; i++) {
      if (e.alive[i] === 0) continue;
      const x = lerpArr(e.prevX, e.x, i, alpha);
      const y = lerpArr(e.prevY, e.y, i, alpha);
      const w = (e.scale[i] ?? 1) * 30;
      const h = w * 0.44;
      ctx.drawImage(shadow, 0, 0, src, src, x - w * 0.5, y + h * 0.2, w, h);
    }
  }

  /** Radial-gradient blob, baked once. */
  private ensureShadow(): HTMLCanvasElement | null {
    if (this.shadowCanvas !== null) return this.shadowCanvas;
    const px = 48;
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const g2 = c.getContext('2d');
    if (g2 === null) return null;
    const grad = g2.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.38)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, px, px);
    this.shadowCanvas = c;
    return c;
  }

  /** Set from the reduce-flash preference before each frame. */
  private flashScale = 1;

  private drawEnemiesSorted(e: EnemyLayer, alpha: number): void {
    this.ySorter.build(e.y, e.alive, e.count);
    const order = this.ySorter.order;
    const ctx = this.ctx;
    for (let k = 0; k < this.ySorter.length; k++) {
      const i = order[k] ?? 0;
      const key = e.keys[e.spriteIdx[i] ?? 0];
      if (key === undefined) continue;

      // Elite trim is an OVERLAY, never a recolour: the archetype's silhouette
      // and hue have to stay readable (SPEC §13.7).
      if (((e.flags[i] ?? 0) & ELITE_FLAG) !== 0) {
        applyWorldTransform(ctx);
        const ex = lerpArr(e.prevX, e.x, i, alpha);
        const ey = lerpArr(e.prevY, e.y, i, alpha);
        const pulse = 1 + Math.sin(this.time * 4 + i) * 0.06;
        ctx.strokeStyle = 'rgba(242,193,78,0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ex, ey, (e.radius[i] ?? 14) * 1.25 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      drawSprite(
        this.ctx,
        key,
        lerpArr(e.prevX, e.x, i, alpha),
        lerpArr(e.prevY, e.y, i, alpha),
        e.rot[i] ?? 0,
        e.scale[i] ?? 1,
        e.alpha[i] ?? 1,
        (e.flash[i] ?? 0) * this.flashScale,
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
    // Capped: under a sustained swarm the tower is re-hit every i-frame window,
    // and a fully white silhouette would erase the one thing that must stay
    // readable at all times (SPEC §11.2 rule 3).
    const flash = Math.min(t.flash, 0.55) * this.flashScale;
    drawSprite(this.ctx, 'tower/base', t.x, t.y, 0, 1, 1, flash);
    drawSprite(this.ctx, 'tower/cannon', t.x, t.y, t.aimRot, 1, 1, flash);
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

/** EF.Elite. Duplicated as a bare bit so render/ stays out of gameplay data. */
const ELITE_FLAG = 1;

function lerpArr(prev: Float32Array, cur: Float32Array, i: number, a: number): number {
  const p = prev[i] ?? 0;
  const c = cur[i] ?? 0;
  return p + (c - p) * a;
}
