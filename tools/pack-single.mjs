/**
 * Packs `dist/` into one self-contained HTML file.
 *
 * Why: sharing the game as a link (or dropping it into a host that only accepts
 * a single page) has no place to serve `assets/*` from. The build already has
 * no runtime dependency and no fetched asset — the atlas is resolved at build
 * time and the placeholders are procedural — so the whole game is exactly one
 * CSS file plus one JS chunk, and inlining both loses nothing.
 *
 * The output omits <html>/<head>/<body> so it can also be pasted into a host
 * that supplies its own document skeleton.
 *
 * Usage: node tools/pack-single.mjs [outFile]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = resolve(process.argv[2] ?? join(dist, 'iron-spire.single.html'));

const html = readFileSync(join(dist, 'index.html'), 'utf8');

const scriptSrc = /<script type="module"[^>]*src="\.\/([^"]+)"/.exec(html)?.[1];
const styleHref = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/.exec(html)?.[1];
if (scriptSrc === undefined || styleHref === undefined) {
  throw new Error('dist/index.html does not look like a Vite build (no entry script/stylesheet)');
}

const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1];
if (body === undefined) throw new Error('dist/index.html has no <body>');

const css = readFileSync(join(dist, styleHref), 'utf8');
const js = readFileSync(join(dist, scriptSrc), 'utf8');

// A closing tag inside the inlined text would end the element early. The build
// has never produced one, so this is a guard rather than an escaper: silently
// rewriting minified output is a worse failure mode than refusing to pack.
if (js.includes('</script')) throw new Error('bundle contains "</script"; cannot inline verbatim');
if (css.includes('</style')) throw new Error('stylesheet contains "</style"; cannot inline verbatim');

const page = `<title>Iron Spire</title>
<style>
${css}</style>
${body.trim()}
<script>
  // No sibling files exist in a single-file page, so the worker registration
  // would 404. Stubbing it here keeps pwa.ts honest for the real build (where
  // the worker is what makes the game installable and playable offline) while
  // this copy starts with a clean console.
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
</script>
<script type="module">
${js}</script>
`;

writeFileSync(out, page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
process.stdout.write(`packed ${out} (${kb} KB)\n`);
