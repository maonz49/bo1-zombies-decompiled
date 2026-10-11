import { wantsTouch } from './touch-keys.js?v=mobile-20261010-5';

export function browserAdvice(nav = globalThis.navigator) {
  if (/Android/i.test(nav?.userAgent ?? ''))
    return 'Ouvrez ce lien dans Chrome à jour sur Android, hors du navigateur intégré d’une application.';
  if (/iPhone|iPad|iPod/i.test(nav?.userAgent ?? '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1))
    return 'Sur iPhone ou iPad, utilisez Safari sous iOS 27 ou iPadOS 27 minimum.';
  return 'Utilisez une version récente de Chrome, Edge ou Firefox et autorisez le stockage pour ce site.';
}

export function mobileProfile(nav = globalThis.navigator, query = globalThis.location?.search ?? '') {
  if (!wantsTouch(nav, query)) return null;
  const requested = new URLSearchParams(query).get('quality');
  // Auto on mobile is conservative: resolution alone does not limit texture memory.
  return requested === 'balanced'
    ? { id: 'balanced', width: 1152, height: 648, fps: 60, picmip: 1, workerThreads: 2, pthreadPoolSize: 8 }
    : { id: 'eco', width: 800, height: 600, fps: 30, picmip: 2, workerThreads: 2, pthreadPoolSize: 8 };
}
