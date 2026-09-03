#!/usr/bin/env node
/**
 * assets/src/**\/*.png → assets/atlas/game.{json,png} + src/render/spriteKeys.gen.ts
 *
 * The folder path becomes the sprite key:
 *   assets/src/enemy/grunt/walk_00.png → 'enemy/grunt/walk_00'
 *
 * This is the whole "art enters without touching gameplay" pipeline (SPEC §13.4).
 * Dropping a PNG in and running this replaces a placeholder; nothing else moves.
 *
 * Usage: node tools/pack-atlas.mjs [--no-trim] [--max=2048] [--name=game]
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const SRC_DIR = 'assets/src';
const OUT_DIR = 'assets/atlas';
const GEN_FILE = 'src/render/spriteKeys.gen.ts';
const PAD = 2; // SPEC §13.3: stops bleeding at non-integer scale

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.split('=')[1];
};
const trimEnabled = !args.includes('--no-trim');
const maxSize = Number(flag('max', 2048));
const atlasName = flag('name', 'game');

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

function keyFor(path) {
  return relative(SRC_DIR, path).split(sep).join('/').replace(/\.png$/i, '');
}

/** Shrinks to the opaque bounding box, recording the offset for the pivot. */
function trim(img) {
  const { width: w, height: h, data } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] !== 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { w: 1, h: 1, ox: 0, oy: 0, pixels: Buffer.alloc(4) };
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const pixels = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    data.copy(pixels, y * tw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + tw) * 4);
  }
  return { w: tw, h: th, ox: x0, oy: y0, pixels };
}

/**
 * Shelf packer over power-of-two canvases.
 *
 * Not MaxRects: for a few hundred same-ish sized sprites the shelf result is
 * within a few percent of optimal and the code fits on a screen. Revisit if the
 * atlas ever stops fitting in 2048.
 */
function pack(items, size) {
  const placed = [];
  let shelfY = PAD;
  let shelfH = 0;
  let x = PAD;
  for (const it of items) {
    const w = it.w + PAD;
    const h = it.h + PAD;
    if (x + w > size) {
      shelfY += shelfH;
      shelfH = 0;
      x = PAD;
    }
    if (shelfY + h > size) return null;
    placed.push({ ...it, x, y: shelfY });
    x += w;
    if (h > shelfH) shelfH = h;
  }
  return placed;
}

const files = (await walk(SRC_DIR)).sort();
if (files.length === 0) {
  console.log(`[atlas] no PNGs in ${SRC_DIR}/ — leaving ${GEN_FILE} on manual keys.`);
  await writeGen([]);
  process.exit(0);
}

const items = [];
for (const file of files) {
  const img = decodePng(await readFile(file));
  const t = trimEnabled ? trim(img) : { w: img.width, h: img.height, ox: 0, oy: 0, pixels: img.data };
  items.push({
    key: keyFor(file),
    w: t.w,
    h: t.h,
    ox: t.ox,
    oy: t.oy,
    sourceW: img.width,
    sourceH: img.height,
    pixels: t.pixels,
    trimmed: t.w !== img.width || t.h !== img.height,
  });
}

// Tallest first: shelf packing wastes the least that way.
items.sort((a, b) => b.h - a.h || b.w - a.w || a.key.localeCompare(b.key));

let size = 128;
let placed = null;
while (size <= maxSize) {
  placed = pack(items, size);
  if (placed !== null) break;
  size *= 2;
}
if (placed === null) {
  console.error(`[atlas] does not fit in ${maxSize}x${maxSize}. Split the atlas or raise --max.`);
  process.exit(1);
}

const canvas = Buffer.alloc(size * size * 4);
for (const p of placed) {
  for (let y = 0; y < p.h; y++) {
    p.pixels.copy(canvas, ((p.y + y) * size + p.x) * 4, y * p.w * 4, (y + 1) * p.w * 4);
  }
}

const frames = {};
for (const p of [...placed].sort((a, b) => a.key.localeCompare(b.key))) {
  frames[p.key] = {
    frame: { x: p.x, y: p.y, w: p.w, h: p.h },
    pivot: { x: 0.5, y: 0.5 },
    trimmed: p.trimmed,
    spriteSourceSize: { x: p.ox, y: p.oy, w: p.w, h: p.h },
    sourceSize: { w: p.sourceW, h: p.sourceH },
  };
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, `${atlasName}.png`), encodePng(size, size, canvas));
await writeFile(
  join(OUT_DIR, `${atlasName}.json`),
  JSON.stringify(
    {
      meta: { image: `${atlasName}.png`, size: { w: size, h: size }, scale: 1, version: 1 },
      frames,
    },
    null,
    2,
  ) + '\n',
);
await writeGen(Object.keys(frames));

const used = placed.reduce((s, p) => s + p.w * p.h, 0);
console.log(
  `[atlas] ${placed.length} frames → ${OUT_DIR}/${atlasName}.png ${size}x${size} ` +
    `(${((used / (size * size)) * 100).toFixed(1)}% used)`,
);

async function writeGen(atlasKeys) {
  const list =
    atlasKeys.length === 0
      ? '  // (empty — no atlas packed yet)\n'
      : atlasKeys.map((k) => `  '${k}',`).join('\n') + '\n';
  const union =
    atlasKeys.length === 0
      ? 'export type SpriteKey = ManualSpriteKey;'
      : `export type SpriteKey = ManualSpriteKey | (typeof ATLAS_SPRITE_KEYS)[number];`;
  const body = `/**
 * GENERATED by \`npm run atlas\`. Do not edit by hand.
 *
 * The union below is what makes TypeScript fail the build when gameplay code
 * references a sprite that does not exist (SPEC §13.4).
 */
import type { ManualSpriteKey } from './spriteKeys.manual.ts';

/** Keys the packer found in the atlas. */
export const ATLAS_SPRITE_KEYS = [
${list}] as const;

${union}
`;
  if (existsSync(GEN_FILE)) {
    const current = await readFile(GEN_FILE, 'utf8');
    if (current === body) return;
  }
  await writeFile(GEN_FILE, body);
}
