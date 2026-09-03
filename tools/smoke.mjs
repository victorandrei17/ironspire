/**
 * Headless browser smoke test: boots the built game, watches the console for
 * errors, samples FPS, and writes a screenshot. Part of the Definition of Done
 * ("runs in the browser with no console error").
 *
 * Usage: node tools/smoke.mjs [seconds] [outPng] [--throttle=N]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const seconds = Number(process.argv[2] ?? 6);
const outPng = process.argv[3] ?? 'scratch/smoke.png';
const flag = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : Number(hit.split('=')[1]);
};
const throttle = flag('throttle', 1);
const dpr = flag('dpr', 2);
const dir = 'dist';
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const path = join(dir, normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// The pinned browser build in this environment may differ from what the npm
// package expects; point at the preinstalled binary when it exists.
const execPath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const launchOpts = existsSync(execPath) ? { executablePath: execPath } : {};
// Headless Chromium rasterises canvas on the CPU by default, which makes fill
// rate — not our code — the bottleneck. --use-gl=swiftshader at least keeps the
// GPU path warm; the numbers to trust are simMs/renderMs, not the raw FPS.
if (process.argv.includes('--gpu')) {
  launchOpts.args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu-rasterization'];
}
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: dpr,
  hasTouch: true,
  isMobile: true,
});

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

if (throttle > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}

const query = process.argv.find((a) => a.startsWith('--q=')) ?? '';
await page.goto(`http://127.0.0.1:${port}/${query ? '?' + query.slice(4) : ''}`, { waitUntil: 'load' });
await page.evaluate(() => {
  globalThis.__frames = 0;
  const tick = () => {
    globalThis.__frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// Sample the JS heap across the run: a rising floor means we are allocating in
// the hot loop, which is the one thing the pool design exists to prevent.
const heap = [];
const sampler = setInterval(async () => {
  try {
    const used = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    if (used > 0) heap.push(used);
  } catch {
    /* page closed */
  }
}, 500);
await page.waitForTimeout(seconds * 1000);
clearInterval(sampler);
const frames = await page.evaluate(() => globalThis.__frames);
const hooks = await page.evaluate(() => globalThis.ironSpire ?? null);

await page.screenshot({ path: outPng });
await browser.close();
server.close();

console.log(`fps ~ ${(frames / seconds).toFixed(1)} (throttle ${throttle}x, ${seconds}s)`);
if (heap.length > 2) {
  const mb = (b) => (b / 1048576).toFixed(2);
  // Compare the second half's minimum to the first half's: the minimum is the
  // post-GC floor, and a flat floor is what "no allocation in the loop" means.
  const half = Math.floor(heap.length / 2);
  const floorA = Math.min(...heap.slice(0, half));
  const floorB = Math.min(...heap.slice(half));
  console.log(
    `heap floor ${mb(floorA)} -> ${mb(floorB)} MB (peak ${mb(Math.max(...heap))}, ${heap.length} samples)`,
  );
}
if (hooks) console.log('state:', JSON.stringify(hooks));
if (problems.length) {
  console.log(`\n${problems.length} console problem(s):`);
  for (const p of problems.slice(0, 20)) console.log('  ' + p);
  process.exit(1);
}
console.log('console clean');
