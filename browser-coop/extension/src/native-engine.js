import { BUILDS } from './layout.js';
import { patchEngine, sha256Hex } from './patch.js';

const instantiationFailures = new WeakMap();

// The shipped runtime's custom-instantiator callback has no rejection argument.
// Race its initialization against our failure signal, so a bad import never hangs startup.
export function finishEngine(runtime, options) {
  const failure = instantiationFailures.get(options);
  return failure ? Promise.race([runtime, failure]) : runtime;
}

// Native Emscripten integration: no WebAssembly monkey-patch or Object.prototype setter.
// Compilation happens before entering the runtime so failures reject the normal load promise.
export async function engineOptions(coop, url, fetchEngine = fetch) {
  if (!coop.mode && !coop.controller) return {};
  const response = await fetchEngine(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Chargement du moteur impossible (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  coop.hash = await sha256Hex(bytes);
  coop.build = BUILDS[coop.hash] ?? null;
  coop.patched = false;
  if (!coop.build) {
    coop.error = 'Cette version du moteur est inconnue : manette et coopération désactivées.';
    coop.note(`unknown engine build ${coop.hash}`);
    if (coop.mode) throw new Error(coop.error);
    return {}; // Solo can still use the original, unmodified runtime.
  }
  let compiled;
  try {
    const patched = patchEngine(bytes, coop.hash, coop.build);
    compiled = await WebAssembly.compile(patched);
  } catch (error) {
    coop.error = `Préparation manette/coopération impossible : ${error.message}`;
    coop.note(coop.error);
    if (coop.mode) throw new Error(coop.error);
    return {};
  }
  coop.patched = true;
  coop.note('known engine patched and compiled');
  let fail;
  const failure = new Promise((_, reject) => { fail = reject; });
  const options = {
    instantiateWasm(imports, receiveInstance) {
      // Even a precompiled >8MB module cannot use synchronous Instance on Chrome's main thread.
      WebAssembly.instantiate(compiled, imports)
        .then(instance => receiveInstance(instance, compiled))
        .catch(error => { coop.error = error.message; fail(error); });
      return {};
    },
  };
  instantiationFailures.set(options, failure);
  return options;
}
