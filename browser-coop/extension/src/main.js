// Native integration for bo1.znoam.eu, adapted from invictus841 at 861e39bc.
// Original networking, packet rings, engine layout and gamepad mapping retained.
//
// Host:  plays as usual. The extension gives its server a second "loopback" player whose packets come from the relay.
// Guest: loads the same map as usual, then freezes its own local server and connects its player to the host instead.
// The relay (relay/src/index.js, a Cloudflare Durable Object) carries the engine's own packets between the two pages.
// Solo is left unmodified when controller support is disabled; otherwise its command mailbox is installed too.

import { CLIENT_STATE, CONNECTION, compatibleEngines } from "./layout.js";
import { engineOptions } from "./native-engine.js";
export { finishEngine } from './native-engine.js';
import { normalizeRelay, isLoopback, sessionUrl } from "./navigation.js";
import { relay as configuredRelay } from "./coop-config.js";
import { EngineMemory } from "./engine-mem.js";
import { ringOffsets } from "./rings.js";
import { createRoomCode, normalizeRoomCode } from "../../shared/protocol.js";
import { Panel } from "./ui.js";
import { GamepadControl, AIM_SPEEDS } from "./gamepad.js";

/* global __PUMP_SOURCE__, __VERSION__ */
const VERSION = __VERSION__;
const DEFAULT_RELAY = normalizeRelay(configuredRelay);
const BASE = "/bo1z/";
// maps.js MAP_LIST: zone -> page slug
const MAP_SLUGS = {
  zombie_pentagon: "five", zombie_theater: "kino", zombie_cod5_factory: "riese", zombie_cod5_prototype: "nacht",
  zombie_cod5_asylum: "verruckt", zombie_cod5_sumpf: "shinonuma", zombie_cosmodrome: "ascension", zombie_coast: "cotd",
  zombie_temple: "shangrila", zombie_moon: "moon",
};
const MAP_NAMES = {
  five: '"Five"', kino: "Kino der Toten", riese: "Der Riese", nacht: "Nacht der Untoten", verruckt: "Verrückt",
  shinonuma: "Shi No Numa", ascension: "Ascension", cotd: "Call of the Dead", shangrila: "Shangri-La", moon: "Moon",
};
// Dvars that change the game itself (mods, horde settings): the guest copies the host's values.
const GAME_DVARS = /^(fs_mods|horde_[a-z_]+|kisak_mod_[a-z_]+|r_mod_[a-z_]+|r_dobjLimit|cg_mod_[a-z_]+|zinfo|noperks)$/i;
const KICK_AFTER_MS = 15000;
const HOST_GONE_MS = 10000;

if (!window.__bo1zCoop) start();

