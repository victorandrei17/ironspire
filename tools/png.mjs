/**
 * Minimal PNG decode/encode on top of node:zlib.
 *
 * Written by hand rather than pulling in `sharp`: the atlas packer runs at most
 * a few times a day on a developer machine, and a 30 MB native dependency to
 * move some bytes around is not a trade this project makes.
 *
 * Supports the 8-bit non-interlaced colour types an art pipeline actually
 * exports (greyscale, RGB, palette, greyscale+alpha, RGBA).
 */
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Decodes a PNG buffer to { width, height, data } with data as RGBA8. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];

  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') trns = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
  }

  if (ihdr === null) throw new Error('PNG has no IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported bit depth ${ihdr.bitDepth} (need 8)`);
  if (ihdr.interlace !== 0) throw new Error('interlaced PNG not supported');
  const ch = CHANNELS[ihdr.colorType];
  if (ch === undefined) throw new Error(`unsupported colour type ${ihdr.colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * ch;
  const pixels = Buffer.alloc(stride * height);

  // Undo the per-scanline filters (PNG spec 9.2).
  let rp = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      const x = line[i];
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) v = x + paeth(a, b, c);
      else throw new Error(`bad PNG filter ${filter}`);
      out[i] = v & 0xff;
    }
    prev = out;
  }

  return { width, height, data: toRgba(pixels, width, height, ihdr.colorType, palette, trns) };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toRgba(px, width, height, colorType, palette, trns) {
  const n = width * height;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (colorType === 6) {
      px.copy(out, o, i * 4, i * 4 + 4);
    } else if (colorType === 2) {
      out[o] = px[i * 3];
      out[o + 1] = px[i * 3 + 1];
      out[o + 2] = px[i * 3 + 2];
      out[o + 3] = 255;
    } else if (colorType === 0) {
      out[o] = out[o + 1] = out[o + 2] = px[i];
      out[o + 3] = 255;
    } else if (colorType === 4) {
      out[o] = out[o + 1] = out[o + 2] = px[i * 2];
      out[o + 3] = px[i * 2 + 1];
    } else {
      const idx = px[i];
      out[o] = palette[idx * 3];
      out[o + 1] = palette[idx * 3 + 1];
      out[o + 2] = palette[idx * 3 + 2];
      out[o + 3] = trns !== null && idx < trns.length ? trns[idx] : 255;
    }
  }
  return out;
}

/** Encodes RGBA8 pixel data as a PNG buffer. */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    // Filter 0 (none): the atlas is mostly transparent runs, which deflate
    // already handles well; adaptive filtering would not pay for itself here.
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)) >>> 0, 8 + body.length);
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
