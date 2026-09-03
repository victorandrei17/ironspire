#!/usr/bin/env node
/**
 * Generates the PWA icons from the same procedural mark the boot screen uses.
 *
 * Written rather than drawn for the same reason the placeholders are: the
 * project must be complete and shippable before an artist is involved, and a
 * missing icon file is a store rejection, not a cosmetic gap.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from './png.mjs';

const BG = [11, 13, 18, 255];
const SPIRE = [127, 212, 168, 255];
const CORE = [159, 232, 255, 255];

/** Draws the mark: a tall spire silhouette with a bright core. */
function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  // Maskable icons are cropped to a circle by the launcher, so the art has to
  // sit inside the safe zone (80% of the canvas).
  const inset = maskable ? size * 0.18 : size * 0.1;
  const cx = size / 2;
  const topY = inset;
  const botY = size - inset;
  const halfW = (size - inset * 2) * 0.3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      let c = BG;
      if (y >= topY && y <= botY) {
        // Triangle tapering from a point at the top to the full width at the base.
        const t = (y - topY) / (botY - topY);
        const w = halfW * Math.min(1, t * 1.6);
        if (Math.abs(x - cx) <= w) c = SPIRE;
      }
      const dx = x - cx;
      const dy = y - (topY + (botY - topY) * 0.62);
      if (dx * dx + dy * dy <= (size * 0.09) ** 2) c = CORE;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = c[3];
    }
  }
  return encodePng(size, size, px);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', render(192, false));
writeFileSync('public/icon-512.png', render(512, false));
writeFileSync('public/icon-maskable.png', render(512, true));
console.log('[icons] public/icon-{192,512,maskable}.png');