function start() {
  const params = new URLSearchParams(location.search);
  const requested = params.get("coop");
  const room = normalizeRoomCode(params.get("room") ?? "");
  const relayOverride = params.get("coopRelay");
  const coop = (window.__bo1zCoop = {
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
    aimLevel: Math.max(0, Math.min(AIM_SPEEDS.length - 1, Number(readSetting("bo1z-coop-aim", "4")) || 0)),
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
    log: [],
  });
  const note = (text) => {
    coop.log.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
    if (coop.log.length > 200) coop.log.shift();
  };
  coop.note = note;

  measureRefreshRate(coop);

  const panel = new Panel({
    host: () => { if (coop.relay) go(sessionUrl(location.href, { role: "host", room: createRoomCode(), localRelay: coop.relayParam })); },
    join: (text) => {
      const code = normalizeRoomCode(text);
      if (!code) { coop.notice = "Code de salon invalide. Collez le lien d’invitation ou le code de 16 lettres."; return; }
      let invitationRelay = '';
      try { invitationRelay = normalizeRelay(new URL(text).searchParams.get('relay') ?? ''); } catch {}
      go(sessionUrl(location.href, { role: 'join', room: code, relay: invitationRelay, localRelay: coop.relayParam }));
    },
    copy: () => {
      const link = inviteLink(coop);
      if (!navigator.clipboard?.writeText) { coop.notice = link; return; }
      navigator.clipboard.writeText(link).then(() => { coop.copiedAt = Date.now(); }, () => { coop.notice = link; });
    },
    leave: () => { coop.pump?.postMessage({ type: "close" }); go(sessionUrl(location.href)); },
    startNow: () => { coop.startAlone = true; },
    rejoin: () => location.reload(),
    editRelay: () => { coop.editRelay = !coop.editRelay; },
    saveRelay: (text) => {
      const url = normalizeRelay(text ?? "");
      if (!url) { coop.notice = "Adresse du relais invalide. Utilisez son URL HTTPS."; return; }
      saveSetting("bo1z-coop-relay", url === DEFAULT_RELAY ? "" : url);
      location.reload();
    },
    defaultRelay: () => { saveSetting("bo1z-coop-relay", ""); location.reload(); },
    useInviteRelay: () => { saveSetting("bo1z-coop-relay", coop.inviteRelay); location.reload(); },
    goToHost: () => { teleportToHost(coop, "button"); },
    controller: () => {
      coop.controller = !coop.controller;
      saveSetting("bo1z-coop-controller", coop.controller ? "1" : "0");
      coop.notice = "Rechargez la page pour appliquer le réglage de la manette.";
    },
    aimDown: () => setAim(coop, coop.aimLevel - 1),
    aimUp: () => setAim(coop, coop.aimLevel + 1),
  });
  coop.panel = panel;
  panel.mount();

  if (coop.controller) {
    coop.gamepad = new GamepadControl({
      // Only while our player is in a game: the engine runs the commands and the menus own the cursor.
      engine: () => (coop.mem && coop.patched && window.five?.screen === "playing" && coop.mem.connectionState() === CONNECTION.active
        ? { Module: coop.mem.Module, command: (text) => coop.mem.command(text) } : null),
      canvasSize: () => { const canvas = document.getElementById("game"); return { width: canvas?.width || 1280, height: canvas?.height || 720 }; },
      aimLevel: coop.aimLevel,
    });
    coop.gamepad.start();
  }

  // Today's estimated use of the relay's free daily allowance (GET /usage): at start, then every 10 minutes.
  const readUsage = () => fetch(`${coop.relay}/usage`).then((r) => (r.ok ? r.json() : null))
    .then((usage) => { coop.usage = usage && Number.isFinite(usage.fraction) ? usage : null; }, () => { coop.usage = null; });
  if (coop.relay) { readUsage(); setInterval(readUsage, 600000); }

  if (coop.mode && coop.relay && (!coop.inviteRelay || coop.inviteRelay === coop.relay)) {
    coop.phase = coop.mode === "host" ? "hosting" : "joining-room";
    coop.pump = startPump(coop);
    if (coop.mode === "host") installStartWait(coop, panel);
  }
  setInterval(() => tick(coop), 50);
}

// ---------------------------------------------------------------------------------------------------------------
// Hooks

export async function prepareEngine(url) {
  const coop = window.__bo1zCoop;
  if (coop.mode && (!coop.relay || coop.inviteRelay && coop.inviteRelay !== coop.relay)) {
    throw new Error('Configurez le relais du salon dans le panneau Coopération avant de lancer la partie.');
  }
  return engineOptions(coop, url);
}

export async function prepareMain(Module, args) {
  const coop = window.__bo1zCoop;
  if (!coop.patched) return;
  if (!coop.mode) {
    coop.mem = new EngineMemory(Module, coop.build);
    return;
  }
  try {
    if (coop.mode === 'host') setupHost(coop, Module, args);
    else await setupGuest(coop, Module, args);
  } catch (error) {
    coop.error = error.message;
    coop.phase = 'failed';
    coop.mem?.setInboundRing(0);
    coop.pump?.postMessage({ type: 'close' });
    throw error;
  }
}

// In BO1 zombies a player who joins after the round has started watches until the next round. So while player 2
// is in the room but not in the game yet, the host's "click to start" waits (the card offers "Start now").
// Only the host waits: a guest that cannot click in sends no moves and times out.
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

