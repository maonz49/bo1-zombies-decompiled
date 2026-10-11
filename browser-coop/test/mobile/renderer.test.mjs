import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { chooseRenderer, routeFor, webGPUFeatures, isAppleMobile } from '../../site/bo1z/renderer-policy.begin-scene-20261011-1.mjs';

const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/27.0.1 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 };
const desktop = () => ({ userAgent: 'Mozilla/5.0 Chrome/150 Safari/537.36', gpu: { requestAdapter: async () => ({ features: new Set(webGPUFeatures) }) } });
const root = new URL('../../site/bo1z/', import.meta.url);

// Exercise the complete edited engine shell with a stub for only the native
// WASM/audio/input interfaces. This does not emulate Safari or native rendering.
async function shell({ nav = desktop(), query = '', stored = null, storageDenied = false, redirectDenied = false } = {}) {
  const records = { args: null, redirects: [], failures: [], writes: [], videoOpens: [] };
  const url = new URL('https://bo1.znoam.eu/bo1z/kino' + query);
  const location = { href: url.href, search: url.search, pathname: url.pathname,
    replace(value) { if (redirectDenied) throw Error('blocked navigation'); records.redirects.push(value); } };
  const fakeModule = { HEAPF32: new Float32Array(new SharedArrayBuffer(65536 * 4)), _malloc: () => 8, _KB_Input: () => 1,
    kbVideo: { open(...args) { records.videoOpens.push(args); }, close() {}, rewind() {}, pause() {}, volume() {} },
    _KB_AudioRead: () => 0, callMain(args) {
      records.args = args;
      this.kbVideo.open(0, 'zombie_theater_load', 256);
      records.videoStatusAtMain = new Int32Array(this.HEAPF32.buffer, 256, 10)[4];
    }, PThread: { terminateAllThreads() {} } };
  const context = vm.createContext({ navigator: nav, location, URL, URLSearchParams, SharedArrayBuffer,
    TextEncoder, performance, console: { log() {}, error() {}, warn() {} },
    document: { pointerLockElement: null }, setInterval: () => 1, clearInterval() {},
    setTimeout: () => 1, clearTimeout() {},
    AudioContext: class { constructor() { this.sampleRate = 48000; this.state = 'suspended'; this.audioWorklet = { addModule: async () => {} }; } async suspend() {} async close() {} },
    AudioWorkletNode: class { constructor() { this.port = {}; } connect() {} },
  });
  Object.defineProperty(context, 'sessionStorage', { get() {
    if (storageDenied) throw Error('SecurityError');
    return { getItem: () => stored, setItem(key, value) { records.writes.push([key, value]); stored = value; } };
  } });
  const synth = exports => new vm.SyntheticModule(Object.keys(exports), function() {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
  const policy = new vm.SourceTextModule(await fs.readFile(new URL('renderer-policy.begin-scene-20261011-1.mjs', root), 'utf8'), { context });
  const introPolicy = new vm.SourceTextModule(await fs.readFile(new URL('mobile-intro.no-intro-20261011-1.mjs', root), 'utf8'), { context });
  const touch = new vm.SourceTextModule(await fs.readFile(new URL('fixtures/touch-keys.js', import.meta.url), 'utf8'), { context });
  const mobileProfile = new vm.SourceTextModule(await fs.readFile(new URL('mobile-profile.mobile-start-20261011-1.js', root), 'utf8'), { context });
  const engine = new vm.SourceTextModule(await fs.readFile(new URL('engine.coop-20261011-1.js', root), 'utf8'), {
    context,
    async importModuleDynamically(specifier) {
      assert.ok(['/bo1z/artifacts/KisakBlack-web.mjs', '/bo1z/artifacts/KisakBlack-web.mobile-start-20261011-1.mjs'].includes(specifier));
      records.runtimePath = specifier;
      const module = synth({ default: async options => { records.native = options; return fakeModule; } });
      await module.link(() => { throw Error('unexpected native import'); }); await module.evaluate(); return module;
    },
  });
  await engine.link(specifier => {
    if (specifier.includes('coop.validated')) return synth({ prepareEngine: async () => ({}), prepareMain: async () => {}, finishEngine: runtime => runtime });
    if (specifier.includes('renderer-policy.')) return policy;
    if (specifier.includes('mobile-intro.')) return introPolicy;
    if (specifier.includes('touch-keys')) return touch;
    if (specifier.includes('mobile-profile')) return mobileProfile;
    if (specifier === './maps.js') return synth({ map: { name: 'Kino', programs: '/unused' }, mapId: 'zombie_theater', opfsRoot: '/opfs/pack-kino/files', BASE: '/bo1z/', horde: false });
    if (specifier.includes('input.perf')) return synth({ captureInput: () => ({ enable() {}, dispose() {} }) });
    if (specifier === './horde.js') return synth({ hordeArguments: () => [], HORDE_GAME: {} });
    throw Error('unexpected import ' + specifier);
  });
  await engine.evaluate();
  const state = { timings: {}, console: [], errors: [], consoleErrors: 0, scriptExceptions: 0, glErrors: 0,
    onCrash(message) { records.failures.push(message); } };
  const instance = engine.namespace.createEngine({ width: 1152, height: 648 }, state);
  await instance.load();
  return { records, state, instance, namespace: engine.namespace };
}

const fatal = 'Com_ERROR: C:\\projects_pc\\cod\\codsrc\\src\\gfx_d3d\\rb_backend.cpp (5068) dx.device->BeginScene() failed: Direct3D unavailable in dedicated Node mode';
const dvar = (args, key) => args[args.indexOf(key) + 1];

test('real shell installs the mobile intro bypass before native callMain', async () => {
  const { records, state } = await shell({ nav: iphone });
  assert.equal(state.loadingIntroBridgePatched, true);
  assert.equal(records.videoOpens.length, 0);
  assert.equal(records.videoStatusAtMain, 2);
  assert.equal(dvar(records.args, 'r_picmip_manual'), '1');
  for (const name of ['r_picmip', 'r_picmip_bump', 'r_picmip_spec', 'r_smp_worker_threads']) {
    assert.equal(dvar(records.args, name), '2');
    assert.ok(records.args.indexOf(name) < records.args.indexOf('+devmap'));
  }
  assert.equal(dvar(records.args, 'com_maxfps'), '30');
  assert.equal(records.native.kisakPthreadPoolSize, 8);
  assert.equal(records.runtimePath, '/bo1z/artifacts/KisakBlack-web.mobile-start-20261011-1.mjs');
});
test('real shell leaves the desktop video bridge active', async () => {
  const { records, state } = await shell();
  assert.equal(state.loadingIntroBridgePatched, undefined);
  assert.equal(records.videoOpens.length, 1);
  assert.equal(records.native.kisakPthreadPoolSize, undefined);
  assert.equal(records.runtimePath, '/bo1z/artifacts/KisakBlack-web.mjs');
  assert.equal(records.args.includes('r_picmip'), false);
});

test('iPhone chooses WebGL2 without probing WebGPU', async () => {
  const nav = { ...iphone, gpu: { requestAdapter() { throw Error('should not be called'); } } };
  assert.equal((await chooseRenderer(null, routeFor(nav), nav)).reason, 'apple-mobile-compatibility');
});
test('iPad desktop UA is covered without classifying a normal Mac', () => {
  assert.equal(isAppleMobile({ platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ platform: 'MacIntel', maxTouchPoints: 0 }), false);
});
test('Chromium keeps its existing WebGPU route', async () => {
  assert.deepEqual(await chooseRenderer(null, routeFor(desktop()), desktop()), { renderer: 'webgpu', reason: 'default', pipeline: 1 });
});
test('Firefox keeps its existing main-pthread/WebGL2 route', async () => {
  const nav = { ...desktop(), userAgent: 'Firefox/157.0' };
  assert.equal(routeFor(nav), 'main-pthread');
  assert.equal((await chooseRenderer(null, routeFor(nav), nav)).renderer, 'webgl2');
});
test('explicit WebGPU remains available for controlled retries', async () => {
  assert.equal((await chooseRenderer('webgpu', 'backend-pthread', iphone)).renderer, 'webgpu');
});
test('missing GPU feature still selects WebGL2', async () => {
  const nav = { gpu: { requestAdapter: async () => ({ features: new Set() }) } };
  assert.equal((await chooseRenderer(null, 'backend-pthread', nav)).renderer, 'webgl2');
});
test('real shell sets WebGL2 dvars before devmap on iPhone', async () => {
  const { records, state } = await shell({ nav: iphone });
  assert.equal(state.rendererRequested, 'webgl2');
  assert.equal(dvar(records.args, 'r_webgpu'), '0');
  assert.equal(dvar(records.args, 'r_webgpu_pipeline'), '0');
  assert.ok(records.args.indexOf('r_webgpu') < records.args.indexOf('+devmap'));
});
test('URL WebGL2 overrides an old WebGPU session choice', async () => {
  const { state } = await shell({ query: '?renderer=webgl2', stored: 'webgpu' });
  assert.equal(state.rendererRequested, 'webgl2');
});
test('blocked session storage does not prevent startup', async () => {
  const { state } = await shell({ nav: iphone, storageDenied: true });
  assert.equal(state.rendererRequested, 'webgl2');
});
test('BeginScene after DEVICE_READY causes exactly one WebGL2 navigation', async () => {
  const { records, state } = await shell({ query: '?telemetry=0&packOrigin=0&touch=1&quality=auto' });
  records.native.print('WEB_GPU_DEVICE_READY owner=pipeline step=2 inflight=1 shared=1 bc=1');
  records.native.print(fatal); records.native.onAbort('Aborted()'); records.native.print(fatal);
  assert.equal(records.redirects.length, 1); assert.equal(records.failures.length, 0);
  const target = new URL(records.redirects[0]);
  assert.equal(target.searchParams.get('renderer'), 'webgl2');
  for (const [k, v] of [['telemetry','0'],['packOrigin','0'],['touch','1'],['quality','auto']]) assert.equal(target.searchParams.get(k), v);
  assert.equal(state.rendererFallbackPending, true);
});
test('automatic retry overrides an explicit failed WebGPU request', async () => {
  const { records } = await shell({ query: '?renderer=webgpu', storageDenied: true });
  records.native.print(fatal);
  assert.equal(new URL(records.redirects[0]).searchParams.get('renderer'), 'webgl2');
});
test('WebGL2 failure remains visible and never loops', async () => {
  const { records } = await shell({ query: '?renderer=webgl2&renderFallback=1' });
  records.native.print(fatal);
  assert.equal(records.redirects.length, 0); assert.equal(records.failures.length, 1);
});
test('a failure after first frame does not discard an active game', async () => {
  const { records } = await shell();
  records.native.print('KISAK_BROWSER first-present'); records.native.print(fatal);
  assert.equal(records.redirects.length, 0); assert.equal(records.failures.length, 1);
});
test('unrelated native error does not trigger renderer changes', async () => {
  const { records } = await shell();
  records.native.print('Com_ERROR: missing map file');
  assert.equal(records.redirects.length, 0); assert.equal(records.failures.length, 1);
});
test('original initialization fallback also works without storage', async () => {
  const { records } = await shell({ storageDenied: true });
  records.native.print('WEB_GPU_FALLBACK missing-required-features');
  assert.equal(records.redirects.length, 1);
});
test('failed navigation still exposes the original error', async () => {
  const { records, state } = await shell({ redirectDenied: true });
  records.native.print(fatal);
  assert.equal(records.failures[0], fatal); assert.equal(state.rendererFallbackPending, false);
});
