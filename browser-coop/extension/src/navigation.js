export function isLoopback(value) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); }
  catch { return false; }
}

export function normalizeRelay(text, allowLocal = false) {
  try {
    const url = new URL(String(text).trim());
    if (url.username || url.password) return '';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    if (url.protocol === 'https:' || (allowLocal && url.protocol === 'http:' && isLoopback(url.href))) return url.origin;
  } catch { /* invalid address */ }
  return '';
}

// Keep this device's renderer, touch controls and quality when changing session/map.
export function sessionUrl(current, { role, room, pathname, relay = '', localRelay = '', horde } = {}) {
  const url = new URL(current);
  if (pathname) url.pathname = pathname;
  for (const key of ['coop', 'room', 'relay', 'coopRelay']) url.searchParams.delete(key);
  if (role && room) {
    url.searchParams.set('coop', role);
    url.searchParams.set('room', room);
    if (relay) url.searchParams.set('relay', relay);
    if (localRelay) url.searchParams.set('coopRelay', localRelay);
  }
  if (horde !== undefined) {
    if (horde) url.searchParams.set('horde', '1');
    else url.searchParams.delete('horde');
  }
  url.hash = '';
  return url.href;
}
