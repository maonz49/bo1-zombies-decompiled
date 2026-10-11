// Focused integration checks: panel, two browser relay workers, native runtime initialization.
// Does not load map assets or claim a gameplay/safari-device validation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { unstable_startWorker } from 'wrangler';

const site = path.resolve('site');
const errors = [];
const settingsMarkup = (await fs.readFile(path.join(site, 'bo1z/kino.page.html'), 'utf8')).match(/<details id="settings">[\s\S]*?<\/details>/)[0];
const html = `<!doctype html><html lang="fr" data-map="zombie_theater"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/settings-test.css"><style>body{margin:0;background:#171717;color:white;font:16px system-ui}#game{width:100vw;height:100vh}#start{position:absolute;top:50%;left:40%}</style><canvas id="game" width="800" height="600"></canvas><button id="start">Jouer</button>${settingsMarkup}<script>window.five={screen:'landing',views:[]};window.originalInstantiate=WebAssembly.instantiate;</script><script type="module" src="/bo1z/coop.validated-20261011-1.js"></script></html>`;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  try {
    if (pathname === '/bo1z/kino' || pathname === '/bo1z/kino-mobile-20261011.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
    }
    if (pathname === '/settings-test.css') {
      res.setHeader('Content-Type', 'text/css'); res.end(await fs.readFile('test/fixtures/play.css')); return;
    }
    const file = pathname === '/engine.wasm' && process.env.BO1Z_ENGINE_WASM ? process.env.BO1Z_ENGINE_WASM : path.join(site, pathname);
    if (pathname !== '/engine.wasm' && !file.startsWith(site + path.sep)) throw Error('bad path');
    res.setHeader('Content-Type', pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(8788, '127.0.0.1', resolve));
let browser, relay;
const open = async (url, viewport = { width: 1280, height: 720 }) => {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport(viewport);
  await page.goto(url);
  await page.waitForFunction(() => window.__bo1zCoop?.panel?.view);
  return page;
};
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = 'http://127.0.0.1:8788/bo1z/kino';
  const page = await open(base + '?renderer=webgl2&quality=eco&touch=1');
  assert.equal(await page.evaluate(() => document.querySelector('bo1z-coop').shadowRoot.querySelector('[data-act="host"]').disabled), true);
  assert.equal(await page.evaluate(() => window.__bo1zCoop.pump === undefined), true);
  assert.equal(await page.evaluate(() => WebAssembly.instantiate === window.originalInstantiate), true);
  await page.locator('bo1z-coop >>> input[data-field="join"]').fill('abc');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__bo1zCoop.notice?.includes('invalide'));
  assert.equal(await page.evaluate(() => document.querySelector('bo1z-coop').shadowRoot.activeElement?.value), 'abc');
  console.log('PASS desktop panel, absent relay, invalid invitation and retained focus');

  await page.click('#settings summary');
  assert.equal(await page.$eval('#controller-sensitivity', e => e.value), '5');
  await page.focus('#controller-sensitivity');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => ({
    slider: document.getElementById('controller-sensitivity').value,
    label: document.getElementById('controller-sensitivity-value').value,
    spoken: document.getElementById('controller-sensitivity').getAttribute('aria-valuetext'),
    current: window.__bo1zCoop.gamepad.aimLevel,
    saved: localStorage.getItem('bo1z-coop-aim'),
    mouse: document.getElementById('sensitivity').value,
  })), { slider: '6', label: '6/10', spoken: '6 sur 10', current: 5, saved: '5', mouse: '5' });
  await page.reload();
  await page.waitForSelector('#controller-sensitivity');
  assert.equal(await page.$eval('#controller-sensitivity', e => e.value), '6');
  // A connected controller exposes the existing +/- buttons. They must share the setting.
  await page.bringToFront();
  await page.evaluate(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{
    id: 'Test controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  }] }));
  await page.evaluate(() => window.__bo1zCoop.gamepad.update(performance.now()));
  await page.waitForFunction(() => !!document.querySelector('bo1z-coop').shadowRoot.querySelector('[data-act="aimUp"]'), { timeout: 5000 });
  await page.locator('bo1z-coop >>> button[data-act="aimUp"]').setTimeout(5000).click();
  assert.equal(await page.$eval('#controller-sensitivity', e => e.value), '7');
  assert.equal(await page.evaluate(() => window.__bo1zCoop.gamepad.aimLevel), 6);
  await page.click('#settings summary');
  if (process.env.QA_SETTINGS_SCREENSHOT) await page.screenshot({ path: process.env.QA_SETTINGS_SCREENSHOT });
  console.log('PASS Options sensitivity: keyboard, immediate controller update, saved preference, +/- synchronization, mouse unchanged');

  const mobile = await open(base, { width: 375, height: 812, isMobile: true, hasTouch: true });
  assert.equal(await mobile.evaluate(() => document.querySelector('bo1z-coop').classList.contains('collapsed')), true);
  const soloMobile = await mobile.evaluate(async () => {
    const { prepareEngine } = await import('/bo1z/coop.validated-20261011-1.js');
    // This nonexistent URL must never be fetched for touch-only solo.
    const options = await prepareEngine('/must-not-fetch-for-touch-solo.wasm');
    return { controller: window.__bo1zCoop.controller, patched: window.__bo1zCoop.patched,
      gamepad: !!window.__bo1zCoop.gamepad, options: Object.keys(options) };
  });
  assert.deepEqual(soloMobile, { controller: false, patched: false, gamepad: false, options: [] });
  await mobile.locator('bo1z-coop >>> button[data-act="collapse"]').click();
  for (const viewport of [{ width: 375, height: 812, isMobile: true, hasTouch: true }, { width: 812, height: 375, isMobile: true, hasTouch: true }]) {
    await mobile.setViewport(viewport);
    const dimensions = await mobile.evaluate(() => {
      const card = document.querySelector('bo1z-coop').shadowRoot.querySelector('.card').getBoundingClientRect();
      return { x: card.x, right: card.right, y: card.y, bottom: card.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(dimensions.x >= 0 && dimensions.right <= dimensions.width && dimensions.bottom <= dimensions.height, JSON.stringify(dimensions));
  }
  if (process.env.QA_SCREENSHOT) await mobile.screenshot({ path: process.env.QA_SCREENSHOT });
  console.log('PASS phone panel at 375px and landscape; touch-only solo skips added WASM preparation');
  await mobile.locator('bo1z-coop >>> button[data-act="controller"]').click();
  await mobile.reload();
  await mobile.waitForFunction(() => window.__bo1zCoop?.controller && !!window.__bo1zCoop.gamepad);
  await mobile.evaluate(() => localStorage.removeItem('bo1z-coop-controller'));
  console.log('PASS phone controller is available by explicit opt-in and persists across reload');

  await mobile.click('#settings summary');
  const slider = await mobile.$('#controller-sensitivity');
  const box = await slider.boundingBox();
  await mobile.touchscreen.tap(box.x + box.width * .9, box.y + box.height / 2);
  assert.ok(Number(await mobile.$eval('#controller-sensitivity', e => e.value)) >= 8);
  assert.equal(await mobile.$eval('#controller-sensitivity', e => e.value), String(await mobile.evaluate(() => window.__bo1zCoop.gamepad.aimLevel + 1)));
  for (const viewport of [{ width: 375, height: 812, isMobile: true, hasTouch: true }, { width: 812, height: 375, isMobile: true, hasTouch: true }]) {
    await mobile.setViewport(viewport);
    const size = await mobile.$eval('#controller-sensitivity', e => {
      const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height, w: innerWidth, h: innerHeight };
    });
    assert.ok(size.height >= 44 && size.x >= 0 && size.right <= size.w && size.y >= 0 && size.bottom <= size.h, JSON.stringify(size));
  }
  await mobile.reload();
  await mobile.waitForSelector('#controller-sensitivity');
  assert.ok(Number(await mobile.$eval('#controller-sensitivity', e => e.value)) >= 8);
  console.log('PASS Options sensitivity: touch adjustment, phone/landscape layout, preference survives reload');

  if (process.env.BO1Z_ENGINE_WASM) {
    const native = await page.evaluate(async () => {
      const coop = await import('/bo1z/coop.validated-20261011-1.js');
      const { default: create } = await import('/bo1z/artifacts/KisakBlack-web.mobile-start-20261011-1.mjs');
      const options = await coop.prepareEngine('/engine.wasm');
      const module = await coop.finishEngine(create({ ...options, canvas: document.getElementById('game'), noInitialRun: true,
        kisakPthreadPoolSize: 1, locateFile: name => '/bo1z/artifacts/' + name }), options);
      await coop.prepareMain(module, ['+devmap', 'zombie_theater']);
      const result = { patched: window.__bo1zCoop.patched, heap: module.HEAPF32.buffer.byteLength,
        memoryAttached: !!window.__bo1zCoop.mem, input: typeof module._KB_Input };
      module.PThread?.terminateAllThreads();
      return result;
    });
    assert.equal(native.patched, true); assert.equal(native.memoryAttached, true);
    assert.equal(native.input, 'function');
    assert.equal(page.workers().filter(w => w.url().includes('KisakBlack-web.mobile-start')).length, 1);
    console.log('PASS real WASM + native Emscripten runtime + pthread initialization', native);
  }

  relay = await unstable_startWorker({ config: 'relay/wrangler.jsonc', dev: { server: { port: 0 }, inspector: false } });
  await relay.ready;
  const relayUrl = (await relay.url).toString().replace(/\/$/, '');
  const query = `&room=0123-4567-89ab-cdef&coopRelay=${encodeURIComponent(relayUrl)}`;
  const host = await open(base + '?coop=host' + query);
  const guest = await open(base + '?coop=join' + query);
  await host.waitForFunction(() => window.__bo1zCoop.peer && window.__bo1zCoop.socket === 'open');
  await guest.waitForFunction(() => window.__bo1zCoop.peerInfo?.zone === 'zombie_theater');
  assert.equal(await guest.evaluate(() => window.__bo1zCoop.error), null);
  await guest.close();
  await host.waitForFunction(() => window.__bo1zCoop.peer === false);
  console.log('PASS two browser workers: room join, host information, peer disconnect');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await relay?.dispose();
  server.close();
}
