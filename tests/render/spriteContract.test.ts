import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePlaceholder, registerPlaceholder, clearPlaceholders } from '../../src/render/placeholders.ts';
import { listManualSpriteKeys } from '../../src/render/spriteKeys.manual.ts';

/** Strips comments so a rule's own explanatory prose does not trip it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('sprite contract (SPEC §13)', () => {
  it('every declared sprite key has a placeholder', async () => {
    // Importing for the side-effect registrations; no DOM is touched at load.
    await import('../../src/render/placeholderArt.ts');
    const missing = listManualSpriteKeys().filter((k) => resolvePlaceholder(k) === undefined);
    expect(missing).toEqual([]);
  });

  it('ctx.drawImage appears only in the render files allowed to blit', () => {
    // These four own every blit: the sprite resolver, the VFX layer, the digit
    // sheet, and the two offscreen bakers. Anything else is a contract break.
    const allowed = new Set([
      'drawSprite.ts',
      'vfx.ts',
      'digitAtlas.ts',
      'placeholders.ts',
      'assetRegistry.ts',
      'renderer.ts',
    ]);
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const base = file.split('/').pop() ?? '';
      if (allowed.has(base)) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      if (/\.drawImage\s*\(/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('gameplay code never draws vector art', () => {
    const offenders: string[] = [];
    for (const dir of ['src/systems', 'src/entities', 'src/core', 'src/data']) {
      let files: string[];
      try {
        files = sourceFiles(dir);
      } catch {
        continue;
      }
      for (const file of files) {
        const src = stripComments(readFileSync(file, 'utf8'));
        if (/ctx\.(beginPath|arc|fillRect|moveTo|drawImage)\s*\(/.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('core/ and data/ never touch the DOM', () => {
    const offenders: string[] = [];
    for (const dir of ['src/core', 'src/data']) {
      let files: string[];
      try {
        files = sourceFiles(dir);
      } catch {
        continue;
      }
      for (const file of files) {
        const src = stripComments(readFileSync(file, 'utf8'));
        if (/\b(document|window|CanvasRenderingContext2D|HTMLElement)\b/.test(src)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('shadowBlur and canvas filter are banned everywhere (SPEC §16.4)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const src = stripComments(readFileSync(file, 'utf8'));
      if (/\.shadowBlur\s*=/.test(src) || /\.filter\s*=\s*['`"]/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('placeholder pattern matching', () => {
  it('prefers an exact key over a prefix, and the longest prefix otherwise', () => {
    clearPlaceholders();
    const noop = (): void => {};
    registerPlaceholder('enemy/*', 10, noop);
    registerPlaceholder('enemy/grunt/*', 20, noop);
    registerPlaceholder('enemy/grunt/walk_00', 30, noop);

    expect(resolvePlaceholder('enemy/grunt/walk_00')?.size).toBe(30);
    expect(resolvePlaceholder('enemy/grunt/walk_01')?.size).toBe(20);
    expect(resolvePlaceholder('enemy/runner/walk_00')?.size).toBe(10);
    expect(resolvePlaceholder('tower/base')).toBeUndefined();
    clearPlaceholders();
  });

  it('re-registering a prefix replaces it instead of stacking', () => {
    clearPlaceholders();
    const noop = (): void => {};
    registerPlaceholder('fx/*', 1, noop);
    registerPlaceholder('fx/*', 2, noop);
    expect(resolvePlaceholder('fx/spark')?.size).toBe(2);
    clearPlaceholders();
  });
});
