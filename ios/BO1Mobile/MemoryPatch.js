// Generated with the pinned recipe. Changes only the known engine, before instantiation.
(() => {
  'use strict';
  if (location.origin !== 'https://bo1.znoam.eu' || window !== window.top || window.__bo1MemoryPatch) return;
  const recipe = {"id":"bo1-memory-20261011-1","baseSha256":"61192df377020627f52fa7e9fd28047bd53662aa46e5e3cd6e7fad0c5c35cc98","patchedSha256":"36024c2655e29a3eb97b64c20e3b9270cd610943c70c18ed470bcd8789a6ff01","baseBytes":9618325,"patchedBytes":9618348,"edits":[{"at":32201,"before":[239,202,193,3],"after":[134,203,193,3],"purpose":"code section length"},{"at":480142,"before":[172,4],"after":[190,4],"purpose":"function body length"},{"at":480144,"before":[1,3,127],"after":[1,4,127,32,0,33,6],"purpose":"preserve allocation size"},{"at":480209,"before":[65,128,32,16,157,15],"after":[65,128,192,0,16,157,15],"purpose":"_PMem_AllocNamed(unsigned int, unsigned int, int, unsigned int, char const*, EMemTrack)"},{"at":480693,"before":[32,1,106,15,11,0,11],"after":[32,1,106,34,5,32,6,65,128,32,16,157,15,26,32,5,15,11,0,11],"purpose":"_PMem_AllocNamed(unsigned int, unsigned int, int, unsigned int, char const*, EMemTrack)"},{"at":1030495,"before":[188,10],"after":[192,10],"purpose":"function body length"},{"at":1030678,"before":[32,0,4,64,32,4,40,2,36,65,0,32,0,252,11,0,11],"after":[32,2,65,128,32,113,4,64,32,4,40,2,36,65,0,32,0,252,11,0,11],"purpose":"VirtualAlloc"},{"at":4312817,"before":[176,1],"after":[177,1],"purpose":"function body length"},{"at":4312883,"before":[65,128,32,16,157,15],"after":[65,128,192,0,16,157,15],"purpose":"PMem_Init()"}]};
  const status = window.__bo1MemoryPatch = {id: recipe.id, state: 'installed'};
  const originalFetch = window.fetch.bind(window);
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    x => x.toString(16).padStart(2, '0')).join('');
  const report = () => {
    try { window.webkit?.messageHandlers?.bo1?.postMessage({type: 'memoryPatch', ...status}); } catch (_) {}
  };
  const target = input => {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      return url.origin === location.origin && url.pathname === '/bo1z/artifacts/KisakBlack-web.wasm';
    } catch (_) { return false; }
  };
  window.fetch = async function(input, options) {
    if (!target(input)) return originalFetch(input, options);
    try {
      const response = await originalFetch(input, options);
      if (!response.ok) return response;
      const source = new Uint8Array(await response.arrayBuffer());
      const hash = await digest(source);
      let patched;
      if (hash === recipe.patchedSha256) {
        patched = source;
      } else {
        if (source.byteLength !== recipe.baseBytes || hash !== recipe.baseSha256)
          throw new Error('Version du moteur inconnue : correctif mémoire non appliqué.');
        patched = new Uint8Array(recipe.patchedBytes);
        let read = 0, write = 0;
        for (const edit of recipe.edits) {
          if (edit.at < read || edit.before.some((value, i) => source[edit.at + i] !== value))
            throw new Error('Le moteur ne correspond pas au correctif mémoire.');
          patched.set(source.subarray(read, edit.at), write);
          write += edit.at - read;
          patched.set(edit.after, write);
          write += edit.after.length;
          read = edit.at + edit.before.length;
        }
        patched.set(source.subarray(read), write);
        if (await digest(patched) !== recipe.patchedSha256 || !WebAssembly.validate(patched))
          throw new Error('Vérification du correctif mémoire échouée.');
      }
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding');
      headers.delete('ETag');
      headers.set('Content-Type', 'application/wasm');
      headers.set('Content-Length', String(patched.byteLength));
      status.state = 'applied'; status.sha256 = recipe.patchedSha256;
      report();
      console.log('BO1_MEMORY_PATCH ' + recipe.id + ' applied');
      return new Response(patched, {status: response.status, statusText: response.statusText, headers});
    } catch (error) {
      status.state = 'failed'; status.error = String(error?.message || error).slice(0, 300);
      report();
      console.error('BO1_MEMORY_PATCH failed: ' + status.error);
      throw error; // Streaming and ArrayBuffer retries both pass through this guard.
    }
  };
  report();
})();
