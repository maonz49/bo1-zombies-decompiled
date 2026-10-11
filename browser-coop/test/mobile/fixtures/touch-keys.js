// A key can be held by more than one finger. Release only its last owner.
export function createHeldKeys(send) {
  const owners = new Map();
  const active = () => new Set([...owners.values()].flatMap(keys => [...keys]));
  function set(owner, keys) {
    const before = active();
    if (keys.length) owners.set(owner, new Set(keys)); else owners.delete(owner);
    const after = active();
    for (const key of before) if (!after.has(key)) send({ kind: 'key', key, down: false });
    for (const key of after) if (!before.has(key)) send({ kind: 'key', key, down: true });
  }
  function release() {
    for (const key of active()) send({ kind: 'key', key, down: false });
    owners.clear();
  }
  return { set, release };
}

export function directionKeys(x, y, deadZone = 0.22) {
  const keys = [];
  if (x < -deadZone) keys.push(97);
  if (x > deadZone) keys.push(100);
  if (y < -deadZone) keys.push(119);
  if (y > deadZone) keys.push(115);
  return keys;
}

export function movementKeys(x, y) {
  const keys = directionKeys(x, y);
  // Running uses the same thumb; release Shift as soon as the stick eases off.
  if (y < -0.75) keys.push(160);
  return keys;
}

export function wantsTouch(nav = globalThis.navigator, query = globalThis.location?.search ?? '') {
  const setting = new URLSearchParams(query).get('touch');
  if (setting !== null) return setting === '1';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent ?? '')
    || nav?.userAgentData?.mobile === true
    || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1)
    || (nav?.maxTouchPoints > 0 && globalThis.matchMedia?.('(pointer: coarse)')?.matches === true);
}
