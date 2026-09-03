import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dependency arrow only points right (CLAUDE.md §3):
 *   data -> core -> entities -> systems -> render -> ui
 * Encoded as a test because a violation is invisible until it becomes a cycle.
 */
const FORBIDDEN: Record<string, string[]> = {
  'src/core': ['data', 'entities', 'systems', 'render', 'ui', 'platform', 'save', 'debug'],
  'src/data': ['entities', 'systems', 'render', 'ui', 'platform', 'save', 'debug'],
  'src/entities': ['systems', 'ui', 'platform', 'save', 'debug'],
  'src/systems': ['render', 'ui', 'debug'],
  'src/render': ['systems', 'ui'],
  'src/platform': ['data', 'entities', 'systems', 'ui', 'save'],
};

function files(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Type-only imports are erased at build time and cannot create a cycle. */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s+(?!type\s)([\s\S]*?)from\s+'([^']+)'/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (/^\s*\{\s*type\s/.test(m[1] ?? '') && !/,/.test(m[1] ?? '')) continue;
    out.push(m[2] ?? '');
  }
  return out;
}

describe('module layering', () => {
  it('never imports against the dependency arrow', () => {
    const violations: string[] = [];
    for (const [dir, banned] of Object.entries(FORBIDDEN)) {
      for (const file of files(dir)) {
        const src = readFileSync(file, 'utf8');
        for (const spec of valueImports(src)) {
          if (!spec.startsWith('.')) continue;
          for (const b of banned) {
            if (spec.includes(`/${b}/`)) violations.push(`${file} -> ${spec}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('render/ only ever reads gameplay state, it never imports a system', () => {
    const violations: string[] = [];
    for (const file of files('src/render')) {
      const src = readFileSync(file, 'utf8');
      if (/from '\.\.\/systems\//.test(src)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });
});
