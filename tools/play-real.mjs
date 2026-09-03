/**
 * Plays the BUILT game the way the simulator's "iniciante" policy does: buy
 * DANO, buy VIDA when hurt, never call a wave early. Reports the wave each run
 * died on.
 *
 * Why it exists: `npm run balance` models the fight, and a model can be wrong in
 * ways no unit test catches. This closes the loop against the real build — it
 * is what caught the model reading ~50% too many waves, and what proved the
 * card-cadence change had not quietly broken the opening.
 *
 * Usage: npm run build && node tools/play-real.mjs [runs] [secondsPerRun]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const path = join('dist', normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const exec = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(exec) ? { executablePath: exec, args: ['--use-gl=swiftshader'] } : {});
const runs = Number(process.argv[2] ?? 3);
const seconds = Number(process.argv[3] ?? 240);
const results = [];
for (let r = 0; r < runs; r++) {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.evaluate(() => globalThis.ironSpire.play());
  await page.evaluate(() => {
    globalThis.__peak = 0;
    globalThis.__err = '';
    setInterval(() => {
     try {
      const s = globalThis.ironSpire.state;
      globalThis.__peak = Math.max(globalThis.__peak, s.wave);
      for (const b of document.querySelectorAll('.modal:not([hidden]) .card')) { b.click(); return; }
      const btns = [...document.querySelectorAll('.up-btn')];
      // 0 = DANO, 3 = VIDA in the shipped order.
      const hpBar = document.querySelector('.hp-fill');
      const hurt = hpBar !== null && parseFloat(getComputedStyle(hpBar).getPropertyValue('--p')) < 60;
      globalThis.__ticks = (globalThis.__ticks ?? 0) + 1;
      const pick = hurt ? btns[3] : btns[0];
      if (pick && !pick.classList.contains('dim')) {
        pick.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
        pick.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      }
     } catch (e) { globalThis.__err = String(e); }
    }, 400);
  });
  const started = Date.now();
  let state;
  for (;;) {
    state = await page.evaluate(() => ({ ...globalThis.ironSpire.state, peak: globalThis.__peak, ticks: globalThis.__ticks, err: globalThis.__err }));
    if (state.scene === 6 || (Date.now() - started) / 1000 > seconds) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  results.push(state.peak ?? state.wave);
  console.log(`run ${r + 1}: wave ${state.peak}, gold ${state.gold}, level ${state.level}, kills ${state.kills}, ticks ${state.ticks}, err "${state.err}"`);
  await page.close();
}
results.sort((a, b) => a - b);
console.log('mediana', results[Math.floor(results.length / 2)], 'de', results.join(','));
await browser.close();
server.close();
