// BO1 Znoam znoam-20261011-2. Adapted from invictus841/bo1-zombies-decompiled @ 861e39bc.

// extension/src/layout.js
var BUILDS = {
  // KisakBlack-web.wasm served by https://vel.gg/bo1z/ since 2026-10-04 (9,618,325 bytes)
  "61192df377020627f52fa7e9fd28047bd53662aa46e5e3cd6e7fad0c5c35cc98": {
    // Functions patched or called by the patch: index (imports included) and expected name.
    functions: {
      svFrame: [3646, "__wrap__Z8SV_Frameii"],
      netGetLoopPacket: [4026, "NET_GetLoopPacket(netsrc_t, netadr_t*, msg_t*)"],
      cbufAddText: [291, "Cbuf_AddText(int, char const*)"],
      svWaitServer: [1391, "SV_WaitServer()"],
      // Debug-check handler: prints "KISAK_HEADLESS assert ..." then traps. In co-op it returns 1 (continue) instead.
      assertHandler: [170, "Assert_MyHandler(char const*, int, int, char const*, ...)"],
      // Attaches effects and weapons to another player's body. Fatal when that player's model is not there yet,
      // which solo play never meets; in co-op the two errors become "leave the tag as it was".
      cachedTagUpdate: [4317, "CachedTag_UpdateTagInternal(centity_s const*, cached_client_tag_t*, unsigned int, int, bool)"],
      comError: [179, "Com_Error(errorParm_t, char const*, ...)"]
    },
    // Three words of zero padding between web-layer statics, referenced by no instruction.
    // The patch uses them as cross-thread mailboxes: CMD (char* console command), FREEZE (bool), INQ (ring index).
    flags: { cmd: 148263172, freeze: 148263176, inq: 148263180 },
    // loopback_t loopbacks[2]: ring 0 = server -> local client, ring 1 = clients -> server.
    // Each ring: 16 msgs of { u8 data[1264]; i32 datalen; i32 port } then i32 get, i32 send.
    // Sends pick the ring with to.port when sock == NS_SERVER, without a bounds check: port P writes base + P * stride.
    loopback: { base: 135783616, stride: 20360, slots: 16, slotSize: 1272, dataMax: 1264, offLen: 1264, offPort: 1268, offGet: 20352, offSend: 20356 },
    // Ports 0 and 1 are the real rings; this one maps onto engine data in this build.
    forbiddenPorts: [0, 1, 1773],
    server: {
      allowNetPackets: 142494258,
      // u8 sv.allowNetPackets: the server thread drains ring 1 only while 1
      clientsPtr: 142360860,
      // client_t* svs.clients
      clientStride: 544120,
      clientState: 0,
      // i32 clientState_t: 0 free, 1 zombie, 2 reconnecting, 3 connected, 4 loading, 5 active
      clientAddrType: 32,
      // i32 netadr_t.type
      clientAddrPort: 40,
      // u16 netadr_t.port
      clientConnectState: 544089
      // u8 last connection state the client reported (10 = active)
    },
    client: {
      connectionState: 13391960,
      // i32 clientUIActive.connectionState: 5 challenging .. 10 active
      clcPtr: 43783020,
      // clientConnection_t* (serverAddress.port is a u16 at +24)
      serverAddressPort: 24,
      lastPacketTime: 12
      // i32 clc->lastPacketTime; the engine skips its connection timeout while it is 0
    },
    // Pointers to dvar_s; the current value is at +24.
    dvars: { comSvRunning: 134904904, svPaused: 134904892, clPaused: 134904896, comMaxClients: 134904752 },
    dvarValue: 24,
    browser: { mapLoadedPrinted: 148263157, introState: 148263168 },
    netadrLoopback: 2
    // NA_LOOPBACK
  }
};
BUILDS["36024c2655e29a3eb97b64c20e3b9270cd610943c70c18ed470bcd8789a6ff01"] = BUILDS["61192df377020627f52fa7e9fd28047bd53662aa46e5e3cd6e7fad0c5c35cc98"];
function compatibleEngines(left, right) {
  return Object.hasOwn(BUILDS, left) && Object.hasOwn(BUILDS, right) && BUILDS[left] === BUILDS[right];
}
var CONNECTION = Object.freeze({ disconnected: 0, connecting: 4, challenging: 5, connected: 6, sendingStats: 7, loading: 8, primed: 9, active: 10 });
var CLIENT_STATE = Object.freeze({ free: 0, zombie: 1, reconnecting: 2, connected: 3, loading: 4, active: 5 });

