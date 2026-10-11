// Compatibility policy for the captured BO1 browser runtime.
// A reported adapter does not prove that its pipelined renderer can draw.
export const webGPUFeatures = ['texture-compression-bc', 'depth32float-stencil8', 'float32-filterable', 'float32-blendable'];

export function isAppleMobile(nav = globalThis.navigator) {
  return /iPhone|iPad|iPod/i.test(nav?.userAgent ?? '') ||
    (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
}

export function routeFor(nav = globalThis.navigator) {
  return /Firefox\//.test(nav?.userAgent ?? '') ? 'main-pthread' : 'backend-pthread';
}
export const rendererRoute = routeFor();

export function rendererPreference(search = globalThis.location?.search ?? '') {
  const valid = value => value === 'webgl2' || value === 'webgpu' ? value : null;
  const explicit = valid(new URLSearchParams(search).get('renderer'));
  if (explicit) return explicit;
  // Storage can throw SecurityError even when the property itself exists.
  try { return valid(globalThis.sessionStorage?.getItem('kisak-renderer')); }
  catch { return null; }
}

export async function chooseRenderer(param, route = rendererRoute, nav = globalThis.navigator) {
  if (param === 'webgl2') return { renderer: 'webgl2', reason: 'override' };
  const pipeline = route === 'backend-pthread' ? 1 : 0;
  if (param === 'webgpu') return { renderer: 'webgpu', reason: 'override', pipeline };
  if (isAppleMobile(nav)) return { renderer: 'webgl2', reason: 'apple-mobile-compatibility' };
  try {
    const adapter = await nav?.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { renderer: 'webgl2', reason: 'no-webgpu-adapter' };
    const missing = webGPUFeatures.filter(feature => !adapter.features.has(feature));
    if (missing.length) return { renderer: 'webgl2', reason: 'missing-' + missing.join('+') };
    if (!pipeline) return { renderer: 'webgl2', reason: 'route-' + route };
    return { renderer: 'webgpu', reason: 'default', pipeline };
  } catch (error) { return { renderer: 'webgl2', reason: 'adapter-error ' + String(error?.message ?? error) }; }
}

export function shouldFallbackToWebGL(message, state) {
  if (state.rendererRequested !== 'webgpu' || state.rendererFallbackPending ||
      state.timings?.firstPresent != null || state.readyFired || state.interactive || state.quit) return false;
  return /dx\.device->BeginScene\(\) failed:|^WEB_GPU_FALLBACK\b|webgpu-device-lost|WebGPU graphics device was lost/i.test(String(message));
}