// ---------------------------------------------------------------------------------------------------------------
// Relay pump (a worker; see pump-worker.js)

function startPump(coop) {
  const url = URL.createObjectURL(new Blob([__PUMP_SOURCE__], { type: "text/javascript" }));
  const worker = new Worker(url, { name: "bo1z-coop-pump" });
  URL.revokeObjectURL(url);
  addEventListener("pagehide", () => worker.terminate(), { once: true });
  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === "socket") {
      coop.socket = message.state;
      if (message.state !== "open") coop.peer = false;
      if (message.state === "closed" && message.code === 4001) coop.error = "Ce salon a été ouvert dans un autre onglet ou une autre fenêtre.";
      coop.note(`relay ${message.state}${message.code ? ` ${message.code}` : ""}`);
    } else if (message.type === "control") {
      onControl(coop, message.message);
    } else if (message.type === "stats") {
      coop.stats = message.stats;
    }
  };
  worker.onerror = (event) => { coop.error = `Erreur de coopération : ${event.message}`; };
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
      if (coop.peer) { coop.peerSeenAt = Date.now(); greet(coop); }
      else { coop.peerLeftAt = Date.now(); coop.remotePause = false; }
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
  if (coop.mode === "host") { sendInfo(coop); coop.lastStateKey = null; }
  else send(coop, { t: "state", phase: coop.phase, v: VERSION });
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
    gameArgs: coop.gameArgs,
  });
}

function onHostInfo(coop, info) {
  coop.peerInfo = info;
  if (!info.slug || coop.mem) return; // host still choosing, or our engine already runs
  if (currentSlug() === info.slug && currentHorde() === Boolean(info.horde)) return;
  coop.phase = "following";
  if (!Object.values(MAP_SLUGS).includes(info.slug)) return;
  go(sessionUrl(location.href, { pathname: `${BASE}${info.slug}`, role: 'join', room: coop.room, horde: Boolean(info.horde), localRelay: coop.relayParam }));
}

// ---------------------------------------------------------------------------------------------------------------
// Engine setup (inside the callMain wrapper, before main() runs)

function setupHost(coop, Module, args) {
  const mem = new EngineMemory(Module, coop.build);
  if (!mem.mailboxesClear()) throw new Error("État du moteur inattendu : coopération désactivée.");
  const rings = mem.allocateRemoteRings();
  mem.setInboundRing(rings.inPort);
  coop.mem = mem;
  coop.rings = rings;
  // Keep the host's server running when its tab is hidden: drive the engine loop with a timer instead of
  // requestAnimationFrame (which stops in background tabs), capped at the display's refresh rate.
  if (coop.uncapped) {
    const capIndex = args.lastIndexOf('com_maxfps');
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
    dropOutOfBand: ["rcon"],
  });
  coop.note(`host rings: out ${rings.port} in ${rings.inPort}`);
  if (coop.peer) sendInfo(coop);
}

async function setupGuest(coop, Module, args) {
  const info = await until(() => (coop.peerInfo?.zone ? coop.peerInfo : null), 30000);
  if (!info) throw new Error("L’hôte ne répond pas. Vérifiez que sa partie est ouverte, puis rechargez.");
  if (info.hash && !compatibleEngines(info.hash, coop.hash)) throw new Error("Les deux joueurs ont des versions incompatibles du jeu. Rechargez les deux pages.");
  const zone = devmapZone(args);
  if (zone !== info.zone) throw new Error(`L’hôte joue sur ${MAP_NAMES[info.slug] ?? info.zone}. Rechargez cette page.`);
  if (Array.isArray(info.gameArgs)) applyGameDvars(args, info.gameArgs);
  const mem = new EngineMemory(Module, coop.build);
  if (!mem.mailboxesClear()) throw new Error("État du moteur inattendu : coopération désactivée.");
  coop.mem = mem;
  coop.zone = zone;
  coop.pump.postMessage({
    type: "attach",
    memory: mem.memory,
    layout: coop.build,
    readBase: ringOffsets(coop.build, 1).base, // our client -> server ring: forwarded to the host once connected
    writeBase: ringOffsets(coop.build, 0).base, // server -> our client ring: the host's packets go here
    writePort: 0,
    advanceGet: true,
    reading: false,
    injecting: false,
  });
  coop.phase = "loading";
}