// extension/src/patch.js
function uleb(n) {
  const out = [];
  do {
    let byte = n & 127;
    n >>>= 7;
    if (n) byte |= 128;
    out.push(byte);
  } while (n);
  return out;
}
function sleb(n) {
  const out = [];
  for (; ; ) {
    let byte = n & 127;
    n >>= 7;
    const done = n === 0 && !(byte & 64) || n === -1 && byte & 64;
    if (!done) byte |= 128;
    out.push(byte);
    if (done) return out;
  }
}
function readUleb(bytes, at) {
  let result = 0, shift = 0, byte;
  do {
    byte = bytes[at++];
    result |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  return [result >>> 0, at];
}
var I32_CONST = (v) => [65, ...sleb(v | 0)];
var LOAD = [40, 2, 0];
var ATOMIC_LOAD = [254, 16, 2, 0];
var ATOMIC_XCHG = [254, 65, 2, 0];
var LOCAL_GET = (i) => [32, ...uleb(i)];
var LOCAL_SET = (i) => [33, ...uleb(i)];
var LOCAL_TEE = (i) => [34, ...uleb(i)];
var CALL = (f) => [16, ...uleb(f)];
var IF = [4, 64];
var END = 11;
var RETURN = 15;
var I32_EQ = 70;
var I32_GE_U = 79;
function svFramePrologue(build) {
  const { flags, functions } = build;
  return [
    ...I32_CONST(flags.cmd),
    ...I32_CONST(0),
    ...ATOMIC_XCHG,
    ...LOCAL_TEE(1),
    ...IF,
    ...I32_CONST(0),
    ...LOCAL_GET(1),
    ...CALL(functions.cbufAddText[0]),
    END,
    ...I32_CONST(0),
    ...LOCAL_SET(1),
    ...I32_CONST(flags.freeze),
    ...ATOMIC_LOAD,
    ...IF,
    ...CALL(functions.svWaitServer[0]),
    ...LOCAL_GET(0),
    RETURN,
    END
  ];
}
function netGetLoopPacketPrologue(build) {
  const { flags, loopback } = build;
  const ring1 = loopback.base + loopback.stride;
  return [
    ...LOCAL_GET(0),
    ...I32_CONST(1),
    I32_EQ,
    ...IF,
    ...I32_CONST(flags.inq),
    ...ATOMIC_LOAD,
    ...LOCAL_TEE(4),
    ...IF,
    ...I32_CONST(ring1 + loopback.offGet),
    ...LOAD,
    ...I32_CONST(ring1 + loopback.offSend),
    ...LOAD,
    I32_GE_U,
    ...IF,
    ...LOCAL_GET(4),
    ...LOCAL_SET(0),
    END,
    END,
    ...I32_CONST(0),
    ...LOCAL_SET(4),
    END
  ];
}
function readSleb(bytes, at) {
  let result = 0, shift = 0, byte;
  do {
    byte = bytes[at++];
    result |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  if (shift < 32 && byte & 64) result |= -1 << shift;
  return [result, at];
}
function nonFatalAssert(body, params) {
  let [groups, p] = readUleb(body, 0);
  for (let g = 0; g < groups; g += 1) p = readUleb(body, p)[1] + 1;
  const fail = (why) => {
    throw new Error(`assert handler: ${why}`);
  };
  if (body[p] !== 35) fail("no stack frame");
  const [sp, a] = readUleb(body, p + 1);
  if (body[a] !== 65) fail("no frame size");
  const [frame, b] = readSleb(body, a + 1);
  if (body[b] !== 107 || body[b + 1] !== 34) fail("unexpected prologue");
  const [frameLocal, c] = readUleb(body, b + 2);
  if (frameLocal < params || body[c] !== 36 || readUleb(body, c + 1)[0] !== sp) fail("unexpected prologue");
  const end = body.length;
  if (body[end - 1] !== 11 || body[end - 2] !== 0) fail("does not end with unreachable");
  const tail = [...LOCAL_GET(frameLocal), ...I32_CONST(frame), 106, 36, ...uleb(sp), ...I32_CONST(1), RETURN, END];
  const out = new Uint8Array(end - 2 + tail.length);
  out.set(body.subarray(0, end - 2), 0);
  out.set(tail, end - 2);
  return out;
}
function neutralizeCalls(body, callee, args, expected) {
  const pattern = Uint8Array.from([16, ...uleb(callee)]);
  const out = Uint8Array.from(body);
  let found = 0;
  for (let i = 0; i + pattern.length <= out.length; i += 1) {
    if (pattern.every((byte, k) => out[i + k] === byte)) {
      if (pattern.length !== args) throw new Error("neutralizeCalls: call and drops differ in size");
      for (let k = 0; k < args; k += 1) out[i + k] = 26;
      found += 1;
      i += pattern.length - 1;
    }
  }
  if (found !== expected) throw new Error(`neutralizeCalls: found ${found} calls, expected ${expected}`);
  return out;
}
function inspectWasm(bytes) {
  if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109) throw new Error("not a wasm module");
  const sections = [];
  let importedFunctions = 0, nameSection = null;
  let at = 8;
  while (at < bytes.length) {
    const id = bytes[at];
    const [size, body] = readUleb(bytes, at + 1);
    const section = { id, start: at, body, end: body + size };
    sections.push(section);
    if (id === 2) importedFunctions = countImportedFunctions(bytes, body);
    if (id === 0) {
      const [nameLength, nameAt] = readUleb(bytes, body);
      if (new TextDecoder().decode(bytes.subarray(nameAt, nameAt + nameLength)) === "name") nameSection = { at: nameAt + nameLength, end: section.end };
    }
    at = section.end;
  }
  return { sections, importedFunctions, nameSection };
}
function countImportedFunctions(bytes, at) {
  let [count, p] = readUleb(bytes, at);
  let functions = 0;
  for (let i = 0; i < count; i += 1) {
    let length;
    [length, p] = readUleb(bytes, p);
    p += length;
    [length, p] = readUleb(bytes, p);
    p += length;
    const kind = bytes[p++];
    if (kind === 0) {
      functions += 1;
      p = readUleb(bytes, p)[1];
    } else if (kind === 1) {
      p += 1;
      const limits = bytes[p++];
      p = readUleb(bytes, p)[1];
      if (limits & 1) p = readUleb(bytes, p)[1];
    } else if (kind === 2) {
      const limits = bytes[p++];
      p = readUleb(bytes, p)[1];
      if (limits & 1) p = readUleb(bytes, p)[1];
    } else if (kind === 3) p += 2;
    else if (kind === 4) {
      p += 1;
      p = readUleb(bytes, p)[1];
    } else throw new Error(`unknown import kind ${kind}`);
  }
  return functions;
}
function functionNames(bytes, nameSection, wanted) {
  const names = /* @__PURE__ */ new Map();
  if (!nameSection) return names;
  const want = new Set(wanted);
  let at = nameSection.at;
  while (at < nameSection.end) {
    const kind = bytes[at++];
    const [size, body] = readUleb(bytes, at);
    if (kind === 1) {
      let [count, p] = readUleb(bytes, body);
      for (let i = 0; i < count && names.size < want.size; i += 1) {
        let index, length;
        [index, p] = readUleb(bytes, p);
        [length, p] = readUleb(bytes, p);
        if (want.has(index)) names.set(index, new TextDecoder().decode(bytes.subarray(p, p + length)));
        p += length;
      }
    }
    at = body + size;
  }
  return names;
}
function patchEngine(input, hash, build = BUILDS[hash]) {
  if (!build) throw new Error(`unknown engine build ${hash?.slice(0, 12)}`);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { sections, importedFunctions, nameSection } = inspectWasm(bytes);
  const indices = Object.values(build.functions).map(([index]) => index);
  const names = functionNames(bytes, nameSection, indices);
  for (const [index, expected] of Object.values(build.functions)) {
    if (names.get(index) !== expected) throw new Error(`function ${index} is ${names.get(index)}, expected ${expected}`);
  }
  const code = sections.find((section) => section.id === 10);
  const targets = /* @__PURE__ */ new Map([
    [build.functions.svFrame[0] - importedFunctions, [svFramePrologue(build), 1, 1]],
    [build.functions.netGetLoopPacket[0] - importedFunctions, [netGetLoopPacketPrologue(build), 3, 4]]
  ]);
  const assertIndex = build.functions.assertHandler ? build.functions.assertHandler[0] - importedFunctions : -1;
  const cachedTagIndex = build.functions.cachedTagUpdate && build.functions.comError ? build.functions.cachedTagUpdate[0] - importedFunctions : -1;
  let [count, at] = readUleb(bytes, code.body);
  const parts = [Uint8Array.from(uleb(count))];
  let patched = 0;
  for (let i = 0; i < count; i += 1) {
    const [size, bodyStart] = readUleb(bytes, at);
    const bodyEnd = bodyStart + size;
    const target = targets.get(i);
    if (assertIndex === i) {
      const body = nonFatalAssert(bytes.subarray(bodyStart, bodyEnd), 4);
      parts.push(Uint8Array.from(uleb(body.length)), body);
      patched += 1;
    } else if (cachedTagIndex === i) {
      const body = neutralizeCalls(bytes.subarray(bodyStart, bodyEnd), build.functions.comError[0], 3, 2);
      parts.push(Uint8Array.from(uleb(body.length)), body);
      patched += 1;
    } else if (target) {
      const [prologue, params, scratch] = target;
      let [groups, p] = readUleb(bytes, bodyStart);
      let next = params, scratchType = null;
      for (let g = 0; g < groups; g += 1) {
        let n;
        [n, p] = readUleb(bytes, p);
        if (scratch >= next && scratch < next + n) scratchType = bytes[p];
        next += n;
        p += 1;
      }
      if (scratchType !== 127) throw new Error(`patch target ${i + importedFunctions}: local ${scratch} is not an i32`);
      const body = new Uint8Array(size + prologue.length);
      body.set(bytes.subarray(bodyStart, p), 0);
      body.set(prologue, p - bodyStart);
      body.set(bytes.subarray(p, bodyEnd), p - bodyStart + prologue.length);
      parts.push(Uint8Array.from(uleb(body.length)), body);
      patched += 1;
    } else {
      parts.push(bytes.subarray(at, bodyEnd));
    }
    at = bodyEnd;
  }
  if (patched !== targets.size + (assertIndex >= 0 ? 1 : 0) + (cachedTagIndex >= 0 ? 1 : 0)) throw new Error("patch targets not found");
  const bodyLength = parts.reduce((sum, part) => sum + part.length, 0);
  const header = Uint8Array.from([10, ...uleb(bodyLength)]);
  const out = new Uint8Array(code.start + header.length + bodyLength + (bytes.length - code.end));
  out.set(bytes.subarray(0, code.start), 0);
  let o = code.start;
  out.set(header, o);
  o += header.length;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  out.set(bytes.subarray(code.end), o);
  return out;
}
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// extension/src/native-engine.js
var instantiationFailures = /* @__PURE__ */ new WeakMap();
function finishEngine(runtime, options) {
  const failure = instantiationFailures.get(options);
  return failure ? Promise.race([runtime, failure]) : runtime;
}
async function engineOptions(coop, url, fetchEngine = fetch) {
  if (!coop.mode && !coop.controller) return {};
  const response = await fetchEngine(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Chargement du moteur impossible (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  coop.hash = await sha256Hex(bytes);
  coop.build = BUILDS[coop.hash] ?? null;
  coop.patched = false;
  if (!coop.build) {
    coop.error = "Cette version du moteur est inconnue : manette et coop\xE9ration d\xE9sactiv\xE9es.";
    coop.note(`unknown engine build ${coop.hash}`);
    if (coop.mode) throw new Error(coop.error);
    return {};
  }
  let compiled;
  try {
    const patched = patchEngine(bytes, coop.hash, coop.build);
    compiled = await WebAssembly.compile(patched);
  } catch (error) {
    coop.error = `Pr\xE9paration manette/coop\xE9ration impossible : ${error.message}`;
    coop.note(coop.error);
    if (coop.mode) throw new Error(coop.error);
    return {};
  }
  coop.patched = true;
  coop.note("known engine patched and compiled");
  let fail;
  const failure = new Promise((_, reject) => {
    fail = reject;
  });
  const options = {
    instantiateWasm(imports, receiveInstance) {
      WebAssembly.instantiate(compiled, imports).then((instance) => receiveInstance(instance, compiled)).catch((error) => {
        coop.error = error.message;
        fail(error);
      });
      return {};
    }
  };
  instantiationFailures.set(options, failure);
  return options;
}

// extension/src/navigation.js
function isLoopback(value) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}
function normalizeRelay(text, allowLocal = false) {
  try {
    const url = new URL(String(text).trim());
    if (url.username || url.password) return "";
    if (url.protocol === "wss:") url.protocol = "https:";
    if (url.protocol === "https:" || allowLocal && url.protocol === "http:" && isLoopback(url.href)) return url.origin;
  } catch {
  }
  return "";
}
function sessionUrl(current, { role, room, pathname, relay = "", localRelay = "", horde } = {}) {
  const url = new URL(current);
  if (pathname) url.pathname = pathname;
  for (const key of ["coop", "room", "relay", "coopRelay"]) url.searchParams.delete(key);
  if (role && room) {
    url.searchParams.set("coop", role);
    url.searchParams.set("room", room);
    if (relay) url.searchParams.set("relay", relay);
    if (localRelay) url.searchParams.set("coopRelay", localRelay);
  }
  if (horde !== void 0) {
    if (horde) url.searchParams.set("horde", "1");
    else url.searchParams.delete("horde");
  }
  url.hash = "";
  return url.href;
}

// extension/src/main.js
import { relay as configuredRelay } from "./coop-config.js";

// extension/src/rings.js
function ringOffsets(layout, index) {
  const lb = layout.loopback;
  const base = lb.base + index * lb.stride;
  return { base, get: base + lb.offGet, send: base + lb.offSend };
}

// extension/src/engine-mem.js
var EngineMemory = class {
  constructor(Module, layout) {
    this.Module = Module;
    this.layout = layout;
    this.memory = Module.HEAPF32.buffer;
    this.i32 = new Int32Array(this.memory);
    this.u16 = new Uint16Array(this.memory);
    this.u8 = new Uint8Array(this.memory);
    this.commandBuffer = 0;
  }
  int(address) {
    return Atomics.load(this.i32, address >> 2);
  }
  setInt(address, value) {
    Atomics.store(this.i32, address >> 2, value);
  }
  byte(address) {
    return Atomics.load(this.u8, address);
  }
  dvarInt(name) {
    const dvar = this.int(this.layout.dvars[name]);
    return dvar ? this.int(dvar + this.layout.dvarValue) : null;
  }
  setDvarInt(name, value) {
    const dvar = this.int(this.layout.dvars[name]);
    if (dvar) this.setInt(dvar + this.layout.dvarValue, value);
    return Boolean(dvar);
  }
  mailboxesClear() {
    const { cmd, freeze, inq } = this.layout.flags;
    return this.int(cmd) === 0 && this.int(freeze) === 0 && this.int(inq) === 0;
  }
  /** Queues one console command for the engine main thread; false while the previous one is pending. */
  command(text) {
    const { cmd } = this.layout.flags;
    if (this.int(cmd) !== 0) return false;
    const bytes = new TextEncoder().encode(`${text}
`);
    if (bytes.length >= 1024) throw new RangeError("command too long");
    if (!this.commandBuffer) this.commandBuffer = this.Module._malloc(1024);
    this.u8.set(bytes, this.commandBuffer);
    this.u8[this.commandBuffer + bytes.length] = 0;
    return Atomics.compareExchange(this.i32, cmd >> 2, 0, this.commandBuffer) === 0;
  }
  commandPending() {
    return this.int(this.layout.flags.cmd) !== 0;
  }
  setFreeze(on) {
    this.setInt(this.layout.flags.freeze, on ? 1 : 0);
  }
  serverDrainsPackets() {
    return this.byte(this.layout.server.allowNetPackets) === 1;
  }
  serverRunning() {
    const dvar = this.int(this.layout.dvars.comSvRunning);
    return dvar ? this.byte(dvar + this.layout.dvarValue) === 1 : false;
  }
  connectionState() {
    return this.int(this.layout.client.connectionState);
  }
  /** Points the local client's server address at loopback port 0, where the page injects the host's packets. */
  setServerAddressPort(port) {
    const clc = this.int(this.layout.client.clcPtr);
    if (!clc) return false;
    Atomics.store(this.u16, clc + this.layout.client.serverAddressPort >> 1, port);
    return true;
  }
  /** Zeroes the client's last-packet time: the engine skips its connection timeout while it is 0. */
  clearLastPacketTime() {
    const clc = this.int(this.layout.client.clcPtr);
    if (clc) this.setInt(clc + this.layout.client.lastPacketTime, 0);
  }
  /** A game menu (pause menu, options, ...) owns the cursor. */
  menuOpen() {
    return Boolean(this.Module._KB_UIState?.() & 1);
  }
  serverAddressPort() {
    const clc = this.int(this.layout.client.clcPtr);
    return clc ? Atomics.load(this.u16, clc + this.layout.client.serverAddressPort >> 1) : null;
  }
  /** Server slots in use: [{ slot, state, loopback, port, connectState }]. */
  serverClients() {
    const s = this.layout.server;
    const clients = this.int(s.clientsPtr);
    const count = this.dvarInt("comMaxClients") ?? 0;
    const out = [];
    if (!clients) return out;
    for (let slot = 0; slot < Math.min(count, 64); slot += 1) {
      const base = clients + slot * s.clientStride;
      const state = this.int(base + s.clientState);
      if (state === CLIENT_STATE.free) continue;
      out.push({
        slot,
        state,
        loopback: this.int(base + s.clientAddrType) === this.layout.netadrLoopback,
        port: Atomics.load(this.u16, base + s.clientAddrPort >> 1),
        connectState: this.byte(base + s.clientConnectState)
      });
    }
    return out;
  }
  /**
   * Host: two rings the engine knows nothing about, inside one malloc'd block. The server sends to loopback port P
   * by writing loopbacks[P] = base + P * stride, so P is picked to land in the block; Q = P + 1 is the inbound ring
   * the patched NET_GetLoopPacket drains. Never freed.
   */
  allocateRemoteRings() {
    const lb = this.layout.loopback;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const size = 3 * lb.stride + 64;
      const block = this.Module._malloc(size);
      if (!block) throw new Error("out of engine memory");
      this.u8.fill(0, block, block + size);
      const port = Math.ceil((block - lb.base) / lb.stride);
      const inPort = port + 1;
      const fits = lb.base + (inPort + 1) * lb.stride <= block + size;
      const allowed = ![port, inPort].some((p) => this.layout.forbiddenPorts.includes(p));
      if (port >= 2 && inPort <= 65535 && fits && allowed) {
        return { port, inPort, out: ringOffsets(this.layout, port), in: ringOffsets(this.layout, inPort) };
      }
    }
    throw new Error("could not place the co-op rings in engine memory");
  }
  setInboundRing(index) {
    this.setInt(this.layout.flags.inq, index);
  }
};

// shared/protocol.js
var ROLES = Object.freeze(["host", "guest"]);
var RELAY_MESSAGE_TYPES = Object.freeze(["welcome", "peer", "error"]);
var ROOM_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
var ROOM_CODE_LENGTH = 16;
function createRoomCode(random = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = random(new Uint8Array(ROOM_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += ROOM_ALPHABET[byte & 31];
  return code.match(/.{4}/g).join("-");
}
function normalizeRoomCode(input) {
  if (typeof input !== "string") return null;
  let text = input.trim();
  try {
    const url = new URL(text);
    text = url.searchParams.get("room") ?? "";
  } catch {
  }
  const compact = text.toLowerCase().replace(/[^0-9a-z]/g, "");
  if (compact.length !== ROOM_CODE_LENGTH || [...compact].some((c) => !ROOM_ALPHABET.includes(c))) return null;
  return compact.match(/.{4}/g).join("-");
}

// extension/src/ui.js
var STYLE = `
:host { all: initial; position: fixed; top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); z-index: 10000; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #eee; }
.card { box-sizing: border-box; width: min(330px, calc(100vw - 24px)); max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow-y: auto; background: rgba(8, 8, 8, .96); border: 1px solid #555; border-radius: 6px; padding: 12px 14px; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.head { display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 12px; }
.head .dot { width: 8px; height: 8px; border-radius: 50%; background: #666; flex: none; }
.head .dot.ok { background: #5fbf5f; } .head .dot.wait { background: #e0b84a; } .head .dot.bad { background: #e05a4a; }
.head .grow { flex: 1; }
.head button.icon { all: unset; display: grid; place-items: center; cursor: pointer; color: #ddd; min-width: 44px; min-height: 44px; font-size: 20px; }
.body { margin-top: 10px; display: grid; gap: 8px; }
.muted { color: #aaa; } .error { color: #ff8a7a; } .small { font-size: 12px; }
.code { font: 600 16px/1.2 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .04em; color: #fff; user-select: all; }
.lines { display: grid; gap: 2px; font-size: 12px; } .lines b { font-weight: 600; color: #ddd; }
button.act { all: unset; box-sizing: border-box; min-height: 44px; text-align: center; cursor: pointer; padding: 7px 10px; border: 1px solid #555; border-radius: 4px; background: #1d1d1d; color: #fff; font-weight: 600; }
button:focus-visible, input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
button.act:hover, button.act:focus-visible { background: #2c2c2c; border-color: #888; }
button.act.primary { background: #c9c9c9; color: #000; border-color: #c9c9c9; } button.act.primary:hover { background: #fff; }
button.act[disabled] { opacity: .5; cursor: default; }
a.link { color: #9cc7ff; text-decoration: underline; cursor: pointer; }
.meter { height: 6px; border-radius: 3px; background: #333; overflow: hidden; }
.meter > span { display: block; height: 100%; background: #5fbf5f; }
.meter.warn > span { background: #e0b84a; } .meter.full > span { background: #e05a4a; }
.row { display: flex; gap: 8px; } .row > * { flex: 1; }
.field-label { display: grid; gap: 6px; font-size: 12px; }
input { all: unset; box-sizing: border-box; min-height: 44px; padding: 6px 8px; border: 1px solid #555; border-radius: 4px; background: #111; color: #fff; font: 16px ui-monospace, Menlo, monospace; min-width: 0; width: 100%; }
input:focus { border-color: #999; }
.pill { display: none; }
:host(.compact) .card { display: none; }
:host(.compact) .pill { display: block; pointer-events: none; background: rgba(0,0,0,.55); border-radius: 12px; padding: 3px 10px; font-size: 12px; color: #ddd; }
:host(.compact) .pill:empty { display: none; }
:host(.collapsed) .body { display: none; }
:host(.collapsed) .card { width: auto; min-width: 180px; }
`;
var Panel = class {
  constructor(handlers) {
    this.handlers = handlers;
    this.host = document.createElement("bo1z-coop");
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style><section class="card" aria-label="Manette et coop\xE9ration"><div class="head"><span class="dot" aria-hidden="true"></span><span class="grow">Manette \xB7 Coop\xE9ration</span><button class="icon" data-act="collapse" aria-label="R\xE9duire ou ouvrir les options" aria-expanded="true">\u2212</button></div><div class="body"></div></section><div class="pill"></div>`;
    if (matchMedia("(pointer: coarse)").matches) this.host.classList.add("collapsed");
    this.root.querySelector('[data-act="collapse"]').setAttribute("aria-expanded", String(!this.host.classList.contains("collapsed")));
    this.card = this.root.querySelector(".card");
    this.body = this.root.querySelector(".body");
    this.dot = this.root.querySelector(".dot");
    this.pill = this.root.querySelector(".pill");
    this.view = null;
    for (const type of ["keydown", "keyup", "keypress", "click", "mousedown", "mouseup", "pointerdown", "pointerup", "wheel"]) {
      this.host.addEventListener(type, (event) => event.stopPropagation());
    }
    this.root.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-act]");
      if (!button || button.disabled) return;
      const act = button.dataset.act;
      if (act === "collapse") {
        this.host.classList.toggle("collapsed");
        button.setAttribute("aria-expanded", String(!this.host.classList.contains("collapsed")));
        return;
      }
      const field = button.dataset.field ? this.root.querySelector(`input[data-field="${button.dataset.field}"]`) : null;
      this.handlers[act]?.(field ? field.value : void 0);
    });
    this.root.addEventListener("keydown", (event) => {
      const input = event.target.matches?.("input[data-act]") ? event.target : null;
      if (event.key === "Enter" && input) this.handlers[input.dataset.act]?.(input.value);
    });
  }
  mount() {
    const attach = () => {
      if (!this.host.isConnected) document.documentElement.append(this.host);
    };
    if (document.documentElement) attach();
    else document.addEventListener("readystatechange", attach, { once: true });
  }
  /** Re-renders only when the view changes, so typing in the input is never interrupted. */
  render(view2) {
    const key = JSON.stringify(view2);
    if (key === this.view) return;
    const focused = this.root.activeElement;
    const field = focused?.dataset.field;
    const selection = field ? [focused.selectionStart, focused.selectionEnd] : null;
    const action = focused?.dataset.act;
    const scroll = this.card.scrollTop;
    const previous = new Map([...this.root.querySelectorAll("input[data-field]")].map((i) => [i.dataset.field, i.value]));
    this.view = key;
    this.dot.className = `dot ${view2.tone ?? ""}`;
    this.host.classList.toggle("compact", Boolean(view2.compact));
    this.pill.textContent = view2.pill ?? "";
    this.body.replaceChildren(...view2.blocks.map((block) => this.block(block)));
    for (const input of this.root.querySelectorAll("input[data-field]")) {
      if (previous.has(input.dataset.field)) input.value = previous.get(input.dataset.field);
      if (field === input.dataset.field) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(...selection);
      }
    }
    if (!field && action) this.root.querySelector(`[data-act="${action}"]`)?.focus({ preventScroll: true });
    this.card.scrollTop = scroll;
  }
  block(block) {
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    switch (block.kind) {
      case "text":
        return el("div", block.cls ?? "", block.text);
      case "code":
        return el("div", "code", block.text);
      case "lines": {
        const box = el("div", "lines");
        for (const [label, value] of block.lines) {
          const line = el("div");
          line.append(el("b", "", `${label}: `), document.createTextNode(value));
          box.append(line);
        }
        return box;
      }
      case "buttons": {
        const row = el("div", "row");
        for (const b of block.buttons) {
          const button = el("button", `act ${b.primary ? "primary" : ""}`, b.label);
          button.dataset.act = b.act;
          if (b.disabled) button.disabled = true;
          row.append(button);
        }
        return row;
      }
      case "link": {
        const box = el("div", "small");
        if (block.title) box.append(el("b", "", `${block.title} `));
        const a = el("a", "link", block.text);
        a.href = block.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        box.append(a);
        return box;
      }
      case "meter": {
        const box = el("div", "lines");
        box.append(el("div", "small muted", block.label));
        const bar = el("div", `meter ${block.fraction >= 1 ? "full" : block.fraction >= 0.75 ? "warn" : ""}`);
        const fill = el("span");
        fill.style.width = `${Math.round(Math.min(1, Math.max(0, block.fraction)) * 100)}%`;
        bar.append(fill);
        box.append(bar);
        return box;
      }
      case "input": {
        const label = el("label", "field-label", block.title ?? block.placeholder);
        const row = el("div", "row");
        const input = el("input");
        input.placeholder = block.placeholder ?? "";
        input.spellcheck = false;
        input.dataset.field = block.field;
        input.dataset.act = block.act;
        input.setAttribute("aria-label", block.title ?? block.placeholder);
        if (block.value) input.value = block.value;
        const button = el("button", "act", block.label);
        button.dataset.act = block.act;
        button.dataset.field = block.field;
        button.style.flex = "0 0 auto";
        row.append(input, button);
        label.append(row);
        return label;
      }
      default:
        return el("div");
    }
  }
};

// extension/src/gamepad.js
var B = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8,
  options: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15
};
var HOLD = /* @__PURE__ */ new Map([
  [B.cross, "gostand"],
  // jump
  [B.square, "usereload"],
  // reload; hold to use / buy / revive
  [B.l1, "smoke"],
  // special grenade (monkey bomb, ...)
  [B.r1, "frag"],
  // grenade
  [B.l2, "speed_throw"],
  // aim down sights
  [B.r2, "attack"],
  // fire
  [B.create, "scores"],
  [B.r3, "melee"]
]);
var SLOTS = /* @__PURE__ */ new Map([[B.up, 1], [B.down, 2], [B.left, 3], [B.right, 4]]);
var KEY = { escape: 27, enter: 13, up: 154, down: 155, left: 156, right: 157, mouse1: 200 };
var MOVE = { forward: 301, back: 302, moveleft: 303, moveright: 304 };
var STICK_DEADZONE = 0.16;
var AIM_DEADZONE = 0.12;
var TRIGGER = 0.35;
var PRONE_HOLD_MS = 350;
var AIM_SPEEDS = [600, 900, 1200, 1500, 1875, 2250, 2700, 3150, 3750, 4500];
var DEFAULT_AIM_LEVEL = 4;
function normalizeAimLevel(value) {
  const number = value === null || value === "" ? NaN : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(AIM_SPEEDS.length - 1, Math.round(number))) : DEFAULT_AIM_LEVEL;
}
var GamepadControl = class {
  /**
   * engine(): { Module, command(text) } or null while the game is not ready; canvasSize(): { width, height }.
   */
  constructor({ engine, canvasSize, aimLevel = DEFAULT_AIM_LEVEL }) {
    this.engine = engine;
    this.canvasSize = canvasSize;
    this.aimLevel = normalizeAimLevel(aimLevel);
    this.pad = null;
    this.prev = [];
    this.held = /* @__PURE__ */ new Set();
    this.move = { forward: 0, back: 0, moveleft: 0, moveright: 0 };
    this.sprinting = false;
    this.circleAt = 0;
    this.proned = false;
    this.aimCarry = [0, 0];
    this.cursor = null;
    this.queue = [];
    this.lastTime = 0;
    this.status = "none";
    this.name = "";
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    const frame = (time) => {
      if (!this.running) return;
      try {
        this.update(time);
      } catch (error) {
        this.status = `error: ${error.message}`;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    addEventListener("blur", () => this.releaseAll());
  }
  findPad() {
    const pads = navigator.getGamepads?.() ?? [];
    return [...pads].find((pad) => pad && pad.connected && pad.mapping === "standard") ?? [...pads].find((pad) => pad && pad.connected) ?? null;
  }
  update(time) {
    if (typeof document !== "undefined" && (document.hidden || !document.hasFocus())) {
      this.releaseAll();
      this.lastTime = time;
      this.status = this.pad ? "waiting" : "none";
      return;
    }
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1e3) : 0;
    this.lastTime = time;
    const pad = this.findPad();
    if (!pad) {
      if (this.pad) this.releaseAll();
      this.pad = null;
      this.status = "none";
      return;
    }
    this.pad = pad;
    this.name = pad.id;
    const engine = this.engine();
    if (!engine) {
      this.status = "waiting";
      return;
    }
    this.status = "active";
    const pressed = pad.buttons.map((b, i) => i === B.l2 || i === B.r2 ? b.value > TRIGGER : b.pressed);
    const edge = (i) => pressed[i] && !this.prev[i];
    const released = (i) => !pressed[i] && this.prev[i];
    const menu = Boolean(engine.Module._KB_UIState?.() & 1);
    if (menu) {
      this.releaseGameplay();
      this.menuInput(engine, pad, pressed, edge, released, dt);
    } else {
      this.cursor = null;
      this.gameplayInput(engine, pad, pressed, edge, released, dt);
    }
    this.prev = pressed;
    this.flush(engine);
  }
  gameplayInput(engine, pad, pressed, edge, released, dt) {
    for (const [button, action] of HOLD) {
      if (edge(button)) this.press(action);
      if (released(button)) this.lift(action);
    }
    for (const [button, slot] of SLOTS) {
      if (edge(button)) this.queue.push(`+actionslot ${slot}`);
      if (released(button)) this.queue.push(`-actionslot ${slot}`);
    }
    if (edge(B.triangle)) this.queue.push("weapnext");
    if (edge(B.options)) this.tapKey(engine, KEY.escape);
    if (edge(B.circle)) {
      this.circleAt = performance.now();
      this.proned = false;
    }
    if (pressed[B.circle] && !this.proned && performance.now() - this.circleAt > PRONE_HOLD_MS) {
      this.queue.push("toggleprone");
      this.proned = true;
    }
    if (released(B.circle) && !this.proned) this.queue.push("togglecrouch");
    const [lx, ly] = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0, STICK_DEADZONE);
    this.setMove("forward", Math.max(0, -ly));
    this.setMove("back", Math.max(0, ly));
    this.setMove("moveleft", Math.max(0, -lx));
    this.setMove("moveright", Math.max(0, lx));
    if (edge(B.l3) && !this.sprinting) {
      this.queue.push("+breath_sprint");
      this.sprinting = true;
    }
    if (this.sprinting && Math.hypot(lx, ly) < 0.3) {
      this.queue.push("-breath_sprint");
      this.sprinting = false;
    }
    const [rx, ry] = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, AIM_DEADZONE);
    const magnitude = Math.hypot(rx, ry);
    if (magnitude > 0) {
      const speed = AIM_SPEEDS[this.aimLevel] * magnitude ** 1.6 / magnitude * (pressed[B.l2] ? 0.5 : 1);
      this.aimCarry[0] += rx * speed * dt;
      this.aimCarry[1] += ry * speed * dt;
      const dx = Math.trunc(this.aimCarry[0]), dy = Math.trunc(this.aimCarry[1]);
      this.aimCarry[0] -= dx;
      this.aimCarry[1] -= dy;
      if (dx || dy) engine.Module._KB_Input(2, dx, dy);
    }
  }
  menuInput(engine, pad, pressed, edge, released, dt) {
    const size = this.canvasSize();
    if (!this.cursor) this.cursor = [size.width / 2, size.height / 2];
    const [lx, ly] = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0, STICK_DEADZONE);
    const [rx, ry] = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, AIM_DEADZONE);
    const vx = lx || rx, vy = ly || ry;
    if (vx || vy) {
      const speed = size.height * 1.1;
      this.cursor[0] = clamp(this.cursor[0] + vx * speed * dt, 0, size.width - 1);
      this.cursor[1] = clamp(this.cursor[1] + vy * speed * dt, 0, size.height - 1);
      engine.Module._KB_Input(4, Math.round(this.cursor[0]), Math.round(this.cursor[1]));
    }
    if (edge(B.cross)) engine.Module._KB_Input(0, KEY.mouse1, 1);
    if (released(B.cross)) engine.Module._KB_Input(0, KEY.mouse1, 0);
    if (edge(B.circle) || edge(B.options)) this.tapKey(engine, KEY.escape);
    for (const [button, key] of [[B.up, KEY.up], [B.down, KEY.down], [B.left, KEY.left], [B.right, KEY.right]]) {
      if (edge(button)) this.tapKey(engine, key);
    }
  }
  press(action) {
    if (!this.held.has(action)) {
      this.held.add(action);
      this.queue.push(`+${action}`);
    }
  }
  lift(action) {
    if (this.held.delete(action)) this.queue.push(`-${action}`);
  }
  tapKey(engine, key) {
    engine.Module._KB_Input(0, key, 1);
    engine.Module._KB_Input(0, key, 0);
  }
  setMove(action, value) {
    const previous = this.move[action];
    const rounded = Math.round(value * 20) / 20;
    if (rounded === previous) return;
    this.move[action] = rounded;
    if (rounded > 0) this.queue.push(`+${action} ${MOVE[action]} 0 ${rounded}`);
    else this.queue.push(`-${action} ${MOVE[action]}`);
  }
  releaseGameplay() {
    for (const action of [...this.held]) this.lift(action);
    for (const action of Object.keys(this.move)) this.setMove(action, 0);
    if (this.sprinting) {
      this.queue.push("-breath_sprint");
      this.sprinting = false;
    }
  }
  releaseAll() {
    this.releaseGameplay();
    this.prev = [];
    const engine = this.engine();
    if (engine) this.flush(engine);
  }
  /** One command string per frame through the mailbox; kept while the previous one is still pending. */
  flush(engine) {
    if (!this.queue.length) return;
    if (this.queue.length > 200) this.queue.splice(0, this.queue.length - 200);
    let count = 0, length = 0;
    while (count < this.queue.length && length + this.queue[count].length + 1 < 900) length += this.queue[count++].length + 1;
    if (engine.command(this.queue.slice(0, count).join(";"))) this.queue.splice(0, count);
  }
};
function radial(x, y, deadzone) {
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadzone) return [0, 0];
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return [x / magnitude * scaled, y / magnitude * scaled];
}
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

// extension/src/controller-settings.js
function mountControllerSettings({ level, onChange }) {
  const body = document.querySelector("#settings .settings-body");
  if (!body || document.getElementById("controller-sensitivity")) return null;
  const row = document.createElement("div");
  row.className = "controller-setting";
  const label = document.createElement("label");
  label.htmlFor = "controller-sensitivity";
  label.append("Sensibilit\xE9 de la manette ");
  const output = document.createElement("output");
  output.id = "controller-sensitivity-value";
  output.setAttribute("for", "controller-sensitivity");
  output.style.marginInlineStart = "8px";
  output.style.flexShrink = "0";
  label.append(output);
  const input = document.createElement("input");
  input.id = "controller-sensitivity";
  input.type = "range";
  input.min = "1";
  input.max = String(AIM_SPEEDS.length);
  input.step = "1";
  input.style.minHeight = "44px";
  input.style.touchAction = "pan-y";
  input.setAttribute("aria-describedby", "controller-sensitivity-hint");
  const hint = document.createElement("p");
  hint.id = "controller-sensitivity-hint";
  hint.textContent = "Stick droit : de lent (1) \xE0 rapide (10).";
  hint.style.cssText = "margin: -6px 0 16px; font-size: .75rem; text-transform: none; letter-spacing: normal;";
  row.append(label, input, hint);
  body.insertBefore(row, body.querySelector('label[for="volume"]'));
  body.style.maxHeight = "calc(100dvh - 100px - env(safe-area-inset-bottom))";
  body.style.overflowY = "auto";
  const sync = (value) => {
    const display = normalizeAimLevel(value) + 1;
    input.value = String(display);
    output.value = `${display}/${AIM_SPEEDS.length}`;
    input.setAttribute("aria-valuetext", `${display} sur ${AIM_SPEEDS.length}`);
  };
  input.addEventListener("input", () => {
    const value = normalizeAimLevel(Number(input.value) - 1);
    sync(value);
    onChange(value);
  });
  sync(level);
  return { sync };
}

// extension/src/main.js
var VERSION = "znoam-20261011-2";
var DEFAULT_RELAY = normalizeRelay(configuredRelay);
var BASE = "/bo1z/";
var MAP_SLUGS = {
  zombie_pentagon: "five",
  zombie_theater: "kino",
  zombie_cod5_factory: "riese",
  zombie_cod5_prototype: "nacht",
  zombie_cod5_asylum: "verruckt",
  zombie_cod5_sumpf: "shinonuma",
  zombie_cosmodrome: "ascension",
  zombie_coast: "cotd",
  zombie_temple: "shangrila",
  zombie_moon: "moon"
};
var MAP_NAMES = {
  five: '"Five"',
  kino: "Kino der Toten",
  riese: "Der Riese",
  nacht: "Nacht der Untoten",
  verruckt: "Verr\xFCckt",
  shinonuma: "Shi No Numa",
  ascension: "Ascension",
  cotd: "Call of the Dead",
  shangrila: "Shangri-La",
  moon: "Moon"
};
var GAME_DVARS = /^(fs_mods|horde_[a-z_]+|kisak_mod_[a-z_]+|r_mod_[a-z_]+|r_dobjLimit|cg_mod_[a-z_]+|zinfo|noperks)$/i;
var KICK_AFTER_MS = 15e3;
var HOST_GONE_MS = 1e4;
if (!window.__bo1zCoop) start();
function start() {
  const params = new URLSearchParams(location.search);
  const requested = params.get("coop");
  const room = normalizeRoomCode(params.get("room") ?? "");
  const relayOverride = params.get("coopRelay");
  const coop = window.__bo1zCoop = {
    version: VERSION,
    mode: room && requested === "host" ? "host" : room && requested === "join" ? "guest" : null,
    room,
    relay: relayBase(relayOverride),
    relayParam: isLoopback(location.href) && normalizeRelay(relayOverride, true) && isLoopback(relayOverride) ? normalizeRelay(relayOverride, true) : "",
    // A host on its own relay puts it in the invite link; the guest switches to it with one click (a relay chosen
    // by someone else is never used silently).
    inviteRelay: normalizeRelay(params.get("relay") ?? ""),
    editRelay: false,
    uncapped: params.get("coopUncapped") !== "0" && !matchMedia("(pointer: coarse)").matches,
    // Touch-only solo must keep its existing loader while iPhone startup is unresolved.
    // An explicit controller choice is retained; desktop still enables it by default.
    controller: readSetting("bo1z-coop-controller", matchMedia("(pointer: coarse)").matches ? "0" : "1") !== "0",
    aimLevel: normalizeAimLevel(readSetting("bo1z-coop-aim", String(DEFAULT_AIM_LEVEL))),
    socket: "idle",
    peer: false,
    peerInfo: null,
    peerState: null,
    stats: null,
    hash: null,
    build: null,
    patched: false,
    error: null,
    notice: null,
    phase: "idle",
    mem: null,
    rings: null,
    zone: null,
    gameArgs: null,
    guestSlot: null,
    copiedAt: 0,
    refreshRate: 60,
    log: []
  };
  const note = (text) => {
    coop.log.push(`${(/* @__PURE__ */ new Date()).toISOString().slice(11, 23)} ${text}`);
    if (coop.log.length > 200) coop.log.shift();
  };
  coop.note = note;
  measureRefreshRate(coop);
  const panel = new Panel({
    host: () => {
      if (coop.relay) go(sessionUrl(location.href, { role: "host", room: createRoomCode(), localRelay: coop.relayParam }));
    },
    join: (text) => {
      const code = normalizeRoomCode(text);
      if (!code) {
        coop.notice = "Code de salon invalide. Collez le lien d\u2019invitation ou le code de 16 lettres.";
        return;
      }
      let invitationRelay = "";
      try {
        invitationRelay = normalizeRelay(new URL(text).searchParams.get("relay") ?? "");
      } catch {
      }
      go(sessionUrl(location.href, { role: "join", room: code, relay: invitationRelay, localRelay: coop.relayParam }));
    },
    copy: () => {
      const link = inviteLink(coop);
      if (!navigator.clipboard?.writeText) {
        coop.notice = link;
        return;
      }
      navigator.clipboard.writeText(link).then(() => {
        coop.copiedAt = Date.now();
      }, () => {
        coop.notice = link;
      });
    },
    leave: () => {
      coop.pump?.postMessage({ type: "close" });
      go(sessionUrl(location.href));
    },
    startNow: () => {
      coop.startAlone = true;
    },
    rejoin: () => location.reload(),
    editRelay: () => {
      coop.editRelay = !coop.editRelay;
    },
    saveRelay: (text) => {
      const url = normalizeRelay(text ?? "");
      if (!url) {
        coop.notice = "Adresse du relais invalide. Utilisez son URL HTTPS.";
        return;
      }
      saveSetting("bo1z-coop-relay", url === DEFAULT_RELAY ? "" : url);
      location.reload();
    },
    defaultRelay: () => {
      saveSetting("bo1z-coop-relay", "");
      location.reload();
    },
    useInviteRelay: () => {
      saveSetting("bo1z-coop-relay", coop.inviteRelay);
      location.reload();
    },
    goToHost: () => {
      teleportToHost(coop, "button");
    },
    controller: () => {
      coop.controller = !coop.controller;
      saveSetting("bo1z-coop-controller", coop.controller ? "1" : "0");
      coop.notice = "Rechargez la page pour appliquer le r\xE9glage de la manette.";
    },
    aimDown: () => setAim(coop, coop.aimLevel - 1),
    aimUp: () => setAim(coop, coop.aimLevel + 1)
  });
  coop.panel = panel;
  panel.mount();
  coop.controllerSettings = mountControllerSettings({ level: coop.aimLevel, onChange: (level) => setAim(coop, level) });
  if (coop.controller) {
    coop.gamepad = new GamepadControl({
      // Only while our player is in a game: the engine runs the commands and the menus own the cursor.
      engine: () => coop.mem && coop.patched && window.five?.screen === "playing" && coop.mem.connectionState() === CONNECTION.active ? { Module: coop.mem.Module, command: (text) => coop.mem.command(text) } : null,
      canvasSize: () => {
        const canvas = document.getElementById("game");
        return { width: canvas?.width || 1280, height: canvas?.height || 720 };
      },
      aimLevel: coop.aimLevel
    });
    coop.gamepad.start();
  }
  const readUsage = () => fetch(`${coop.relay}/usage`).then((r) => r.ok ? r.json() : null).then((usage) => {
    coop.usage = usage && Number.isFinite(usage.fraction) ? usage : null;
  }, () => {
    coop.usage = null;
  });
  if (coop.relay) {
    readUsage();
    setInterval(readUsage, 6e5);
  }
  if (coop.mode && coop.relay && (!coop.inviteRelay || coop.inviteRelay === coop.relay)) {
    coop.phase = coop.mode === "host" ? "hosting" : "joining-room";
    coop.pump = startPump(coop);
    if (coop.mode === "host") installStartWait(coop, panel);
  }
  setInterval(() => tick(coop), 50);
}
async function prepareEngine(url) {
  const coop = window.__bo1zCoop;
  if (coop.mode && (!coop.relay || coop.inviteRelay && coop.inviteRelay !== coop.relay)) {
    throw new Error("Configurez le relais du salon dans le panneau Coop\xE9ration avant de lancer la partie.");
  }
  return engineOptions(coop, url);
}
async function prepareMain(Module, args) {
  const coop = window.__bo1zCoop;
  if (!coop.patched) return;
  if (!coop.mode) {
    coop.mem = new EngineMemory(Module, coop.build);
    return;
  }
  try {
    if (coop.mode === "host") setupHost(coop, Module, args);
    else await setupGuest(coop, Module, args);
  } catch (error) {
    coop.error = error.message;
    coop.phase = "failed";
    coop.mem?.setInboundRing(0);
    coop.pump?.postMessage({ type: "close" });
    throw error;
  }
}
function installStartWait(coop, panel) {
  const block = (event) => {
    if (!coop.gate || event.composedPath?.().includes(panel.host)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  };
  for (const type of ["keydown", "keyup", "mousedown", "mouseup", "click", "pointerdown", "pointerup"]) {
    window.addEventListener(type, block, true);
  }
}
function startPump(coop) {
  const url = URL.createObjectURL(new Blob(['(() => {\n  // shared/protocol.js\n  var PROTOCOL_VERSION = 2;\n  var ROLES = Object.freeze(["host", "guest"]);\n  var RELAY_MESSAGE_TYPES = Object.freeze(["welcome", "peer", "error"]);\n  var MAX_TEXT_BYTES = 4096;\n  var MAX_BINARY_BYTES = 65536;\n  var MAX_PACKET_BYTES = 1264;\n  function relaySocketUrl(relayBase, room, role) {\n    const url = new URL(relayBase);\n    url.protocol = url.protocol === "http:" || url.protocol === "ws:" ? "ws:" : "wss:";\n    url.pathname = `/v1/rooms/${encodeURIComponent(room)}`;\n    url.search = `?role=${role}&v=${PROTOCOL_VERSION}`;\n    return url.toString();\n  }\n  var BATCH_VERSION = 1;\n  var BATCH_KIND_PACKETS = 1;\n  function encodePackets(packets) {\n    let size = 4;\n    for (const packet of packets) size += 2 + packet.byteLength;\n    if (packets.length > 65535 || size > MAX_BINARY_BYTES) throw new RangeError("packet batch too large");\n    const out = new Uint8Array(size);\n    const view = new DataView(out.buffer);\n    out[0] = BATCH_VERSION;\n    out[1] = BATCH_KIND_PACKETS;\n    view.setUint16(2, packets.length, true);\n    let offset = 4;\n    for (const packet of packets) {\n      if (packet.byteLength > MAX_PACKET_BYTES) throw new RangeError("packet too large");\n      view.setUint16(offset, packet.byteLength, true);\n      out.set(packet, offset + 2);\n      offset += 2 + packet.byteLength;\n    }\n    return out;\n  }\n  function decodePackets(data) {\n    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);\n    if (bytes.byteLength < 4 || bytes[0] !== BATCH_VERSION || bytes[1] !== BATCH_KIND_PACKETS) return null;\n    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);\n    const count = view.getUint16(2, true);\n    const packets = [];\n    let offset = 4;\n    for (let i = 0; i < count; i += 1) {\n      if (offset + 2 > bytes.byteLength) return null;\n      const length = view.getUint16(offset, true);\n      offset += 2;\n      if (length > MAX_PACKET_BYTES || offset + length > bytes.byteLength) return null;\n      packets.push(bytes.subarray(offset, offset + length));\n      offset += length;\n    }\n    return offset === bytes.byteLength ? packets : null;\n  }\n  function parseControl(text) {\n    if (typeof text !== "string" || text.length > MAX_TEXT_BYTES) return null;\n    let value;\n    try {\n      value = JSON.parse(text);\n    } catch {\n      return null;\n    }\n    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.t !== "string" || value.t.length > 32) {\n      return null;\n    }\n    return value;\n  }\n\n  // extension/src/rings.js\n  var RingReader = class {\n    constructor(memory, layout, base, { advanceGet = false } = {}) {\n      this.i32 = new Int32Array(memory);\n      this.u8 = new Uint8Array(memory);\n      this.lb = layout.loopback;\n      this.base = base;\n      this.getIndex = base + this.lb.offGet >> 2;\n      this.sendIndex = base + this.lb.offSend >> 2;\n      this.advanceGet = advanceGet;\n      this.cursor = Atomics.load(this.i32, this.sendIndex);\n      this.lost = 0;\n    }\n    /** Skip everything written so far. */\n    skipToEnd() {\n      this.cursor = Atomics.load(this.i32, this.sendIndex);\n      if (this.advanceGet) Atomics.store(this.i32, this.getIndex, this.cursor);\n    }\n    /** Copies out every complete packet since the last poll. */\n    poll(out = []) {\n      const { slots, slotSize, offLen, dataMax } = this.lb;\n      let send = Atomics.load(this.i32, this.sendIndex);\n      if (send - this.cursor > slots - 1) {\n        this.lost += send - (slots - 1) - this.cursor;\n        this.cursor = send - (slots - 1);\n      }\n      while (this.cursor < send) {\n        const slot = this.base + (this.cursor & slots - 1) * slotSize;\n        const length = this.i32[slot + offLen >> 2];\n        const packet = length > 0 && length <= dataMax ? this.u8.slice(slot, slot + length) : null;\n        send = Atomics.load(this.i32, this.sendIndex);\n        if (send - this.cursor > slots - 1) {\n          this.lost += 1;\n        } else if (packet) {\n          out.push(packet);\n        }\n        this.cursor += 1;\n      }\n      if (this.advanceGet) Atomics.store(this.i32, this.getIndex, this.cursor);\n      return out;\n    }\n  };\n  var RingWriter = class {\n    constructor(memory, layout, base, port) {\n      this.i32 = new Int32Array(memory);\n      this.u8 = new Uint8Array(memory);\n      this.lb = layout.loopback;\n      this.base = base;\n      this.port = port;\n      this.getIndex = base + this.lb.offGet >> 2;\n      this.sendIndex = base + this.lb.offSend >> 2;\n    }\n    /** Room for one more packet without overwriting one the engine has not read yet. */\n    hasRoom() {\n      const send = Atomics.load(this.i32, this.sendIndex);\n      const get = Atomics.load(this.i32, this.getIndex);\n      return send - get < this.lb.slots - 1;\n    }\n    /** Returns false (and writes nothing) when the engine has not caught up. */\n    push(packet) {\n      const { slots, slotSize, offLen, offPort, dataMax } = this.lb;\n      if (packet.byteLength === 0 || packet.byteLength > dataMax) return true;\n      if (!this.hasRoom()) return false;\n      const send = Atomics.load(this.i32, this.sendIndex);\n      const slot = this.base + (send & slots - 1) * slotSize;\n      this.u8.set(packet, slot);\n      Atomics.store(this.i32, slot + offLen >> 2, packet.byteLength);\n      Atomics.store(this.i32, slot + offPort >> 2, this.port);\n      Atomics.add(this.i32, this.sendIndex, 1);\n      return true;\n    }\n  };\n  function outOfBandCommand(packet) {\n    if (packet.byteLength < 5 || packet[0] !== 255 || packet[1] !== 255 || packet[2] !== 255 || packet[3] !== 255) return null;\n    let end = 4;\n    while (end < packet.byteLength && end < 64 && packet[end] !== 0 && packet[end] !== 32 && packet[end] !== 10) end += 1;\n    return String.fromCharCode(...packet.subarray(4, end));\n  }\n\n  // extension/src/pump-worker.js\n  var POLL_MS = 1;\n  var FLUSH_MS = 4;\n  var INBOX_LIMIT = 512;\n  var PING_MS = 2e3;\n  var state = {\n    role: null,\n    url: null,\n    socket: null,\n    closed: false,\n    retries: 0,\n    reader: null,\n    writer: null,\n    reading: false,\n    injecting: false,\n    dropUntilConnect: false,\n    dropOutOfBand: [],\n    inbox: [],\n    outbox: [],\n    outboxBytes: 0,\n    lastFlush: 0,\n    looping: false,\n    stats: { packetsOut: 0, packetsIn: 0, bytesOut: 0, bytesIn: 0, framesOut: 0, framesIn: 0, dropped: 0, lost: 0, rtt: null }\n  };\n  var post = (message) => self.postMessage(message);\n  self.onmessage = (event) => {\n    const message = event.data;\n    switch (message.type) {\n      case "connect":\n        state.role = message.role;\n        state.url = relaySocketUrl(message.relay, message.room, message.role);\n        open();\n        startLoop();\n        return;\n      case "attach":\n        state.reader = new RingReader(message.memory, message.layout, message.readBase, { advanceGet: message.advanceGet });\n        state.writer = new RingWriter(message.memory, message.layout, message.writeBase, message.writePort);\n        state.reading = Boolean(message.reading);\n        state.injecting = Boolean(message.injecting);\n        state.dropOutOfBand = message.dropOutOfBand ?? [];\n        return;\n      case "read":\n        state.reader.skipToEnd();\n        state.dropUntilConnect = Boolean(message.dropUntilConnect);\n        state.reading = true;\n        return;\n      case "inject":\n        state.injecting = Boolean(message.on);\n        if (message.clearInbox) state.inbox.length = 0;\n        return;\n      case "send":\n        sendText(message.message);\n        return;\n      case "close":\n        state.closed = true;\n        try {\n          state.socket?.close(1e3, "bye");\n        } catch {\n        }\n        return;\n    }\n  };\n  function open() {\n    if (state.closed) return;\n    let socket;\n    try {\n      socket = new WebSocket(state.url);\n    } catch (error) {\n      post({ type: "socket", state: "error", reason: String(error?.message ?? error) });\n      return reconnect();\n    }\n    socket.binaryType = "arraybuffer";\n    state.socket = socket;\n    post({ type: "socket", state: "connecting" });\n    socket.onopen = () => {\n      state.retries = 0;\n      post({ type: "socket", state: "open" });\n    };\n    socket.onmessage = (event) => {\n      if (typeof event.data === "string") {\n        const message = parseControl(event.data);\n        if (message) control(message);\n        return;\n      }\n      const packets = decodePackets(event.data);\n      if (!packets) return;\n      state.stats.framesIn += 1;\n      for (const packet of packets) {\n        state.stats.packetsIn += 1;\n        state.stats.bytesIn += packet.byteLength;\n        const command = outOfBandCommand(packet);\n        if (command && state.dropOutOfBand.includes(command)) continue;\n        state.inbox.push(packet);\n      }\n      if (state.inbox.length > INBOX_LIMIT) {\n        state.stats.dropped += state.inbox.length - INBOX_LIMIT;\n        state.inbox.splice(0, state.inbox.length - INBOX_LIMIT);\n      }\n      pump();\n    };\n    socket.onclose = (event) => {\n      if (state.socket === socket) state.socket = null;\n      post({ type: "socket", state: "closed", code: event.code, reason: event.reason });\n      if (event.code === 4001) {\n        state.closed = true;\n        return;\n      }\n      reconnect();\n    };\n    socket.onerror = () => {\n    };\n  }\n  function reconnect() {\n    if (state.closed) return;\n    const delay = Math.min(5e3, 250 * 2 ** state.retries);\n    state.retries += 1;\n    setTimeout(open, delay);\n  }\n  function control(message) {\n    if (message.t === "ping") {\n      sendText({ t: "pong", ts: message.ts });\n      return;\n    }\n    if (message.t === "pong") {\n      if (typeof message.ts === "number") state.stats.rtt = Math.max(0, performance.now() - message.ts);\n      return;\n    }\n    post({ type: "control", message });\n  }\n  function sendText(message) {\n    const socket = state.socket;\n    if (!socket || socket.readyState !== WebSocket.OPEN) return false;\n    socket.send(JSON.stringify(message));\n    return true;\n  }\n  function flush(now) {\n    if (!state.outbox.length) return;\n    const socket = state.socket;\n    if (!socket || socket.readyState !== WebSocket.OPEN) {\n      state.stats.dropped += state.outbox.length;\n    } else {\n      let batch = [], size = 4;\n      const send = () => {\n        if (!batch.length) return;\n        socket.send(encodePackets(batch));\n        state.stats.framesOut += 1;\n        batch = [];\n        size = 4;\n      };\n      for (const packet of state.outbox) {\n        if (size + 2 + packet.byteLength > MAX_BINARY_BYTES) send();\n        batch.push(packet);\n        size += 2 + packet.byteLength;\n        state.stats.packetsOut += 1;\n        state.stats.bytesOut += packet.byteLength;\n      }\n      send();\n    }\n    state.outbox.length = 0;\n    state.outboxBytes = 0;\n    state.lastFlush = now;\n  }\n  function pump() {\n    const now = performance.now();\n    if (state.reader && state.reading) {\n      let packets = state.reader.poll([]);\n      state.stats.lost = state.reader.lost;\n      if (state.dropUntilConnect && packets.length) {\n        const first = packets.findIndex((packet) => outOfBandCommand(packet) === "connect");\n        packets = first < 0 ? [] : packets.slice(first);\n        if (first >= 0) state.dropUntilConnect = false;\n      }\n      for (const packet of packets) {\n        state.outbox.push(packet);\n        state.outboxBytes += packet.byteLength;\n      }\n    }\n    if (state.outbox.length && now - state.lastFlush >= FLUSH_MS) flush(now);\n    if (state.writer && state.injecting) {\n      while (state.inbox.length && state.writer.push(state.inbox[0])) state.inbox.shift();\n    }\n  }\n  async function startLoop() {\n    if (state.looping) return;\n    state.looping = true;\n    const tick = new Int32Array(new SharedArrayBuffer(4));\n    let lastPing = 0, lastStats = 0;\n    while (!state.closed) {\n      pump();\n      const now = performance.now();\n      if (now - lastPing >= PING_MS) {\n        lastPing = now;\n        sendText({ t: "ping", ts: now });\n      }\n      if (now - lastStats >= 1e3) {\n        lastStats = now;\n        post({ type: "stats", stats: { ...state.stats, inbox: state.inbox.length } });\n      }\n      const wait = Atomics.waitAsync ? Atomics.waitAsync(tick, 0, 0, POLL_MS) : null;\n      if (wait?.async) await wait.value;\n      else await new Promise((resolve) => setTimeout(resolve, POLL_MS));\n    }\n  }\n})();\n'], { type: "text/javascript" }));
  const worker = new Worker(url, { name: "bo1z-coop-pump" });
  URL.revokeObjectURL(url);
  addEventListener("pagehide", () => worker.terminate(), { once: true });
  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === "socket") {
      coop.socket = message.state;
      if (message.state !== "open") coop.peer = false;
      if (message.state === "closed" && message.code === 4001) coop.error = "Ce salon a \xE9t\xE9 ouvert dans un autre onglet ou une autre fen\xEAtre.";
      coop.note(`relay ${message.state}${message.code ? ` ${message.code}` : ""}`);
    } else if (message.type === "control") {
      onControl(coop, message.message);
    } else if (message.type === "stats") {
      coop.stats = message.stats;
    }
  };
  worker.onerror = (event) => {
    coop.error = `Erreur de coop\xE9ration : ${event.message}`;
  };
  worker.postMessage({ type: "connect", relay: coop.relay, room: coop.room, role: coop.mode });
  return worker;
}
function send(coop, message) {
  coop.pump?.postMessage({ type: "send", message });
}
function onControl(coop, message) {
  switch (message.t) {
    case "welcome":
      coop.peer = Boolean(message.peer);
      coop.peerSeenAt = Date.now();
      if (coop.peer) greet(coop);
      return;
    case "peer":
      coop.peer = Boolean(message.present);
      if (coop.peer) {
        coop.peerSeenAt = Date.now();
        greet(coop);
      } else {
        coop.peerLeftAt = Date.now();
        coop.remotePause = false;
      }
      coop.note(`other player ${coop.peer ? "joined the room" : "left the room"}`);
      return;
    case "error":
      coop.note(`relay error ${message.code}`);
      return;
    case "info":
      if (coop.mode === "guest") onHostInfo(coop, message);
      return;
    case "state":
      coop.peerState = message;
      return;
    case "pause":
      coop.remotePause = Boolean(message.on);
      return;
    case "pos":
      if (Array.isArray(message.o) && message.o.length === 3 && message.o.every(Number.isFinite)) {
        coop.hostPos = { origin: message.o, at: Date.now() };
      }
      return;
  }
}
function greet(coop) {
  if (coop.mode === "host") {
    sendInfo(coop);
    coop.lastStateKey = null;
  } else send(coop, { t: "state", phase: coop.phase, v: VERSION });
  send(coop, { t: "pause", on: Boolean(coop.menuOpen) });
}
function sendInfo(coop) {
  const zone = coop.zone ?? currentZone();
  send(coop, {
    t: "info",
    v: VERSION,
    hash: coop.hash,
    zone,
    slug: MAP_SLUGS[zone] ?? null,
    horde: currentHorde(),
    gameArgs: coop.gameArgs
  });
}
function onHostInfo(coop, info) {
  coop.peerInfo = info;
  if (!info.slug || coop.mem) return;
  if (currentSlug() === info.slug && currentHorde() === Boolean(info.horde)) return;
  coop.phase = "following";
  if (!Object.values(MAP_SLUGS).includes(info.slug)) return;
  go(sessionUrl(location.href, { pathname: `${BASE}${info.slug}`, role: "join", room: coop.room, horde: Boolean(info.horde), localRelay: coop.relayParam }));
}
function setupHost(coop, Module, args) {
  const mem = new EngineMemory(Module, coop.build);
  if (!mem.mailboxesClear()) throw new Error("\xC9tat du moteur inattendu : coop\xE9ration d\xE9sactiv\xE9e.");
  const rings = mem.allocateRemoteRings();
  mem.setInboundRing(rings.inPort);
  coop.mem = mem;
  coop.rings = rings;
  if (coop.uncapped) {
    const capIndex = args.lastIndexOf("com_maxfps");
    const cap = capIndex < 0 ? 0 : Number(args[capIndex + 1]);
    const fps = cap > 0 ? Math.min(cap, coop.refreshRate) : coop.refreshRate;
    insertBeforeDevmap(args, ["+set", "kisak_web_uncapped", "1", "+set", "com_maxfps", String(fps)]);
  }
  coop.zone = devmapZone(args);
  coop.gameArgs = gameDvars(args);
  coop.pump.postMessage({
    type: "attach",
    memory: mem.memory,
    layout: coop.build,
    readBase: rings.out.base,
    writeBase: rings.in.base,
    writePort: rings.port,
    advanceGet: true,
    reading: true,
    injecting: true,
    dropOutOfBand: ["rcon"]
  });
  coop.note(`host rings: out ${rings.port} in ${rings.inPort}`);
  if (coop.peer) sendInfo(coop);
}
async function setupGuest(coop, Module, args) {
  const info = await until(() => coop.peerInfo?.zone ? coop.peerInfo : null, 3e4);
  if (!info) throw new Error("L\u2019h\xF4te ne r\xE9pond pas. V\xE9rifiez que sa partie est ouverte, puis rechargez.");
  if (info.hash && !compatibleEngines(info.hash, coop.hash)) throw new Error("Les deux joueurs ont des versions incompatibles du jeu. Rechargez les deux pages.");
  const zone = devmapZone(args);
  if (zone !== info.zone) throw new Error(`L\u2019h\xF4te joue sur ${MAP_NAMES[info.slug] ?? info.zone}. Rechargez cette page.`);
  if (Array.isArray(info.gameArgs)) applyGameDvars(args, info.gameArgs);
  const mem = new EngineMemory(Module, coop.build);
  if (!mem.mailboxesClear()) throw new Error("\xC9tat du moteur inattendu : coop\xE9ration d\xE9sactiv\xE9e.");
  coop.mem = mem;
  coop.zone = zone;
  coop.pump.postMessage({
    type: "attach",
    memory: mem.memory,
    layout: coop.build,
    readBase: ringOffsets(coop.build, 1).base,
    // our client -> server ring: forwarded to the host once connected
    writeBase: ringOffsets(coop.build, 0).base,
    // server -> our client ring: the host's packets go here
    writePort: 0,
    advanceGet: true,
    reading: false,
    injecting: false
  });
  coop.phase = "loading";
}
function tick(coop) {
  try {
    if (coop.mode === "host") hostTick(coop);
    if (coop.mode === "guest") guestTick(coop);
  } catch (error) {
    coop.error = error.message;
    coop.note(`tick failed: ${error.stack ?? error}`);
  }
  coop.panel.render(view(coop));
}
function hostTick(coop) {
  const screen = window.five?.screen;
  const mem = coop.mem;
  const ready = Boolean(mem) && (screen === "ready" || screen === "playing");
  const slot = mem && coop.rings ? mem.serverClients().find((c) => c.loopback && c.port === coop.rings.port) ?? null : null;
  coop.guestSlot = slot;
  const state = { t: "state", ready, slot: slot?.state ?? 0, screen };
  const key = JSON.stringify(state);
  if (coop.peer && key !== coop.lastStateKey) {
    coop.lastStateKey = key;
    send(coop, state);
  }
  if (!coop.peer) coop.lastStateKey = null;
  coop.gate = screen === "ready" && coop.peer && !coop.startAlone && !(slot && slot.state === CLIENT_STATE.active);
  const guestJoining = ["waiting-host", "freezing", "connect", "challenging", "joining"].includes(coop.peerState?.phase);
  if (mem && coop.peer && guestJoining && screen === "ready" && !coop.introReleased && mem.int(coop.build.browser.introState) === 1) {
    coop.introReleased = true;
    mem.Module._KB_Input?.(7, 1, 0);
    coop.note("released the start hold so player 2 can join");
  }
  const guestActive = slot?.state === CLIENT_STATE.active;
  if (mem && coop.peer && !guestActive) {
    if (mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 0);
    if (mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 0);
  }
  const menuOpen = Boolean(mem?.menuOpen()) && screen === "playing";
  if (menuOpen !== coop.menuOpen) {
    coop.menuOpen = menuOpen;
    if (coop.peer) send(coop, { t: "pause", on: menuOpen });
  }
  const guestLinked = coop.peer && coop.peerState?.phase === "connected";
  if (mem) pauseHost(coop, guestActive && guestLinked && (menuOpen || coop.remotePause), menuOpen);
  const view2 = latestView();
  if (coop.peer && guestActive && view2 && view2.ms !== coop.sentViewMs) {
    coop.sentViewMs = view2.ms;
    send(coop, { t: "pos", o: view2.origin, a: view2.angles });
  }
  const guestPhase = coop.peerState?.phase;
  const stale = slot && slot.state >= CLIENT_STATE.connected && (coop.peer && guestPhase && !["challenging", "joining", "connected"].includes(guestPhase) || !coop.peer && coop.peerLeftAt && Date.now() - coop.peerLeftAt > KICK_AFTER_MS);
  if (stale && Date.now() - (coop.lastKickAt ?? 0) > 5e3 && mem.command(`clientkick ${slot.slot}`)) {
    coop.lastKickAt = Date.now();
    coop.note(`removed player 2 (slot ${slot.slot}, ${coop.peer ? guestPhase : "left"})`);
  }
}
function pauseHost(coop, paused, menuOpen) {
  const mem = coop.mem;
  if (paused) {
    if (!coop.pausedApplied) coop.note(`paused${menuOpen ? "" : " by player 2"}`);
    mem.setFreeze(true);
    if (!mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 1);
    if (!mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 1);
    mem.clearLastPacketTime();
  } else if (coop.pausedApplied) {
    mem.setFreeze(false);
    mem.setDvarInt("svPaused", 0);
    if (!menuOpen) mem.setDvarInt("clPaused", 0);
    mem.clearLastPacketTime();
    coop.note("resumed");
  }
  coop.pausedApplied = paused;
}
function latestView() {
  const view2 = window.five?.views?.at(-1);
  return view2 && Array.isArray(view2.origin) && view2.origin.length === 3 && view2.origin.every(Number.isFinite) ? view2 : null;
}
var distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
var SPAWN_JUMP = 400;
var FAR_FROM_HOST = 300;
var HOST_POS_MAX_AGE_MS = 6e3;
var SPAWN_CHECK_MS = 2e3;
var SPAWN_RETRIES = 2;
function followHost(coop) {
  const view2 = latestView();
  if (view2 && view2.ms !== coop.lastViewMs) {
    const previous = coop.lastViewOrigin;
    coop.lastViewMs = view2.ms;
    coop.lastViewOrigin = view2.origin;
    if (!previous || distance(previous, view2.origin) > SPAWN_JUMP) spawnPending(coop);
  }
  const pending = coop.spawn;
  if (!pending || coop.pausedApplied) return;
  const host = coop.hostPos, mine = coop.lastViewOrigin;
  if (!host || Date.now() - host.at > HOST_POS_MAX_AGE_MS || !mine) return;
  if (pending.sentAt && Date.now() - pending.sentAt < SPAWN_CHECK_MS) return;
  if (distance(host.origin, mine) <= FAR_FROM_HOST) {
    coop.spawn = null;
    return;
  }
  if (pending.tries >= SPAWN_RETRIES) {
    coop.spawn = null;
    coop.note("could not move next to the host");
    return;
  }
  if (teleportToHost(coop, pending.tries ? "spawn, retry" : "spawn")) {
    pending.sentAt = Date.now();
    pending.tries += 1;
  }
}
function spawnPending(coop) {
  if (!coop.spawn) coop.spawn = { tries: 0, sentAt: 0 };
}
var EYE_HEIGHT = 62;
function teleportToHost(coop, why) {
  const mem = coop.mem, host = coop.hostPos;
  if (!mem || coop.phase !== "connected" || !host) return false;
  if (Date.now() - (coop.teleportedAt ?? 0) < 1e3) return false;
  const target = [host.origin[0], host.origin[1], host.origin[2] + EYE_HEIGHT];
  const text = `setviewpos ${target.map((v) => v.toFixed(1)).join(" ")}`;
  if (!mem.command(text)) return false;
  coop.teleportedAt = Date.now();
  coop.note(`moved to the host (${why})`);
  return true;
}
function pauseGuest(coop, screen) {
  const mem = coop.mem;
  const menuOpen = mem.menuOpen() && screen === "playing";
  if (menuOpen !== coop.menuOpen) {
    coop.menuOpen = menuOpen;
    if (coop.peer) send(coop, { t: "pause", on: menuOpen });
  }
  const paused = menuOpen || coop.peer && Boolean(coop.remotePause);
  if (paused) {
    if (!coop.pausedApplied) coop.note(`paused${menuOpen ? "" : " by the host"}`);
    if (!mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 1);
    if (!mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 1);
    mem.clearLastPacketTime();
  } else {
    if (coop.pausedApplied) {
      mem.clearLastPacketTime();
      coop.note("resumed");
    }
    if (mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 0);
    if (mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 0);
  }
  coop.pausedApplied = paused;
}
var GUEST_JOINING = ["challenging", "joining"];
function guestTick(coop) {
  const screen = window.five?.screen;
  if (screen === "error" && !["ended", "failed"].includes(coop.phase)) {
    coop.phase = "ended";
    coop.note("engine stopped");
  }
  if (coop.mem && GUEST_JOINING.includes(coop.phase)) {
    if (coop.mem.dvarInt("clPaused")) coop.mem.setDvarInt("clPaused", 0);
    if (coop.mem.dvarInt("svPaused")) coop.mem.setDvarInt("svPaused", 0);
  }
  if (coop.peer && coop.phase !== coop.sentPhase) {
    coop.sentPhase = coop.phase;
    send(coop, { t: "state", phase: coop.phase, v: VERSION });
  }
  if (!coop.peer) coop.sentPhase = null;
  const mem = coop.mem;
  const conn = mem?.connectionState();
  const hostReady = coop.peer && coop.peerState?.ready;
  switch (coop.phase) {
    case "loading":
      if (screen === "ready" || screen === "playing") coop.phase = "waiting-host";
      break;
    case "waiting-host":
      if (hostReady) {
        mem.setFreeze(true);
        coop.freezeAt = Date.now();
        coop.phase = "freezing";
        coop.note("freezing local server");
      }
      break;
    case "freezing":
      if (!mem.serverDrainsPackets() || Date.now() - coop.freezeAt > 5e3) {
        if (mem.serverDrainsPackets()) coop.note("local server still drains packets after 5 s; continuing");
        mem.setDvarInt("svPaused", 0);
        coop.pump.postMessage({ type: "read", dropUntilConnect: true });
        coop.pump.postMessage({ type: "inject", on: false, clearInbox: true });
        coop.phase = "connect";
      }
      break;
    case "connect":
      if (!coop.introReleased && mem.int(coop.build.browser.introState) === 1) {
        coop.introReleased = true;
        mem.Module._KB_Input?.(7, 1, 0);
      }
      coop.connectWaitAt ??= Date.now();
      if ((coop.peerState?.slot ?? 0) >= CLIENT_STATE.connected && Date.now() - coop.connectWaitAt < 2e4) break;
      if (mem.command("connect LOCALHOST")) {
        coop.joinedLate = coop.peerState?.screen === "playing";
        coop.connectAt = Date.now();
        coop.phase = "challenging";
        coop.note("connect sent");
      }
      break;
    case "challenging":
      if (conn >= CONNECTION.connecting && conn <= CONNECTION.challenging && mem.setServerAddressPort(0) && mem.serverAddressPort() === 0) {
        coop.pump.postMessage({ type: "inject", on: true });
        coop.phase = "joining";
        coop.note("challenging; injecting host packets");
      } else if (Date.now() - coop.connectAt > 15e3) {
        coop.error = "Connexion \xE0 l\u2019h\xF4te impossible. Rechargez les deux pages.";
        coop.phase = "failed";
      }
      break;
    case "joining":
      if (mem.serverAddressPort() !== 0) mem.setServerAddressPort(0);
      if (conn === CONNECTION.active) {
        coop.phase = "connected";
        coop.lastViewOrigin = null;
        spawnPending(coop);
        coop.note("connected to host");
      } else if (Date.now() - coop.connectAt > 9e4) {
        coop.error = "La connexion \xE0 la partie a \xE9chou\xE9. Rechargez les deux pages et r\xE9essayez.";
        coop.phase = "failed";
      }
      break;
    case "connected":
      if (conn < CONNECTION.challenging) {
        coop.phase = "ended";
        coop.note("disconnected");
      } else if (!coop.peer && coop.peerLeftAt && Date.now() - coop.peerLeftAt > HOST_GONE_MS) {
        coop.phase = "ended";
        coop.notice = "L\u2019h\xF4te a quitt\xE9 la partie.";
        mem.command("disconnect");
      } else {
        pauseGuest(coop, screen);
        followHost(coop);
      }
      break;
    default:
  }
}
function view(coop) {
  const blocks = [];
  const screen = window.five?.screen;
  const playing = screen === "playing" && !coop.mem?.menuOpen();
  if (coop.error) blocks.push({ kind: "text", cls: "error", text: coop.error });
  if (coop.notice) blocks.push({ kind: "text", cls: "muted small", text: coop.notice });
  let tone = coop.error ? "bad" : "", pill = "";
  const mismatch = coop.inviteRelay && coop.inviteRelay !== coop.relay;
  if (mismatch) {
    blocks.push({ kind: "text", text: `Cette invitation utilise le relais ${new URL(coop.inviteRelay).hostname}.` });
    blocks.push({ kind: "buttons", buttons: [{ act: "useInviteRelay", label: "Utiliser ce relais", primary: true }] });
  }
  if (!coop.mode) {
    blocks.push({ kind: "text", cls: "muted", text: "Joue \xE0 deux : cr\xE9e un salon sur cette carte, puis envoie l\u2019invitation \xE0 ton ami." });
    blocks.push({ kind: "buttons", buttons: [{ act: "host", label: "Cr\xE9er un salon", primary: true, disabled: !coop.relay }] });
    blocks.push({ kind: "input", field: "join", placeholder: "Code ou lien d\u2019invitation", act: "join", label: "Rejoindre", title: "Invitation \xE0 une partie" });
    blocks.push(...relayBlocks(coop));
  } else if (!coop.relay || mismatch) {
    blocks.push({ kind: "text", text: "Le salon attend la configuration du relais." });
    blocks.push(...relayBlocks(coop));
  } else {
    const relayState = { open: "connect\xE9", connecting: "connexion\u2026", closed: "reconnexion\u2026", idle: "d\xE9marrage\u2026" };
    const rtt = coop.stats?.rtt != null ? `${Math.round(coop.stats.rtt)} ms` : "\u2014";
    const network = [["Relais", relayState[coop.socket] ?? coop.socket], ["Latence", rtt]];
    if (coop.mode === "host") {
      const active = coop.guestSlot?.state === CLIENT_STATE.active && coop.peer;
      const gone = ["ended", "failed"].includes(coop.peerState?.phase);
      const player = active ? "dans la partie" : !coop.peer ? "en attente" : gone ? "d\xE9connect\xE9, peut revenir" : "chargement / connexion";
      tone = coop.error ? "bad" : active ? "ok" : "wait";
      blocks.push({ kind: "text", text: "Tu h\xE9berges la partie. Envoie cette invitation au deuxi\xE8me joueur." });
      blocks.push({ kind: "code", text: coop.room });
      blocks.push({ kind: "buttons", buttons: [{ act: "copy", label: Date.now() - coop.copiedAt < 2e3 ? "Lien copi\xE9" : "Copier l\u2019invitation", primary: true }] });
      blocks.push({ kind: "lines", lines: [["Joueur 2", player], ...network] });
      if (coop.gate) {
        blocks.push({ kind: "text", text: "Le d\xE9marrage attend le deuxi\xE8me joueur pour commencer ensemble." });
        blocks.push({ kind: "buttons", buttons: [{ act: "startNow", label: "D\xE9marrer sans attendre" }] });
      } else if (!active) {
        blocks.push({ kind: "text", cls: "small muted", text: "Un joueur qui arrive en cours de manche attend la suivante pour appara\xEEtre." });
      }
      if (coop.pausedApplied) blocks.push({ kind: "text", text: coop.menuOpen ? "Pause pour les deux joueurs." : "Le joueur 2 a mis la partie en pause." });
      pill = coop.pausedApplied ? "Coop\xE9ration \xB7 pause" : `Joueur 2 : ${active ? "en jeu" : "en attente"} \xB7 ${rtt}`;
    } else {
      const steps = {
        "joining-room": "En attente de l\u2019h\xF4te\u2026",
        following: "Ouverture de la carte de l\u2019h\xF4te\u2026",
        loading: "Chargement de la carte\u2026",
        "waiting-host": "En attente du chargement de l\u2019h\xF4te\u2026",
        freezing: "Connexion\u2026",
        connect: "Connexion\u2026",
        challenging: "Connexion\u2026",
        joining: "Entr\xE9e dans la partie\u2026",
        connected: "Tu es dans la partie de l\u2019h\xF4te.",
        ended: "D\xE9connect\xE9. Tu peux rejoindre \xE0 nouveau.",
        failed: "Connexion impossible. R\xE9essaie."
      };
      tone = coop.error ? "bad" : coop.phase === "connected" ? "ok" : "wait";
      blocks.push({ kind: "text", text: steps[coop.phase] ?? "Connexion\u2026" });
      if (screen === "landing") blocks.push({ kind: "text", text: "Appuie sur Jouer pour charger la carte." });
      blocks.push({ kind: "lines", lines: [["Salon", coop.room], ["H\xF4te", coop.peer ? "pr\xE9sent" : "absent"], ...network] });
      if (coop.joinedLate) blocks.push({ kind: "text", cls: "small muted", text: "Partie d\xE9j\xE0 commenc\xE9e : apparition \xE0 la prochaine manche." });
      if (coop.phase === "connected" && screen === "ready") blocks.push({ kind: "text", text: "Appuie sur le jeu pour commencer." });
      if (coop.pausedApplied) blocks.push({ kind: "text", text: coop.menuOpen ? "Pause pour les deux joueurs." : "L\u2019h\xF4te a mis la partie en pause." });
      if (coop.phase === "connected" && coop.hostPos) blocks.push({ kind: "buttons", buttons: [{ act: "goToHost", label: "Rejoindre le joueur 1" }] });
      if (["ended", "failed"].includes(coop.phase)) blocks.push({ kind: "buttons", buttons: [{ act: "rejoin", label: "Se reconnecter", primary: true }] });
      pill = coop.phase === "connected" ? `Coop\xE9ration \xB7 ${coop.pausedApplied ? "pause" : rtt}` : "Coop\xE9ration \xB7 connexion";
    }
    if (coop.stats?.lost) blocks.push({ kind: "text", cls: "muted small", text: `${coop.stats.lost} paquets perdus` });
  }
  blocks.push(...controllerBlocks(coop));
  if (coop.mode) blocks.push({ kind: "buttons", buttons: [{ act: "leave", label: "Revenir en solo" }] });
  blocks.push({ kind: "text", cls: "muted small", text: "Port : MisaDev4 / vel.gg \xB7 Manettes et coop\xE9ration : invictus841 \xB7 Adaptation : Znoam" });
  if (coop.gamepad?.status === "active") pill += `${pill ? " \xB7 " : ""}Manette`;
  return { tone, blocks, compact: playing && !coop.error && !coop.notice, pill };
}
function controllerBlocks(coop) {
  const pad = coop.gamepad;
  const name = pad?.name ? pad.name.replace(/\s*\(.*$/, "").slice(0, 32) : "";
  const status = !coop.controller ? "d\xE9sactiv\xE9e" : !coop.patched && coop.hash ? "indisponible pour ce moteur" : !pad || pad.status === "none" ? "appuie sur un bouton de ta manette" : pad.status === "active" ? `${name} \xB7 vis\xE9e ${coop.aimLevel + 1}/${AIM_SPEEDS.length}` : `${name} \xB7 pr\xEAte apr\xE8s le d\xE9marrage du jeu`;
  const buttons = coop.controller && pad?.status !== "none" ? [{ act: "aimDown", label: "Vis\xE9e \u2212" }, { act: "aimUp", label: "Vis\xE9e +" }, { act: "controller", label: "D\xE9sactiver" }] : [{ act: "controller", label: coop.controller ? "D\xE9sactiver la manette" : "Activer la manette" }];
  return [
    { kind: "lines", lines: [["Manette", status]] },
    { kind: "buttons", buttons },
    { kind: "text", cls: "muted small", text: "PS4, PS5 ou Xbox. Appuie d\u2019abord sur Jouer \xE0 l\u2019\xE9cran pour activer le son. Carr\xE9/X : recharger ; maintenir pour interagir." }
  ];
}
function relayBlocks(coop) {
  const blocks = [{ kind: "text", cls: "muted small", text: coop.relay ? `Relais : ${new URL(coop.relay).hostname}` : "Coop\xE9ration indisponible tant que le relais du site n\u2019est pas activ\xE9. Les manettes fonctionnent en solo." }];
  if (coop.editRelay) {
    blocks.push({ kind: "input", field: "relay", title: "Adresse du relais", placeholder: "https://votre-relais.workers.dev", act: "saveRelay", label: "Enregistrer", value: coop.relay });
    blocks.push({ kind: "buttons", buttons: [{ act: "defaultRelay", label: "R\xE9glage du site" }, { act: "editRelay", label: "Annuler" }] });
  } else blocks.push({ kind: "buttons", buttons: [{ act: "editRelay", label: "Configurer le relais" }] });
  return blocks;
}
function setAim(coop, level) {
  coop.aimLevel = normalizeAimLevel(level);
  if (coop.gamepad) coop.gamepad.aimLevel = coop.aimLevel;
  coop.controllerSettings?.sync(coop.aimLevel);
  saveSetting("bo1z-coop-aim", String(coop.aimLevel));
}
function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}
function go(url) {
  location.assign(url);
}
function inviteLink(coop) {
  return sessionUrl(`${location.origin}${location.pathname}`, {
    role: "join",
    room: coop.room,
    relay: coop.relayParam ? "" : coop.relay,
    localRelay: coop.relayParam,
    horde: currentHorde()
  });
}
function relayBase(override) {
  if (isLoopback(location.href) && isLoopback(override)) {
    const local = normalizeRelay(override, true);
    if (local) return local;
  }
  return normalizeRelay(readSetting("bo1z-coop-relay", "")) || DEFAULT_RELAY;
}
function currentZone() {
  const zone = document.documentElement?.dataset.map;
  if (zone) return zone;
  const slug = currentSlug();
  return Object.keys(MAP_SLUGS).find((z) => MAP_SLUGS[z] === slug) ?? null;
}
function currentSlug() {
  const zone = document.documentElement?.dataset.map;
  if (zone && MAP_SLUGS[zone]) return MAP_SLUGS[zone];
  const match = location.pathname.match(/^\/(?:bo1z\/)?([a-z]+)\/?$/);
  return match && Object.values(MAP_SLUGS).includes(match[1]) ? match[1] : null;
}
function currentHorde() {
  return document.documentElement?.dataset.mode === "horde" || new URLSearchParams(location.search).get("horde") === "1";
}
function devmapZone(args) {
  const i = args.indexOf("+devmap");
  return i >= 0 ? args[i + 1] : null;
}
function insertBeforeDevmap(args, extra) {
  const i = args.indexOf("+devmap");
  args.splice(i < 0 ? args.length : i, 0, ...extra);
}
function gameDvars(args) {
  const out = [];
  for (let i = 0; i + 2 < args.length; i += 1) if (args[i] === "+set" && GAME_DVARS.test(args[i + 1])) out.push([args[i + 1], args[i + 2]]);
  return out;
}
function applyGameDvars(args, dvars) {
  for (let i = args.length - 3; i >= 0; i -= 1) if (args[i] === "+set" && GAME_DVARS.test(args[i + 1])) args.splice(i, 3);
  const safe = dvars.filter(([k, v]) => typeof k === "string" && GAME_DVARS.test(k) && typeof v === "string" && /^[\w .-]{0,64}$/.test(v));
  insertBeforeDevmap(args, safe.flatMap(([k, v]) => ["+set", k, v]));
}
function until(fn, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const value = fn();
      if (value || Date.now() - startedAt > timeoutMs) resolve(value ?? null);
      else setTimeout(check, 100);
    };
    check();
  });
}
function measureRefreshRate(coop) {
  const times = [];
  const step = (t) => {
    times.push(t);
    if (times.length < 30) {
      requestAnimationFrame(step);
      return;
    }
    const deltas = times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b);
    const median = deltas[deltas.length >> 1];
    if (median > 0) coop.refreshRate = Math.max(30, Math.min(240, Math.round(1e3 / median)));
  };
  requestAnimationFrame(step);
}
export {
  finishEngine,
  prepareEngine,
  prepareMain
};
