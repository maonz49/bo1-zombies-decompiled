// Generated with the pinned recipe. Changes only the known engine, before instantiation.
(() => {
  'use strict';
  if (location.origin !== 'https://bo1.znoam.eu' || window !== window.top || window.__bo1MemoryPatch) return;
  const recipe = __BO1_RECIPE__;
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
