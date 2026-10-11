import { wantsTouch } from './touch-keys.js?v=mobile-20261010-5';

export function shouldSkipLoadingIntro(nav = globalThis.navigator, query = globalThis.location?.search ?? '') {
  return Boolean(globalThis.__kisakNoIntro) || wantsTouch(nav, query);
}

const patched = new WeakSet();
const videoName = name => String(name ?? '').replace(/\\/g, '/').split('/').pop().replace(/\.(bik|bk2|mp4|webm)$/i, '').toLowerCase();

// The deployed video bridge uses ten shared Int32 words per cinematic:
// [sequence, frame, timeMs, bufferedMs, status, width, height, Y, Cb, Cr].
// Status 2 is the same completion signal as its <video> "ended" handler;
// status 4 acknowledges close so the native thread can free the buffers.
// Intercept before open creates a video: hiding the page's video alone would
// still let the native loading cinematic fetch and decode its own copy.
export function installLoadingIntroSkip(module) {
  const bridge = module.kbVideo;
  if (!bridge || patched.has(bridge)) return false;
  const skipped = new Map();
  const original = Object.fromEntries(['open', 'close', 'rewind', 'pause', 'volume'].map(key => [key, bridge[key]]));
  if (Object.values(original).some(fn => typeof fn !== 'function')) return false;
  const words = entry => new Int32Array(module.HEAPF32.buffer, entry.shared, 10);
  const finish = entry => {
    const w = words(entry);
    Atomics.store(w, 1, entry.frames);
    Atomics.store(w, 2, entry.timeMs);
    Atomics.store(w, 3, -1);
    Atomics.store(w, 4, 2);
  };
  bridge.open = function(slot, name, shared) {
    const normalized = videoName(name);
    if (!/_load$/.test(normalized)) return original.open.call(this, slot, name, shared);
    this.close(slot, true);
    const meta = module.kbVideoInfo?.[normalized];
    const frames = Math.max(1, Math.trunc(meta?.frames || 1));
    const timeMs = meta?.fps > 0 ? Math.min(2147483647, Math.round(frames / meta.fps * 1000)) : 0;
    const entry = { shared, frames, timeMs };
    skipped.set(slot, entry);
    finish(entry);
  };
  bridge.close = function(slot, reopening) {
    const entry = skipped.get(slot);
    if (!entry) return original.close.call(this, slot, reopening);
    Atomics.store(words(entry), 4, 4);
    skipped.delete(slot);
  };
  bridge.rewind = function(slot) {
    const entry = skipped.get(slot);
    if (entry) return finish(entry);
    return original.rewind.call(this, slot);
  };
  for (const method of ['pause', 'volume']) {
    bridge[method] = function(slot, value) {
      if (!skipped.has(slot)) return original[method].call(this, slot, value);
    };
  }
  patched.add(bridge);
  return true;
}
