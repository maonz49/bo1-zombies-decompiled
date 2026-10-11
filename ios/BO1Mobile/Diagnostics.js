(() => {
  'use strict';
  if (location.origin !== 'https://bo1.znoam.eu' || window !== window.top) return;
  if (window.__bo1NativeDiagnostics) return;
  window.__bo1NativeDiagnostics = true;
  const pending = [];
  let dropped = 0;
  const send = value => {
    try { window.webkit.messageHandlers.bo1.postMessage(value); } catch (_) {}
  };
  const format = value => {
    try { return (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 500); }
    catch (_) { return String(value).slice(0, 500); }
  };
  const record = (level, args) => {
    if (pending.length >= 40) { pending.shift(); dropped++; }
    pending.push(`${level}: ${Array.from(args).slice(0, 5).map(format).join(' ').slice(0, 600)}`);
  };
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => { original(...args); record(level, args); };
  }
  const flush = () => {
    if (!pending.length && !dropped) return;
    send({type: 'logs', lines: pending.splice(0), dropped});
    dropped = 0;
  };
  const memoryFields = ['wasmBytes', 'wasmBreak', 'wasmUnclaimedBytes', 'engineZBytes',
    'engineHunkUsed', 'enginePMemUsed', 'textureStagingBytes', 'bufferStagingBytes',
    'virtualReservedBytes', 'audioCachedPCMBytes', 'audioCachedClips', 'audioPCMEvictions'];
  const sampleMemory = () => {
    try {
      const state = window.five;
      const memory = state?.engine?.telemetryMemory?.();
      if (!memory) return;
      const sample = {type: 'memory', stage: String(state.load?.stage || 'unknown').slice(0, 40)};
      for (const key of memoryFields) if (typeof memory[key] === 'number' && Number.isFinite(memory[key])) sample[key] = memory[key];
      send(sample); // Counter reads only: no mallinfo(), heap walk, or heap serialization.
    } catch (_) {}
  };
  setInterval(() => { sampleMemory(); flush(); }, 1000);
  addEventListener('pagehide', flush);
  addEventListener('error', e => { record('error', [e.message || 'Resource error']); flush(); });
  addEventListener('unhandledrejection', e => { record('rejection', [e.reason]); flush(); });
  const capabilities = {
    isolated: globalThis.crossOriginIsolated === true,
    sharedMemory: typeof SharedArrayBuffer === 'function',
    jspi: typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function',
    offscreenCanvas: typeof OffscreenCanvas === 'function',
    opfs: typeof navigator.storage?.getDirectory === 'function',
    userAgent: navigator.userAgent,
    url: location.href
  };
  send({type: 'capabilities', ...capabilities});
})();