// ---------------------------------------------------------------------------------------------------------------
// Per-tick state machines

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
  // The start screen holds the whole game on its first frame (intro hold), and a held game answers nobody. Once
  // player 2 has loaded the map and is about to join, release the hold as the host's own click would.
  const guestJoining = ["waiting-host", "freezing", "connect", "challenging", "joining"].includes(coop.peerState?.phase);
  if (mem && coop.peer && guestJoining && screen === "ready" && !coop.introReleased && mem.int(coop.build.browser.introState) === 1) {
    coop.introReleased = true;
    mem.Module._KB_Input?.(7, 1, 0);
    coop.note("released the start hold so player 2 can join");
  }
  const guestActive = slot?.state === CLIENT_STATE.active;
  // A paused server ignores join requests, and alone the host's server pauses on the start screen (intro hold) and
  // in the pause menu. While player 2 is in the room but not in the game yet, keep it running.
  if (mem && coop.peer && !guestActive) {
    if (mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 0);
    if (mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 0);
  }
  // Either player's game menu pauses both games (pauseHost / pauseGuest).
  const menuOpen = Boolean(mem?.menuOpen()) && screen === "playing";
  if (menuOpen !== coop.menuOpen) {
    coop.menuOpen = menuOpen;
    if (coop.peer) send(coop, { t: "pause", on: menuOpen });
  }
  // Shared pause only while player 2 is really in the game on both sides; otherwise never hold the server frozen.
  const guestLinked = coop.peer && coop.peerState?.phase === "connected";
  if (mem) pauseHost(coop, guestActive && guestLinked && (menuOpen || coop.remotePause), menuOpen);
  // Player 2's extension keeps player 2 next to the host (teleportToHost): send where the host is, once a second.
  const view = latestView();
  if (coop.peer && guestActive && view && view.ms !== coop.sentViewMs) {
    coop.sentViewMs = view.ms;
    send(coop, { t: "pos", o: view.origin, a: view.angles });
  }
  // Free player 2's slot when it is gone or about to join again (a reload after a crash): the server refuses a
  // second connection from a slot that is still in the game.
  const guestPhase = coop.peerState?.phase;
  // Any phase before "challenging" means a new player 2 page: the old slot must go before it connects.
  const stale = slot && slot.state >= CLIENT_STATE.connected && (
    (coop.peer && guestPhase && !["challenging", "joining", "connected"].includes(guestPhase)) ||
    (!coop.peer && coop.peerLeftAt && Date.now() - coop.peerLeftAt > KICK_AFTER_MS));
  if (stale && Date.now() - (coop.lastKickAt ?? 0) > 5000 && mem.command(`clientkick ${slot.slot}`)) {
    coop.lastKickAt = Date.now();
    coop.note(`removed player 2 (slot ${slot.slot}, ${coop.peer ? guestPhase : "left"})`);
  }
}

// Both games pause while either player's game menu is open. The engine pauses a server only with fewer than two
// players, so the host freezes its server itself (the FREEZE mailbox) and sets the dvars the engine's own pause
// sets: with sv_paused and cl_paused both on, the client clock stops and the connection timeout is skipped. The
// guest sets the same dvars (its server is frozen anyway). While paused, and once on resume, the client's
// last-packet time is held at 0, which also skips the timeout, so the two sides need not resume on the same frame.
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

