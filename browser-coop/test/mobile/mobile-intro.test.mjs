import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../site/bo1z/', import.meta.url);
const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');
const iphone = { userAgent: 'Mozilla/5.0 (iPhone) Version/27.0.1 Mobile Safari', platform: 'iPhone', maxTouchPoints: 5 };
const desktop = { userAgent: 'Mozilla/5.0 Chrome/150 Safari/537.36', platform: 'Win32', maxTouchPoints: 0 };
const streams = [
  { kind: 'video', name: 'zombie_theater_load', path: 'web/video/zombie_theater_load.mp4', mime: 'video/mp4', frames: 1800, fps_num: 30, fps_den: 1, width: 1280, height: 720 },
  { kind: 'video', name: 'ending', path: 'web/video/ending.mp4', mime: 'video/mp4', frames: 300, fps_num: 30, fps_den: 1, width: 1280, height: 720 },
];

async function harness(nav = iphone, query = '', noIntro = false) {
  const videos = [], nodes = new Map(), workers = [], actions = [], intervals = new Map();
  let timer = 0;
  const makeElement = tag => {
    const classes = new Set();
    const element = {
      tagName: tag, style: {}, dataset: {}, children: [], value: '0.5', hidden: false,
      parentElement: {}, firstChild: { textContent: '' }, isConnected: false,
      classList: { add(...values) { values.forEach(v => classes.add(v)); }, remove(...values) { values.forEach(v => classes.delete(v)); }, contains: v => classes.has(v) },
      addEventListener() {}, before(child) { child.isConnected = true; },
      append(...children) { this.children.push(...children); },
      removeAttribute(name) { delete this[name]; }, remove() { this.isConnected = false; },
      querySelectorAll() { return this.children.filter(e => e.tagName === 'source'); },
      requestVideoFrameCallback() {}, canPlayType() { return ''; },
      currentTime: 0, duration: 60, buffered: { length: 0 },
      play() { this.plays = (this.plays ?? 0) + 1; return Promise.resolve(); },
      pause() { this.pauses = (this.pauses ?? 0) + 1; }, load() {},
    };
    if (tag === 'video') videos.push(element);
    return element;
  };
  const document = {
    createElement: makeElement,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeElement(id)); return nodes.get(id); },
    querySelector: () => null, addEventListener() {},
    documentElement: { dataset: { map: 'zombie_theater' } },
    body: Object.assign(makeElement('body'), { appendChild(element) { element.isConnected = true; } }),
  };
  const buffer = new SharedArrayBuffer(65536);
  const Module = { HEAPF32: new Float32Array(buffer), kbVideoBase: 'https://bo1.znoam.eu/bo1z/kino/', kbVideoMaster: 1,
    _malloc: () => 4096, _free() {}, _KB_RegisterVideo() {} };
  const context = vm.createContext({ navigator: { ...nav, storage: { estimate: async () => ({ quota: 4e9, usage: 0 }), persist: async () => true } }, document, Module, wasmMemory: { buffer },
    __kisakNoIntro: noIntro, location: { href: 'https://bo1.znoam.eu/bo1z/kino' + query, search: query, pathname: '/bo1z/kino' },
    URL, URLSearchParams, TextEncoder, performance, Atomics,
    setTimeout: () => 1, clearTimeout() {}, setInterval: fn => { intervals.set(++timer, fn); return timer; }, clearInterval: id => intervals.delete(id),
    requestAnimationFrame() {}, addEventListener() {}, innerWidth: 1000, innerHeight: 600,
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {} },
    Worker: class { constructor() { this.messages = []; workers.push(this); } postMessage(data) { this.messages.push(data); } terminate() { actions.push('download:terminated'); } },
  });
  context.window = context;
  const touch = new vm.SourceTextModule(await read('fixtures/touch-keys.js'), { context });
  const profile = new vm.SourceTextModule(await fs.readFile(new URL('mobile-profile.mobile-start-20261011-1.js', root), 'utf8'), { context });
  await profile.link(() => touch); await profile.evaluate();
  const policy = new vm.SourceTextModule(await fs.readFile(new URL('mobile-intro.no-intro-20261011-1.mjs', root), 'utf8'), { context });
  await policy.link(() => touch); await policy.evaluate();
  vm.runInContext(await read('fixtures/deployed-video-bridge.js'), context);
  Module.kbVideo.register(streams);
  const synth = values => new vm.SyntheticModule(Object.keys(values), function() {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  return { context, Module, document, videos, nodes, workers, actions, policy: policy.namespace,
    tick() { for (const fn of intervals.values()) fn(); },
    words: address => new Int32Array(buffer, address, 10),
    async loadPage(cache = {}) {
      const page = new vm.SourceTextModule(await fs.readFile(new URL('play.coop-20261011-1.js', root), 'utf8'), { context });
      await page.link(specifier => {
        if (specifier.includes('mobile-intro.')) return policy;
        if (specifier.includes('touch-keys')) return touch;
        if (specifier.includes('mobile-profile')) return profile;
        if (specifier.includes('engine.coop')) return synth({ createEngine: () => {
          actions.push('engine:create');
          return { load: async () => { actions.push('engine:load'); }, lateIwds() { actions.push('engine:late-audio'); } };
        }, rendererRoute: 'backend-pthread', rendererChoice: async () => ({ renderer: 'webgl2' }), glslPack: 'web/shaders/shaders.pack' });
        if (specifier === './maps.js') return synth({ map: { name: 'Kino', settings: 'kino' }, packBase: '/bo1z/kino/', workerUrl: v => v, BASE: '/bo1z/', horde: false });
        if (specifier.includes('capabilities')) return synth({ checkCapabilities: async () => null });
        if (specifier.includes('canvas')) return synth({ sizeGameCanvas: () => ({ width: 800, height: 600 }) });
        if (specifier === './telemetry.js') return synth({ startTelemetry: () => ({ error() {}, crash() {} }) });
        if (specifier === './horde.js') return synth({ hordeCount: Number, hordeRound: Number, hordeDefaults: {}, HORDE_MIN: 24, HORDE_MAX: 1024, HORDE_GAME: {} });
        throw Error('unexpected import: ' + specifier);
      });
      await page.evaluate();
      assert.equal(workers.length, 1, 'cache inspector starts');
      workers[0].onmessage({ data: { type: 'cache-status', ready: true, missingBytes: 0, manifest: { files: [], streams, total_bytes: 0 }, ...cache } });
      return context.five;
    },
  };
}

test('mobile detection covers iPhone, Android, iPad desktop UA and forced touch mode', async () => {
  const h = await harness();
  for (const [nav, query] of [[iphone, ''], [{ userAgent: 'Android' }, ''], [{ platform: 'MacIntel', maxTouchPoints: 5 }, ''], [desktop, '?touch=1']])
    assert.equal(h.policy.shouldSkipLoadingIntro(nav, query), true);
  assert.equal(h.policy.shouldSkipLoadingIntro(desktop, ''), false);
  assert.equal(h.policy.shouldSkipLoadingIntro(iphone, '?touch=0'), false);
});

test('mobile page creates no intro video when cache metadata arrives', async () => {
  const h = await harness();
  const state = await h.loadPage();
  assert.equal(state.screen, 'landing');
  assert.equal(state.loadingIntroDisabled, true);
  assert.equal(h.videos.length, 0);
  assert.equal(h.context.__kisakIntro, undefined);
});

test('desktop page retains its intro', async () => {
  const h = await harness(desktop);
  const state = await h.loadPage();
  assert.equal(state.loadingIntroDisabled, false);
  assert.equal(h.videos.length, 1);
  assert.ok(h.videos[0].children[0].src.endsWith('zombie_theater_load.mp4'));
});

test('engine loading movie completes without creating a video or scheduling decoding', async () => {
  const h = await harness();
  assert.equal(h.policy.installLoadingIntroSkip(h.Module), true);
  h.Module.kbVideo.open(0, 'zombie_theater_load', 64);
  assert.equal(h.videos.length, 0);
  assert.deepEqual([...h.words(64).slice(0, 5)], [0, 1800, 60000, -1, 2]);
  h.Module.kbVideo.pause(0, false); h.Module.kbVideo.volume(0, 1); h.Module.kbVideo.rewind(0);
  assert.equal(h.words(64)[4], 2);
  h.Module.kbVideo.close(0);
  assert.equal(h.words(64)[4], 4, 'native close receives its acknowledgement');
  assert.equal(h.videos.length, 0);
});

test('other cinematics still use the deployed bridge and skipped slots can be reused', async () => {
  const h = await harness(); h.policy.installLoadingIntroSkip(h.Module);
  h.Module.kbVideo.open(0, 'zombie_theater_load', 64);
  h.Module.kbVideo.open(0, 'ending', 128);
  assert.equal(h.words(64)[4], 4);
  assert.equal(h.videos.length, 1);
  assert.ok(h.videos[0].children[0].src.endsWith('ending.mp4'));
  h.Module.kbVideo.pause(0, true); assert.ok(h.videos[0].pauses > 0);
  h.Module.kbVideo.open(0, 'ZOMBIE_THEATER_LOAD.bik', 256);
  assert.equal(h.videos.length, 1);
  assert.equal(h.videos[0].isConnected, false);
  assert.equal(h.words(128)[4], 4);
  assert.equal(h.words(256)[4], 2);
});

test('install is idempotent and the existing no-intro diagnostic flag is respected', async () => {
  const h = await harness(desktop, '', true);
  assert.equal(h.policy.shouldSkipLoadingIntro(), true);
  assert.equal(h.policy.installLoadingIntroSkip(h.Module), true);
  const open = h.Module.kbVideo.open;
  assert.equal(h.policy.installLoadingIntroSkip(h.Module), false);
  assert.equal(h.Module.kbVideo.open, open);
});

const manifest = { files: [
  { path: 'zone/map.ff', size: 80, priority: 'boot' },
  { path: 'main/music.iwd', size: 20, priority: 'background' },
  { path: 'web/shaders/shaders.pack', size: 10, priority: 'lazy' },
], streams, total_bytes: 110 };
const emit = (worker, data) => worker.onmessage({ data });

for (const cached of [false, true]) test(`mobile ${cached ? 'cached' : 'cold'} launch waits for all files and terminates downloader first`, async () => {
  const h = await harness();
  const state = await h.loadPage({ ready: cached, missingBytes: cached ? 0 : 110, manifest });
  await h.nodes.get('play').onclick();
  const worker = h.workers[0];
  const request = worker.messages.find(m => m.type === 'download');
  assert.equal(request.parallel, 1);
  assert.equal(request.decodeParallel, 1);
  assert.equal(request.holdBackground, false);
  emit(worker, { type: 'manifest', manifest });
  emit(worker, { type: 'progress', priority: 'boot', total: 90, completed: 90 });
  emit(worker, { type: 'boot-ready', manifest, metrics: {} });
  h.tick();
  assert.equal(h.actions.includes('engine:create'), false);
  assert.equal(state.loadbar.phase, 'Préparation des fichiers');
  assert.equal(state.loadbar.pct, 81, 'background sound files remain part of preparation');
  emit(worker, { type: 'progress', priority: 'background', total: 20, completed: 20 });
  emit(worker, { type: 'complete', manifest, metrics: {} });
  assert.ok(h.actions.indexOf('download:terminated') < h.actions.indexOf('engine:create'));
  assert.equal(state.downloadComplete, true);
  assert.equal(state.screen, 'loading');
  assert.equal(state.loadbar.phase, 'Chargement');
  state.onProgress({ stage: 'ready', fraction: 1 });
  assert.equal(state.screen, 'ready');
  assert.equal(state.loadbar.pct, 100);
});

test('an audio download failure after boot can be resumed without starting the engine early', async () => {
  const h = await harness(); const state = await h.loadPage({ manifest });
  await h.nodes.get('play').onclick();
  emit(h.workers[0], { type: 'boot-ready', manifest, metrics: {} });
  emit(h.workers[0], { type: 'error', name: 'Error', message: 'interrupted' });
  assert.equal(state.screen, 'error');
  assert.equal(h.nodes.get('play').textContent, 'Reprendre');
  assert.equal(h.actions.includes('engine:create'), false);
  await h.nodes.get('play').onclick();
  assert.equal(h.workers.length, 2);
  emit(h.workers[1], { type: 'boot-ready', manifest, metrics: {} });
  emit(h.workers[1], { type: 'complete', manifest, metrics: {} });
  assert.equal(h.actions.filter(a => a === 'engine:create').length, 1);
  assert.equal(state.screen, 'loading');
});

test('desktop retains early engine startup and background audio downloads', async () => {
  const h = await harness(desktop); const state = await h.loadPage({ manifest });
  await h.nodes.get('play').onclick();
  assert.equal(h.workers[0].messages.find(m => m.type === 'download').parallel, 3);
  emit(h.workers[0], { type: 'manifest', manifest });
  assert.equal(h.actions.filter(a => a === 'engine:create').length, 1);
  assert.equal(state.sequentialStartup, false);
  emit(h.workers[0], { type: 'boot-ready', manifest, metrics: {} });
  emit(h.workers[0], { type: 'complete', manifest, metrics: {} });
  assert.equal(h.actions.includes('engine:late-audio'), true);
});
