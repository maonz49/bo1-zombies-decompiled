import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { engineOptions, finishEngine } from '../extension/src/native-engine.js';
import { normalizeRelay, sessionUrl } from '../extension/src/navigation.js';

const state = (props = {}) => ({ controller: true, mode: null, note() {}, ...props });
const smallWasm = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]);
const response = bytes => async () => new Response(bytes);

test('solo with controller disabled uses the untouched loader without fetching twice', async () => {
  const options = await engineOptions(state({ controller: false }), 'unused', () => { throw Error('unexpected fetch'); });
  assert.deepEqual(options, {});
});

test('unknown engines stay unpatched in solo and fail clearly in multiplayer', async () => {
  const solo = state();
  assert.deepEqual(await engineOptions(solo, 'engine.wasm', response(smallWasm)), {});
  assert.equal(solo.patched, false);
  assert.match(solo.error, /inconnue/);
  await assert.rejects(engineOptions(state({ mode: 'host' }), 'engine.wasm', response(smallWasm)), /inconnue/);
});

test('HTTP engine failures reject the normal startup promise', async () => {
  await assert.rejects(engineOptions(state(), 'engine.wasm', async () => new Response('', { status: 503 })), /HTTP 503/);
});

test('known production engine compiles via native Emscripten hook without patching globals', { skip: !process.env.BO1Z_ENGINE_WASM }, async () => {
  const original = WebAssembly.instantiate;
  const coop = state();
  const bytes = fs.readFileSync(process.env.BO1Z_ENGINE_WASM);
  const options = await engineOptions(coop, 'engine.wasm', response(bytes));
  assert.equal(coop.patched, true);
  assert.equal(typeof options.instantiateWasm, 'function');
  assert.equal(WebAssembly.instantiate, original);
  assert.equal(Object.prototype.hasOwnProperty('callMain'), false);
  const initialization = finishEngine(new Promise(() => {}), options);
  options.instantiateWasm({}, () => { throw new Error('should reject before initialization'); });
  await assert.rejects(initialization, /Import|module|memory/);
});

test('joining and leaving preserve local iPhone launch preferences', () => {
  const before = 'https://bo1.znoam.eu/bo1z/kino-mobile-20261011.html?renderer=webgl2&quality=eco&touch=1&telemetry=0&packOrigin=0';
  const joined = new URL(sessionUrl(before, { role: 'join', room: '0123-4567-89ab-cdef', pathname: '/bo1z/five' }));
  assert.equal(joined.pathname, '/bo1z/five');
  for (const [key, value] of new URL(before).searchParams) assert.equal(joined.searchParams.get(key), value);
  const solo = new URL(sessionUrl(joined.href));
  assert.equal(solo.searchParams.has('coop'), false);
  assert.equal(solo.searchParams.has('room'), false);
  assert.equal(solo.searchParams.get('quality'), 'eco');
});

test('relays require HTTPS; HTTP is only available for explicit local development', () => {
  assert.equal(normalizeRelay('wss://relay.example/some-path'), 'https://relay.example');
  assert.equal(normalizeRelay('https://user:password@relay.example'), '');
  assert.equal(normalizeRelay('http://relay.example', true), '');
  assert.equal(normalizeRelay('http://localhost:8787'), '');
  assert.equal(normalizeRelay('http://localhost:8787', true), 'http://localhost:8787');
  assert.equal(normalizeRelay('javascript:alert(1)'), '');
});
