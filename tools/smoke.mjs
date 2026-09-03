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
const throttleArg = process.argv.find((a) => a.startsWith('--throttle='));
const throttle = throttleArg ? Number(throttleArg.split('=')[1]) : 1;
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
const browser = await chromium.launch(
  existsSync(execPath) ? { executablePath: execPath } : {},
);
const page = await browser.newPage({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
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

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(() => {
  globalThis.__frames = 0;
  const tick = () => {
    globalThis.__frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.waitForTimeout(seconds * 1000);
const frames = await page.evaluate(() => globalThis.__frames);
const hooks = await page.evaluate(() => globalThis.ironSpire ?? null);

await page.screenshot({ path: outPng });
await browser.close();
server.close();

console.log(`fps ~ ${(frames / seconds).toFixed(1)} (throttle ${throttle}x, ${seconds}s)`);
if (hooks) console.log('state:', JSON.stringify(hooks));
if (problems.length) {
  console.log(`\n${problems.length} console problem(s):`);
  for (const p of problems.slice(0, 20)) console.log('  ' + p);
  process.exit(1);
}
console.log('console clean');