// The engine prints the local player's position once a second; the page keeps the parsed lines.
function latestView() {
  const view = window.five?.views?.at(-1);
  return view && Array.isArray(view.origin) && view.origin.length === 3 && view.origin.every(Number.isFinite) ? view : null;
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const SPAWN_JUMP = 400, FAR_FROM_HOST = 300, HOST_POS_MAX_AGE_MS = 6000, SPAWN_CHECK_MS = 2000, SPAWN_RETRIES = 2;

// Each map places player 2's spawn point wherever its makers chose, sometimes far from player 1's (on Five, this
// build's one is outside the rooms). Whenever our player appears somewhere new (a spawn, a respawn) far from the
// host, move onto the host's spot. The move stays pending until a fresh host position is known, and is checked
// two seconds later in case the command did not take.
function followHost(coop) {
  const view = latestView();
  if (view && view.ms !== coop.lastViewMs) {
    const previous = coop.lastViewOrigin;
    coop.lastViewMs = view.ms;
    coop.lastViewOrigin = view.origin;
    if (!previous || distance(previous, view.origin) > SPAWN_JUMP) spawnPending(coop);
  }
  const pending = coop.spawn;
  if (!pending || coop.pausedApplied) return;
  const host = coop.hostPos, mine = coop.lastViewOrigin;
  if (!host || Date.now() - host.at > HOST_POS_MAX_AGE_MS || !mine) return;
  if (pending.sentAt && Date.now() - pending.sentAt < SPAWN_CHECK_MS) return;
  if (distance(host.origin, mine) <= FAR_FROM_HOST) { coop.spawn = null; return; }
  if (pending.tries >= SPAWN_RETRIES) { coop.spawn = null; coop.note("could not move next to the host"); return; }
  if (teleportToHost(coop, pending.tries ? "spawn, retry" : "spawn")) { pending.sentAt = Date.now(); pending.tries += 1; }
}

function spawnPending(coop) {
  if (!coop.spawn) coop.spawn = { tries: 0, sentAt: 0 };
}

// "setviewpos x y z" is a client command the server carries out on the player who sent it (cheats are on: the
// page starts every map with devmap). It takes an eye position and lowers it by the sender's current eye height
// to place the feet, while the host reports its feet: raise it by a standing eye height (60) plus a margin, so a
// crouched player 2 drops a few units onto the floor instead of sinking into it. The target is the host's own
// spot: a place a player can stand, and players do not block each other in BO1 zombies.
const EYE_HEIGHT = 62;
function teleportToHost(coop, why) {
  const mem = coop.mem, host = coop.hostPos;
  if (!mem || coop.phase !== "connected" || !host) return false;
  if (Date.now() - (coop.teleportedAt ?? 0) < 1000) return false;
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
  const paused = menuOpen || (coop.peer && Boolean(coop.remotePause));
  if (paused) {
    if (!coop.pausedApplied) coop.note(`paused${menuOpen ? "" : " by the host"}`);
    if (!mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 1);
    if (!mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 1);
    mem.clearLastPacketTime();
  } else {
    if (coop.pausedApplied) { mem.clearLastPacketTime(); coop.note("resumed"); }
    if (mem.dvarInt("svPaused")) mem.setDvarInt("svPaused", 0);
    if (mem.dvarInt("clPaused")) mem.setDvarInt("clPaused", 0);
  }
  coop.pausedApplied = paused;
}

// Guest phases in which our client is joining the host. A paused client sends no moves, and the host's server
// times a joining player out while it waits for the first one, so the start hold must not pause it then.
const GUEST_JOINING = ["challenging", "joining"];

function guestTick(coop) {
  const screen = window.five?.screen;
  // The engine stopped (vel.gg shows its error screen): tell the host, which frees our slot, and offer Rejoin.
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
        // Freeze our own server: from now on nothing in our engine reads ring 1, so the page can forward it.
        mem.setFreeze(true);
        coop.freezeAt = Date.now();
        coop.phase = "freezing";
        coop.note("freezing local server");
      }
      break;
    case "freezing":
      if (!mem.serverDrainsPackets() || Date.now() - coop.freezeAt > 5000) {
        if (mem.serverDrainsPackets()) coop.note("local server still drains packets after 5 s; continuing");
        mem.setDvarInt("svPaused", 0); // the intro hold paused it; a paused listen server would freeze our clock
        coop.pump.postMessage({ type: "read", dropUntilConnect: true });
        coop.pump.postMessage({ type: "inject", on: false, clearInbox: true });
        coop.phase = "connect";
      }
      break;
    case "connect":
      // Our client must not sit on the start screen's hold: a held client sends no moves, and the host's server
      // times a player out while it waits for the first one. Release it as the page's own click would.
      if (!coop.introReleased && mem.int(coop.build.browser.introState) === 1) {
        coop.introReleased = true;
        mem.Module._KB_Input?.(7, 1, 0);
      }
      // After a crash our old slot may still be in the host's game: the host frees it when it sees this phase,
      // and we wait for it to be gone (the server refuses a second connection from a slot still in the game).
      coop.connectWaitAt ??= Date.now();
      if ((coop.peerState?.slot ?? 0) >= CLIENT_STATE.connected && Date.now() - coop.connectWaitAt < 20000) break;
      // "LOCALHOST", not "localhost": the exact lowercase name would also shut our local server down.
      if (mem.command("connect LOCALHOST")) {
        coop.joinedLate = coop.peerState?.screen === "playing";
        coop.connectAt = Date.now();
        coop.phase = "challenging";
        coop.note("connect sent");
      }
      break;
    case "challenging":
      // connect set our server address to loopback:3074; the host's packets arrive as loopback:0.
      if (conn >= CONNECTION.connecting && conn <= CONNECTION.challenging && mem.setServerAddressPort(0) && mem.serverAddressPort() === 0) {
        coop.pump.postMessage({ type: "inject", on: true });
        coop.phase = "joining";
        coop.note("challenging; injecting host packets");
      } else if (Date.now() - coop.connectAt > 15000) {
        coop.error = "Connexion à l’hôte impossible. Rechargez les deux pages.";
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
      } else if (Date.now() - coop.connectAt > 90000) {
        coop.error = "La connexion à la partie a échoué. Rechargez les deux pages et réessayez.";
        coop.phase = "failed";
      }
      break;
    case "connected":
      if (conn < CONNECTION.challenging) {
        coop.phase = "ended";
        coop.note("disconnected");
      } else if (!coop.peer && coop.peerLeftAt && Date.now() - coop.peerLeftAt > HOST_GONE_MS) {
        coop.phase = "ended";
        coop.notice = "L’hôte a quitté la partie.";
        mem.command("disconnect");
      } else {
        pauseGuest(coop, screen);
        followHost(coop);
      }
      break;
    default:
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Panel view

function view(coop) {
  const blocks = [];
  const screen = window.five?.screen;
  const playing = screen === 'playing' && !coop.mem?.menuOpen();
  if (coop.error) blocks.push({ kind: 'text', cls: 'error', text: coop.error });
  if (coop.notice) blocks.push({ kind: 'text', cls: 'muted small', text: coop.notice });
  let tone = coop.error ? 'bad' : '', pill = '';
  const mismatch = coop.inviteRelay && coop.inviteRelay !== coop.relay;
  if (mismatch) {
    blocks.push({ kind: 'text', text: `Cette invitation utilise le relais ${new URL(coop.inviteRelay).hostname}.` });
    blocks.push({ kind: 'buttons', buttons: [{ act: 'useInviteRelay', label: 'Utiliser ce relais', primary: true }] });
  }
  if (!coop.mode) {
    blocks.push({ kind: 'text', cls: 'muted', text: 'Joue à deux : crée un salon sur cette carte, puis envoie l’invitation à ton ami.' });
    blocks.push({ kind: 'buttons', buttons: [{ act: 'host', label: 'Créer un salon', primary: true, disabled: !coop.relay }] });
    blocks.push({ kind: 'input', field: 'join', placeholder: 'Code ou lien d’invitation', act: 'join', label: 'Rejoindre', title: 'Invitation à une partie' });
    blocks.push(...relayBlocks(coop));
  } else if (!coop.relay || mismatch) {
    blocks.push({ kind: 'text', text: 'Le salon attend la configuration du relais.' });
    blocks.push(...relayBlocks(coop));
  } else {
    const relayState = { open: 'connecté', connecting: 'connexion…', closed: 'reconnexion…', idle: 'démarrage…' };
    const rtt = coop.stats?.rtt != null ? `${Math.round(coop.stats.rtt)} ms` : '—';
    const network = [['Relais', relayState[coop.socket] ?? coop.socket], ['Latence', rtt]];
    if (coop.mode === 'host') {
      const active = coop.guestSlot?.state === CLIENT_STATE.active && coop.peer;
      const gone = ['ended', 'failed'].includes(coop.peerState?.phase);
      const player = active ? 'dans la partie' : !coop.peer ? 'en attente' : gone ? 'déconnecté, peut revenir' : 'chargement / connexion';
      tone = coop.error ? 'bad' : active ? 'ok' : 'wait';
      blocks.push({ kind: 'text', text: 'Tu héberges la partie. Envoie cette invitation au deuxième joueur.' });
      blocks.push({ kind: 'code', text: coop.room });
      blocks.push({ kind: 'buttons', buttons: [{ act: 'copy', label: Date.now() - coop.copiedAt < 2000 ? 'Lien copié' : 'Copier l’invitation', primary: true }] });
      blocks.push({ kind: 'lines', lines: [['Joueur 2', player], ...network] });
      if (coop.gate) {
        blocks.push({ kind: 'text', text: 'Le démarrage attend le deuxième joueur pour commencer ensemble.' });
        blocks.push({ kind: 'buttons', buttons: [{ act: 'startNow', label: 'Démarrer sans attendre' }] });
      } else if (!active) {
        blocks.push({ kind: 'text', cls: 'small muted', text: 'Un joueur qui arrive en cours de manche attend la suivante pour apparaître.' });
      }
      if (coop.pausedApplied) blocks.push({ kind: 'text', text: coop.menuOpen ? 'Pause pour les deux joueurs.' : 'Le joueur 2 a mis la partie en pause.' });
      pill = coop.pausedApplied ? 'Coopération · pause' : `Joueur 2 : ${active ? 'en jeu' : 'en attente'} · ${rtt}`;
    } else {
      const steps = {
        'joining-room': 'En attente de l’hôte…', following: 'Ouverture de la carte de l’hôte…',
        loading: 'Chargement de la carte…', 'waiting-host': 'En attente du chargement de l’hôte…',
        freezing: 'Connexion…', connect: 'Connexion…', challenging: 'Connexion…', joining: 'Entrée dans la partie…',
        connected: 'Tu es dans la partie de l’hôte.', ended: 'Déconnecté. Tu peux rejoindre à nouveau.', failed: 'Connexion impossible. Réessaie.',
      };
      tone = coop.error ? 'bad' : coop.phase === 'connected' ? 'ok' : 'wait';
      blocks.push({ kind: 'text', text: steps[coop.phase] ?? 'Connexion…' });
      if (screen === 'landing') blocks.push({ kind: 'text', text: 'Appuie sur Jouer pour charger la carte.' });
      blocks.push({ kind: 'lines', lines: [['Salon', coop.room], ['Hôte', coop.peer ? 'présent' : 'absent'], ...network] });
      if (coop.joinedLate) blocks.push({ kind: 'text', cls: 'small muted', text: 'Partie déjà commencée : apparition à la prochaine manche.' });
      if (coop.phase === 'connected' && screen === 'ready') blocks.push({ kind: 'text', text: 'Appuie sur le jeu pour commencer.' });
      if (coop.pausedApplied) blocks.push({ kind: 'text', text: coop.menuOpen ? 'Pause pour les deux joueurs.' : 'L’hôte a mis la partie en pause.' });
      if (coop.phase === 'connected' && coop.hostPos) blocks.push({ kind: 'buttons', buttons: [{ act: 'goToHost', label: 'Rejoindre le joueur 1' }] });
      if (['ended', 'failed'].includes(coop.phase)) blocks.push({ kind: 'buttons', buttons: [{ act: 'rejoin', label: 'Se reconnecter', primary: true }] });
      pill = coop.phase === 'connected' ? `Coopération · ${coop.pausedApplied ? 'pause' : rtt}` : 'Coopération · connexion';
    }
    if (coop.stats?.lost) blocks.push({ kind: 'text', cls: 'muted small', text: `${coop.stats.lost} paquets perdus` });
  }
  blocks.push(...controllerBlocks(coop));
  if (coop.mode) blocks.push({ kind: 'buttons', buttons: [{ act: 'leave', label: 'Revenir en solo' }] });
  blocks.push({ kind: 'text', cls: 'muted small', text: 'Port : MisaDev4 / vel.gg · Manettes et coopération : invictus841 · Adaptation : Znoam' });
  if (coop.gamepad?.status === 'active') pill += `${pill ? ' · ' : ''}Manette`;
  return { tone, blocks, compact: playing && !coop.error && !coop.notice, pill };
}

function controllerBlocks(coop) {
  const pad = coop.gamepad;
  const name = pad?.name ? pad.name.replace(/\s*\(.*$/, '').slice(0, 32) : '';
  const status = !coop.controller ? 'désactivée'
    : !coop.patched && coop.hash ? 'indisponible pour ce moteur'
    : !pad || pad.status === 'none' ? 'appuie sur un bouton de ta manette'
    : pad.status === 'active' ? `${name} · visée ${coop.aimLevel + 1}/${AIM_SPEEDS.length}`
    : `${name} · prête après le démarrage du jeu`;
  const buttons = coop.controller && pad?.status !== 'none'
    ? [{ act: 'aimDown', label: 'Visée −' }, { act: 'aimUp', label: 'Visée +' }, { act: 'controller', label: 'Désactiver' }]
    : [{ act: 'controller', label: coop.controller ? 'Désactiver la manette' : 'Activer la manette' }];
  return [
    { kind: 'lines', lines: [['Manette', status]] }, { kind: 'buttons', buttons },
    { kind: 'text', cls: 'muted small', text: 'PS4, PS5 ou Xbox. Appuie d’abord sur Jouer à l’écran pour activer le son. Carré/X : recharger ; maintenir pour interagir.' },
  ];
}

function relayBlocks(coop) {
  const blocks = [{ kind: 'text', cls: 'muted small', text: coop.relay
    ? `Relais : ${new URL(coop.relay).hostname}`
    : 'Coopération indisponible tant que le relais du site n’est pas activé. Les manettes fonctionnent en solo.' }];
  if (coop.editRelay) {
    blocks.push({ kind: 'input', field: 'relay', title: 'Adresse du relais', placeholder: 'https://votre-relais.workers.dev', act: 'saveRelay', label: 'Enregistrer', value: coop.relay });
    blocks.push({ kind: 'buttons', buttons: [{ act: 'defaultRelay', label: 'Réglage du site' }, { act: 'editRelay', label: 'Annuler' }] });
  } else blocks.push({ kind: 'buttons', buttons: [{ act: 'editRelay', label: 'Configurer le relais' }] });
  return blocks;
}

function setAim(coop, level) {
  coop.aimLevel = Math.max(0, Math.min(AIM_SPEEDS.length - 1, level));
  if (coop.gamepad) coop.gamepad.aimLevel = coop.aimLevel;
  saveSetting("bo1z-coop-aim", String(coop.aimLevel));
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers

function readSetting(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* not kept */ }
}

function go(url) { location.assign(url); }

function inviteLink(coop) {
  // Do not impose the host's graphics/touch preferences on another device.
  return sessionUrl(`${location.origin}${location.pathname}`, {
    role: 'join', room: coop.room, relay: coop.relayParam ? '' : coop.relay,
    localRelay: coop.relayParam, horde: currentHorde(),
  });
}

function relayBase(override) {
  if (isLoopback(location.href) && isLoopback(override)) {
    const local = normalizeRelay(override, true);
    if (local) return local;
  }
  return normalizeRelay(readSetting('bo1z-coop-relay', '')) || DEFAULT_RELAY;
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
    if (times.length < 30) { requestAnimationFrame(step); return; }
    const deltas = times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b);
    const median = deltas[deltas.length >> 1];
    if (median > 0) coop.refreshRate = Math.max(30, Math.min(240, Math.round(1000 / median)));
  };
  requestAnimationFrame(step);
}
