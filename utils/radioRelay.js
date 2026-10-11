import { WebSocketServer } from 'ws';
import { logger } from './logger.js';

export const RADIO_WS_PATH = '/radio';
export const RADIO_AUTH_TIMEOUT_MS = 8_000;
/** A radio waiting on Discord sign-in in the browser: as long as the app's own sign-in window. */
export const RADIO_SIGNIN_TIMEOUT_MS = 5 * 60 * 1000;
/** How often the relay re-checks whether a dispatcher (a name tagged !C) is on. */
export const RADIO_DISPATCH_CHECK_MS = 15_000;
const DISPATCH_TAG = '!C';
export const isDispatcherName = (name) => String(name || '').includes(DISPATCH_TAG);
export const RADIO_TX_IDLE_MS = 1_500;
/** Stuck mic: a transmission (or whisper) still open after this long is cut. */
export const RADIO_TX_MAX_MS = 60_000;
export const RADIO_MAX_PACKET_BYTES = 1_500;
export const RADIO_MAX_PACKETS_PER_SECOND = 75;
/** How often signed-in radios are re-checked against the Discord server (anti-raid). */
export const RADIO_RECHECK_MS = 5 * 60 * 1000;
const AUDIO_FRAME = 0x01;
/** Radio channels. MAIN is bridged to the Discord voice channel; the others are app-to-app only. */
export const RADIO_MAIN_CHANNEL = 'main';
export const RADIO_SRT_CHANNEL = 'srt';
export const RADIO_FREQ_CHANNEL = 'freq';
/** A temporary channel staff open for a server event; it closes (moving everyone to MAIN) when they're done. */
export const RADIO_EVENT_CHANNEL = 'event';
const APP_CHANNELS = [
  { id: RADIO_SRT_CHANNEL, name: 'Special Response Team' },
  { id: RADIO_FREQ_CHANNEL, name: 'Frequency Change' },
];
/** One PANIC press per member in this window. */
export const RADIO_PANIC_GAP_MS = 2 * 60 * 1000;
/** Synced settings: only these keys, and only small values, are kept per member. */
export const RADIO_SYNC_KEYS = Object.freeze(['volume', 'listenFx', 'scan']);
/** PTT spam: this many presses inside the window times the member out of talking on the radio. */
export const RADIO_SPAM_PRESSES = 6;
export const RADIO_SPAM_WINDOW_MS = 10_000;
export const RADIO_SPAM_TIMEOUT_MS = 60_000;

/** Binary frame sent to apps: [0x01][speaker Discord ID as uint64 BE][Opus packet]. */
export function encodeAudioFrame(speakerId, packet) {
  const frame = Buffer.allocUnsafe(9 + packet.length);
  frame[0] = AUDIO_FRAME;
  frame.writeBigUInt64BE(BigInt(speakerId), 1);
  packet.copy(frame, 9);
  return frame;
}

export function decodeAudioFrame(frame) {
  if (!Buffer.isBuffer(frame) || frame.length < 10 || frame[0] !== AUDIO_FRAME) return null;
  return { speakerId: frame.readBigUInt64BE(1).toString(), packet: frame.subarray(9) };
}

function send(socket, message) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(typeof message === 'string' || Buffer.isBuffer(message) ? message : JSON.stringify(message));
}

/**
 * WebSocket relay between Clearwater Radio desktop apps and the radio bot's voice connection.
 * Discord specifics are injected so the relay stays testable.
 *
 * @param {object} options
 * @param {(key: string) => string|null} options.verifyKey
 * @param {(code: string) => Promise<string>} [options.exchangeCode] Discord OAuth code → user ID
 * @param {(userId: string) => string|null} [options.createSession] token the app stores after sign-in
 * @param {() => ({ clientId: string, redirectUri: string }|null)} [options.loginInfo]
 * @param {(userId: string) => Promise<{ ok: boolean, name?: string, reason?: string, removed?: boolean }>} options.authorize
 *   `removed: true` means the member is not in the server or lost radio access; their app is closed.
 * @param {(userId: string) => ({ push(packet: Buffer): void, end(): void }|null)} options.openTransmit
 * @param {() => { online: boolean, channel: string }} options.status
 * @param {() => { id: string, name: string }[]} [options.voiceMembers] members sitting in the Discord radio channel
 * @param {(userId: string, name: string) => Promise<{ name?: string, location?: string, unit?: string, postal?: string }|null>} [options.locatePanic]
 *   who and where a radio's EMER press came from, for the panic alert.
 * @param {(postal: string) => ({ x: number, y: number }|null)} [options.mapPoint] where a postal sits on the map (fractions)
 * @param {() => { id: string, name: string, since: number, kind?: string, detail?: string }[]} [options.calls] pending 911 calls
 * @param {(userId: string) => ({ data: object, updatedAt: number }|null)} [options.loadSettings] a member's synced settings
 * @param {(userId: string, saved: { data: object, updatedAt: number }) => void} [options.saveSettings]
 * @param {(event: { userId: string, name: string, channel: string, dispatcher: string }) => void} [options.onTalkOver]
 * @param {(report: object) => void} [options.onCrash] a radio's crash report, for the staff panel
 * @param {() => { id: string, name: string, channel: string, since: number }[]} [options.scenes] units in scene voice channels (dispatch only)
 * @param {(radio: object, channel: string) => boolean} [options.canUse] rank-based channel access (MAIN is always open)
 */
export function createRadioRelay({
  verifyKey,
  exchangeCode = async () => { throw new Error('Discord sign-in is not set up on the bot host.'); },
  createSession = () => null,
  loginInfo = () => null,
  authorize,
  openTransmit,
  status,
  inVoice = () => false,
  voiceMembers = () => [],
  locatePanic = async () => null,
  onPanic = () => {},
  onTalked = () => {},
  mapPoint = () => null,
  calls = () => [],
  loadSettings = () => null,
  saveSettings = () => {},
  isStaff = async () => false,
  canUse = () => true,
  onTalkOver = () => {},
  onCrash = () => {},
  scenes = () => [],
  muted = [],
  dispatchCheckMs = RADIO_DISPATCH_CHECK_MS,
  now = () => Date.now(),
  recheckMs = RADIO_RECHECK_MS,
  authTimeoutMs = RADIO_AUTH_TIMEOUT_MS,
  signInTimeoutMs = RADIO_SIGNIN_TIMEOUT_MS,
}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  /** @type {Set<import('ws').WebSocket>} */
  const clients = new Set();
  // One talker per channel: channel id -> { socket, userId, name, sink, startedAt, lastPacketAt }
  const talkers = new Map();
  const discordTalkers = new Map(); // userId -> name, members talking in the Discord channel
  // Staff controls: force-muted members can listen but not talk; kicked members can't sign in until the time is up.
  const mutedUsers = new Set([...muted].map(String));
  const kickedUntil = new Map();
  // Signal (0.1-1) per member from where they are in game and the staff's coverage map; none = clear.
  const signals = new Map();
  const signalOf = (userId) => signals.get(String(userId));
  // Game data per member (postal, street, speed, heading) and the server weather, for the radio screen.
  const games = new Map();
  let weather = '';
  // Who was last heard on each channel: channel id -> { name, at }
  const lastHeard = new Map();
  // Per member, so reconnecting does not reset them: last PANIC, recent PTT presses, PTT timeout.
  const lastPanicAt = new Map();
  const pttPresses = new Map();
  const pttTimeoutUntil = new Map();
  const secondsLeft = (until) => Math.max(1, Math.ceil((until - now()) / 1000));
  // Staff's temporary event channel: { name, by, openedAt } while open.
  let eventChannel = null;
  const channelList = () => [
    { id: RADIO_MAIN_CHANNEL, name: status().channel || 'Radio' },
    ...APP_CHANNELS,
    ...(eventChannel ? [{ id: RADIO_EVENT_CHANNEL, name: eventChannel.name }] : []),
  ];
  const channelName = (id) => channelList().find((channel) => channel.id === id)?.name || 'Radio';
  const isChannel = (id) => channelList().some((channel) => channel.id === id);
  // Rank-based access: MAIN is open to everyone; other channels follow the staff page's rules.
  const allowedOn = (radio, id) => {
    if (id === RADIO_MAIN_CHANNEL) return true;
    try { return canUse(radio, id) !== false; } catch { return true; }
  };
  // Members sitting in the Discord channel already hear MAIN there, so their app stays quiet on it.
  // Scan mode: a radio also listens to up to two other channels while it talks on its own.
  // Staff monitor (live listen) hears every channel and can't talk.
  const listensTo = (radio, channel) => radio.channel === channel || Boolean(radio.scan?.has(channel)) || Boolean(radio.monitor);
  // Crash reports per radio connection, so a broken radio can't flood the staff panel.
  const CRASH_REPORTS_PER_SOCKET = 5;
  const hears = (socket, speakerId, channel) => {
    const radio = socket.radio;
    if (!radio?.userId || radio.deaf || radio.userId === speakerId || !listensTo(radio, channel)) return false;
    return channel !== RADIO_MAIN_CHANNEL || !inVoice(radio.userId);
  };
  // Private calls: talking socket -> { socket, to, userId, name, startedAt, lastPacketAt }
  const whispers = new Map();
  const watchdog = setInterval(() => {
    const at = now();
    for (const talker of [...talkers.values(), ...whispers.values()]) {
      if (at - talker.startedAt > RADIO_TX_MAX_MS) {
        // Stuck mic: tell the radio why it was cut.
        send(talker.socket, { type: 'cut', reason: 'stuck' });
        endTransmit(talker.socket);
      } else if (at - talker.lastPacketAt > RADIO_TX_IDLE_MS) {
        endTransmit(talker.socket);
      }
    }
  }, 250);
  watchdog.unref?.();

  // Dispatch is active while anyone tagged !C (the same rule as the voice channel's "Dispatch Online"
  // status) is in the Discord radio channel or on a radio.
  const dispatchActive = () => {
    let members = [];
    try { members = voiceMembers() || []; } catch { /* Discord cache hiccup */ }
    return members.some((member) => isDispatcherName(member.name))
      || [...clients].some((socket) => isDispatcherName(socket.radio?.name));
  };
  let lastDispatch = false;
  const dispatchWatch = setInterval(() => {
    if (dispatchActive() !== lastDispatch) broadcastStatus();
  }, dispatchCheckMs);
  dispatchWatch.unref?.();

  const listenerCount = (channel = null) => [...clients]
    .filter((socket) => socket.radio?.userId && (!channel || socket.radio.channel === channel)).length;

  /** Sends to every signed-in radio, or only those on (or scanning) `channel`. */
  function broadcast(message, except = null, channel = null) {
    for (const socket of clients) {
      if (socket !== except && socket.radio?.userId && (!channel || listensTo(socket.radio, channel))) send(socket, message);
    }
  }

  /** Everyone on a channel, app radios and (for MAIN) the Discord channel together; someone in both is listed once. */
  function rosterFor(channel) {
    const byId = new Map();
    for (const socket of clients) {
      const radio = socket.radio;
      if (radio?.userId && radio.channel === channel) byId.set(radio.userId, { id: radio.userId, name: radio.name, ...(radio.label ? { label: radio.label } : {}), app: true, discord: false });
    }
    if (channel === RADIO_MAIN_CHANNEL) {
      let members = [];
      try { members = voiceMembers() || []; } catch { /* Discord cache hiccup: apps only */ }
      for (const member of members) {
        const entry = byId.get(member.id);
        if (entry) entry.discord = true;
        else byId.set(member.id, { id: member.id, name: member.name, ...(member.label ? { label: member.label } : {}), app: false, discord: true });
      }
    }
    const talking = talkingOn(channel);
    for (const entry of byId.values()) entry.talking = talking.has(entry.id);
    // Whoever is talking goes to the top of the list.
    return [...byId.values()].sort((a, b) => Number(b.talking) - Number(a.talking) || a.name.localeCompare(b.name));
  }

  /** Who is talking on a channel right now: its app talker and, for MAIN, members speaking in the Discord channel. */
  function talkingOn(channel) {
    const ids = new Set();
    const talker = talkers.get(channel);
    if (talker) ids.add(talker.userId);
    if (channel === RADIO_MAIN_CHANNEL) for (const id of discordTalkers.keys()) ids.add(id);
    return ids;
  }

  /** Tells every radio who is talking on each channel, so the units lists can put them on top. */
  function broadcastTalking() {
    const channels = Object.fromEntries(channelList().map(({ id }) => [id, [...talkingOn(id)]]));
    broadcast({ type: 'talking', channels });
  }

  /** Pending 911 calls, with how long each has waited so far. */
  function pendingCalls() {
    let list = [];
    try { list = calls() || []; } catch { /* Discord cache hiccup */ }
    const at = now();
    return list.slice(0, 10).map((call) => ({
      id: String(call.id || ''),
      name: String(call.name || 'Caller').slice(0, 40),
      kind: String(call.kind || 'discord'),
      detail: String(call.detail || '').slice(0, 80),
      waited: Math.max(0, Math.round((at - (Number(call.since) || at)) / 1000)),
    }));
  }

  function statusFor(socket) {
    const channel = socket.radio.channel;
    const base = status();
    return {
      ...base,
      // Off-Discord channels work without the bot in voice.
      online: channel === RADIO_MAIN_CHANNEL ? base.online : true,
      channel: channelName(channel),
      channelId: channel,
      channels: channelList().map(({ id, name }) => ({ id, name, members: rosterFor(id), ...(allowedOn(socket.radio, id) ? {} : { locked: true }) })),
      listeners: listenerCount(channel),
      inVoice: channel === RADIO_MAIN_CHANNEL && Boolean(inVoice(socket.radio.userId)),
      dispatch: dispatchActive(),
      muted: mutedUsers.has(socket.radio.userId),
      signal: signalOf(socket.radio.userId) ?? null,
      weather,
      lastHeard: lastHeard.get(channel) || null,
      scan: [...(socket.radio.scan || [])],
      calls: pendingCalls(),
      monitor: Boolean(socket.radio.monitor),
      event: eventChannel ? { name: eventChannel.name } : null,
      // Scene timers are for dispatch (a !C name) only.
      ...(isDispatcherName(socket.radio.name) ? { scenes: sceneList() } : {}),
    };
  }

  function sceneList() {
    let list = [];
    try { list = scenes() || []; } catch { /* Discord cache hiccup */ }
    const at = now();
    return list.slice(0, 30).map((scene) => ({
      id: String(scene.id || ''),
      name: String(scene.name || 'Member').slice(0, 40),
      channel: String(scene.channel || 'Scene').slice(0, 40),
      seconds: Math.max(0, Math.round((at - (Number(scene.since) || at)) / 1000)),
    }));
  }

  function broadcastStatus() {
    lastDispatch = dispatchActive();
    for (const socket of clients) {
      if (socket.radio?.userId) send(socket, { type: 'status', ...statusFor(socket) });
    }
  }

  function endWhisper(socket) {
    const whisper = whispers.get(socket);
    if (!whisper) return;
    whispers.delete(socket);
    for (const other of clients) {
      if (other.radio?.userId === whisper.to) send(other, { type: 'whisper', id: whisper.userId, name: whisper.name, active: false });
    }
  }

  function endTransmit(socket) {
    endWhisper(socket);
    const channel = socket.radio?.txChannel;
    const talker = talkers.get(channel);
    if (!talker || talker.socket !== socket) return;
    talkers.delete(channel);
    try { talker.sink?.end(); } catch { /* ignore */ }
    lastHeard.set(channel, { name: talker.name, at: now() });
    broadcast({ type: 'talk', id: talker.userId, name: talker.name, active: false, source: 'app', channel }, null, channel);
    broadcastTalking();
    try {
      onTalked({
        userId: talker.userId,
        name: talker.name,
        channel,
        channelName: channelName(channel),
        onDiscordChannel: channel === RADIO_MAIN_CHANNEL,
        startedAt: talker.startedAt,
        endedAt: now(),
      });
    } catch { /* logging never breaks the radio */ }
  }

  // Counts a PTT press; too many in a short time times the member out of talking for a minute.
  function pttSpamTimeout(userId) {
    const at = now();
    const until = pttTimeoutUntil.get(userId) || 0;
    if (until > at) return until;
    const recent = (pttPresses.get(userId) || []).filter((time) => at - time < RADIO_SPAM_WINDOW_MS);
    recent.push(at);
    if (recent.length < RADIO_SPAM_PRESSES) {
      pttPresses.set(userId, recent);
      return 0;
    }
    pttPresses.delete(userId);
    pttTimeoutUntil.set(userId, at + RADIO_SPAM_TIMEOUT_MS);
    logger.info(`Radio: ${userId} timed out of PTT for spamming`);
    return at + RADIO_SPAM_TIMEOUT_MS;
  }

  // Who may talk at all: deafened, staff-muted and PTT-spam timed-out radios can't. Returns the refusal, if any.
  function talkRefusal(socket) {
    const { userId } = socket.radio;
    // Deafened radios can't talk, like being muted in the Discord channel.
    if (socket.radio.deaf) return { reason: 'deaf' };
    // Staff monitor is listen-only.
    if (socket.radio.monitor) return { reason: 'monitor' };
    if (mutedUsers.has(userId)) return { reason: 'muted' };
    const timeoutUntil = pttSpamTimeout(userId);
    if (timeoutUntil) return { reason: 'timeout', seconds: secondsLeft(timeoutUntil) };
    return null;
  }

  /**
   * PTT: talk on your own channel, or (second PTT key) on a channel you are scanning.
   * @param {string} [target] channel id to talk on
   */
  function startTransmit(socket, target) {
    const { userId, name } = socket.radio;
    const channel = target && socket.radio.scan?.has(target) ? target : socket.radio.channel;
    const talker = talkers.get(channel);
    if (talker?.socket === socket) return send(socket, { type: 'tx', ok: true, channel });
    const refusal = talkRefusal(socket);
    if (refusal) return send(socket, { type: 'tx', ok: false, ...refusal });
    // Dispatch priority: someone tagged !C cuts in over anyone who isn't dispatch.
    if (talker && isDispatcherName(name) && !isDispatcherName(talker.name)) {
      send(talker.socket, { type: 'cut', name });
      endTransmit(talker.socket);
    } else if (talker) {
      // Pressing to talk while dispatch has the channel counts as talking over dispatch.
      if (isDispatcherName(talker.name) && !isDispatcherName(name)) reportTalkOver(socket.radio, channel, talker.name);
      return send(socket, { type: 'tx', ok: false, reason: 'busy', name: talker.name });
    }
    // Talking on MAIN while a dispatcher speaks in the Discord channel (Discord never blocks the radio).
    if (channel === RADIO_MAIN_CHANNEL && !isDispatcherName(name)) {
      const dispatcher = [...discordTalkers.values()].find(isDispatcherName);
      if (dispatcher) reportTalkOver(socket.radio, channel, dispatcher);
    }
    let sink = null;
    if (channel === RADIO_MAIN_CHANNEL) {
      // Members in the Discord channel talk there, not through the radio.
      if (inVoice(userId)) return send(socket, { type: 'tx', ok: false, reason: 'invoice' });
      if (!status().online) return send(socket, { type: 'tx', ok: false, reason: 'offline' });
      sink = openTransmit(userId);
      if (!sink) return send(socket, { type: 'tx', ok: false, reason: 'offline' });
    }
    // One transmission at a time per radio.
    endTransmit(socket);
    const at = now();
    socket.radio.txChannel = channel;
    talkers.set(channel, { socket, userId, name, sink, startedAt: at, lastPacketAt: at });
    send(socket, { type: 'tx', ok: true, channel });
    broadcast({ type: 'talk', id: userId, name, active: true, source: 'app', channel, signal: signalOf(userId) }, socket, channel);
    broadcastTalking();
  }

  /** Private call: PTT talks to one unit's radio only (never Discord, never the channel). */
  function startWhisper(socket, to) {
    const { userId, name } = socket.radio;
    const target = String(to || '');
    if (whispers.get(socket)?.to === target) return send(socket, { type: 'tx', ok: true, to: target });
    const targets = [...clients].filter((other) => other.radio?.userId === target);
    if (!targets.length || target === userId) return send(socket, { type: 'tx', ok: false, reason: 'whisper-offline' });
    const refusal = talkRefusal(socket);
    if (refusal) return send(socket, { type: 'tx', ok: false, ...refusal });
    endTransmit(socket);
    const at = now();
    whispers.set(socket, { socket, to: target, userId, name, startedAt: at, lastPacketAt: at });
    send(socket, { type: 'tx', ok: true, to: target });
    for (const other of targets) send(other, { type: 'whisper', id: userId, name, active: true, signal: signalOf(userId) });
  }

  function onAudio(socket, packet) {
    const whisper = whispers.get(socket);
    const channel = socket.radio.txChannel;
    const talker = talkers.get(channel);
    if (!whisper && (!talker || talker.socket !== socket)) return;
    if (packet.length === 0 || packet.length > RADIO_MAX_PACKET_BYTES) return;
    const state = socket.radio;
    const second = Math.floor(now() / 1000);
    if (state.rateSecond !== second) {
      state.rateSecond = second;
      state.rateCount = 0;
    }
    state.rateCount += 1;
    if (state.rateCount > RADIO_MAX_PACKETS_PER_SECOND) return;
    if (whisper) {
      whisper.lastPacketAt = now();
      const frame = encodeAudioFrame(whisper.userId, packet);
      for (const other of clients) {
        if (other.radio?.userId === whisper.to && !other.radio.deaf) send(other, frame);
      }
      return;
    }
    talker.lastPacketAt = now();
    talker.sink?.push(packet);
    const frame = encodeAudioFrame(talker.userId, packet);
    for (const other of clients) {
      if (other !== socket && hears(other, talker.userId, channel)) send(other, frame);
    }
  }

  function switchChannel(socket, channel) {
    if (!isChannel(channel) || socket.radio.channel === channel) return false;
    if (!allowedOn(socket.radio, channel)) {
      send(socket, { type: 'locked', channel, channelName: channelName(channel) });
      return false;
    }
    endTransmit(socket);
    socket.radio.channel = channel;
    socket.radio.scan?.delete(channel);
    send(socket, { type: 'channel', ...statusFor(socket) });
    for (const [id, talker] of talkers) {
      if (listensTo(socket.radio, id)) send(socket, { type: 'talk', id: talker.userId, name: talker.name, active: true, source: 'app', channel: id, signal: signalOf(talker.userId) });
    }
    if (listensTo(socket.radio, RADIO_MAIN_CHANNEL)) {
      for (const [id, name] of discordTalkers) send(socket, { type: 'talk', id, name, active: true, source: 'discord', channel: RADIO_MAIN_CHANNEL });
    }
    broadcastStatus();
    return true;
  }

  // A radio on (or scanning) a channel it may no longer use goes back to MAIN.
  function enforceAccess(socket) {
    const radio = socket.radio;
    if (!radio?.userId) return;
    for (const id of [...(radio.scan || [])]) if (!allowedOn(radio, id)) radio.scan.delete(id);
    if (allowedOn(radio, radio.channel)) return;
    endTransmit(socket);
    radio.channel = RADIO_MAIN_CHANNEL;
    send(socket, { type: 'moved', by: 'Staff', channel: RADIO_MAIN_CHANNEL, channelName: channelName(RADIO_MAIN_CHANNEL), reason: 'locked' });
    send(socket, { type: 'channel', ...statusFor(socket) });
  }

  function reportTalkOver(radio, channel, dispatcher) {
    try {
      onTalkOver({ userId: radio.userId, name: radio.name, channel: channelName(channel), dispatcher: String(dispatcher || 'Dispatch') });
    } catch { /* moderation never breaks the radio */ }
  }

  // Staff monitor: an admin's radio hears every channel, listen-only. Checked live with the bot.
  async function setMonitor(socket, active) {
    if (!active) {
      socket.radio.monitor = false;
      send(socket, { type: 'monitor', ok: true, active: false });
      send(socket, { type: 'status', ...statusFor(socket) });
      return;
    }
    let allowed = false;
    try { allowed = Boolean(await isStaff(socket.radio.userId)); } catch { allowed = false; }
    if (!socket.radio) return;
    if (!allowed) return send(socket, { type: 'monitor', ok: false, active: false, reason: 'staff-only' });
    endTransmit(socket);
    socket.radio.monitor = true;
    send(socket, { type: 'monitor', ok: true, active: true });
    send(socket, { type: 'status', ...statusFor(socket) });
    for (const [id, talker] of talkers) {
      if (talker.socket !== socket) send(socket, { type: 'talk', id: talker.userId, name: talker.name, active: true, source: 'app', channel: id, signal: signalOf(talker.userId) });
    }
    logger.info(`Radio: staff monitor on for ${socket.radio.userId}`);
  }

  function onCrashReport(socket, message) {
    socket.radio.crashes = (socket.radio.crashes || 0) + 1;
    if (socket.radio.crashes > CRASH_REPORTS_PER_SOCKET) return;
    const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, max);
    try {
      onCrash({
        userId: socket.radio.userId,
        name: socket.radio.name,
        message: text(message.message, 300) || 'Unknown error',
        stack: text(message.stack, 2000),
        where: text(message.where, 40),
        version: text(message.version, 20),
        platform: text(message.platform, 60),
        at: Math.min(Number(message.at) || now(), now()),
      });
    } catch { /* never break the radio */ }
  }

  // Dispatch (a !C name) moves another unit's radio to a channel.
  function moveUnit(socket, userId, channel) {
    const by = socket.radio.name;
    if (!isDispatcherName(by)) return send(socket, { type: 'move', ok: false, reason: 'dispatch-only' });
    if (!isChannel(channel)) return send(socket, { type: 'move', ok: false, reason: 'bad-channel' });
    const targets = [...clients].filter((other) => other.radio?.userId === String(userId || ''));
    if (!targets.length) return send(socket, { type: 'move', ok: false, reason: 'not-on-radio' });
    for (const target of targets) {
      if (switchChannel(target, channel)) send(target, { type: 'moved', by, channel, channelName: channelName(channel) });
    }
    logger.info(`Radio: ${by} moved ${userId} to ${channelName(channel)}`);
    return send(socket, { type: 'move', ok: true, name: targets[0].radio.name, channel, channelName: channelName(channel) });
  }

  // Settings sync between a member's desktop and phone radios: a small whitelisted set, newest wins.
  function syncSettings(socket, message) {
    const data = {};
    for (const key of RADIO_SYNC_KEYS) {
      const value = message?.data?.[key];
      if (value === undefined) continue;
      if (key === 'scan') data.scan = Array.isArray(value) ? value.map(String).filter(isChannel).slice(0, 2) : [];
      else if (typeof value === 'number' && Number.isFinite(value)) data[key] = value;
      else if (typeof value === 'boolean') data[key] = value;
      else if (typeof value === 'string' && value.length <= 16) data[key] = value;
    }
    const updatedAt = Math.min(Number(message?.updatedAt) || now(), now());
    try {
      saveSettings(socket.radio.userId, { data, updatedAt });
    } catch (error) {
      logger.warn(`Radio settings sync failed: ${error?.message || error}`);
    }
  }

  // Panics carry where their postal sits on the map, for the radio's mini map.
  function withMap(alert) {
    let map = null;
    try { map = alert.postal ? mapPoint(String(alert.postal)) : null; } catch { map = null; }
    return map ? { ...alert, map } : alert;
  }

  // EMER on a radio: alert every radio with who pressed it and, when the game knows, where they are.
  async function onPanicPress(socket) {
    const { userId, name } = socket.radio;
    const at = now();
    const last = lastPanicAt.get(userId) || 0;
    if (at - last < RADIO_PANIC_GAP_MS) {
      send(socket, { type: 'panic-wait', seconds: secondsLeft(last + RADIO_PANIC_GAP_MS) });
      return;
    }
    lastPanicAt.set(userId, at);
    let found = null;
    try {
      found = await locatePanic(userId, name);
    } catch (error) {
      logger.warn(`Radio panic lookup failed: ${error?.message || error}`);
    }
    const alert = withMap({
      type: 'panic', name: found?.name || name, location: found?.location || '',
      unit: found?.unit || '', postal: found?.postal || '', at, source: 'radio',
    });
    broadcast(alert);
    onPanic({ ...alert, userId });
  }

  function removeSocket(socket, reason) {
    send(socket, { type: 'error', code: 'removed', message: reason || 'You are no longer allowed on this radio.' });
    socket.close(4004, 'removed');
  }

  function setScan(socket, ids) {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    socket.radio.scan = new Set(list.filter((id) => isChannel(id) && id !== socket.radio.channel && allowedOn(socket.radio, id)).slice(0, 2));
  }

  async function onAuth(socket, message) {
    let userId = null;
    let session = null;
    if (message.code) {
      try {
        userId = await exchangeCode(String(message.code));
        session = createSession(userId);
      } catch (error) {
        logger.warn(`Radio sign-in failed: ${error?.message || error}`);
      }
      if (socket.readyState !== socket.OPEN) return;
      if (!userId || !session) {
        send(socket, { type: 'error', code: 'signin-failed', message: 'Discord sign-in failed. Try again.' });
        return socket.close(4001, 'sign-in failed');
      }
    } else {
      userId = verifyKey(String(message.key || ''));
      if (!userId) {
        send(socket, { type: 'error', code: 'bad-key', message: 'Sign in with Discord again.' });
        return socket.close(4001, 'bad key');
      }
    }
    let result;
    try {
      result = await authorize(userId);
    } catch (error) {
      logger.warn(`Radio auth check failed: ${error?.message || error}`);
      result = { ok: false, reason: 'The radio could not check your access. Try again shortly.' };
    }
    if (socket.readyState !== socket.OPEN) return;
    if (!result?.ok) {
      if (result?.removed) return removeSocket(socket, result.reason);
      send(socket, { type: 'error', code: 'denied', message: result?.reason || 'You do not have access to this radio channel.' });
      return socket.close(4003, 'denied');
    }
    const kicked = kickedUntil.get(userId) || 0;
    if (kicked > now()) {
      const minutes = Math.max(1, Math.ceil((kicked - now()) / 60_000));
      return removeSocket(socket, `Staff removed you from the radio. You can come back in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    // One live app per member: a newer login replaces the older one.
    for (const other of clients) {
      if (other !== socket && other.radio?.userId === userId) {
        send(other, { type: 'error', code: 'replaced', message: 'Signed in from another radio.' });
        other.close(4002, 'replaced');
      }
    }
    clearTimeout(socket.radioAuthTimer);
    const channel = isChannel(message.channel) ? message.channel : RADIO_MAIN_CHANNEL;
    socket.radio = {
      userId, name: result.name || 'Unit', staff: Boolean(result.staff), profile: result.profile || [], label: String(result.label || ''),
      deaf: false, channel, txChannel: null, scan: new Set(), rateSecond: 0, rateCount: 0, since: now(),
    };
    if (!allowedOn(socket.radio, channel)) socket.radio.channel = RADIO_MAIN_CHANNEL;
    setScan(socket, message.scan);
    if (session) send(socket, { type: 'session', key: session });
    let synced = null;
    try { synced = loadSettings(userId) || null; } catch { synced = null; }
    send(socket, {
      type: 'ready',
      you: { id: userId, name: socket.radio.name, callsign: String(result.callsign || ''), staff: socket.radio.staff, label: socket.radio.label },
      synced,
      game: games.get(userId) || null,
      ...statusFor(socket),
    });
    for (const [id, talker] of talkers) {
      if (listensTo(socket.radio, id)) send(socket, { type: 'talk', id: talker.userId, name: talker.name, active: true, source: 'app', channel: id, signal: signalOf(talker.userId) });
    }
    broadcastStatus();
  }

  wss.on('connection', (socket) => {
    clients.add(socket);
    socket.radioAuthTimer = setTimeout(() => {
      if (!socket.radio) socket.close(4000, 'auth timeout');
    }, authTimeoutMs);
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        if (socket.radio) onAudio(socket, Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message?.type === 'hello' && !socket.radio) {
        // The member is approving in the browser, which takes longer than the normal auth window.
        clearTimeout(socket.radioAuthTimer);
        socket.radioAuthTimer = setTimeout(() => {
          if (!socket.radio) socket.close(4000, 'auth timeout');
        }, signInTimeoutMs);
        const info = loginInfo();
        send(socket, info ? { type: 'login', clientId: info.clientId, redirectUri: info.redirectUri } : { type: 'login', available: false });
        return;
      }
      if (message?.type === 'auth' && !socket.radio && !socket.radioAuthing) {
        socket.radioAuthing = true;
        void onAuth(socket, message).finally(() => { socket.radioAuthing = false; });
        return;
      }
      if (!socket.radio) return;
      if (message.type === 'tx') {
        if (!message.active) endTransmit(socket);
        else if (message.to) startWhisper(socket, message.to);
        else startTransmit(socket, message.channel);
      } else if (message.type === 'channel') {
        switchChannel(socket, message.id);
      } else if (message.type === 'move') {
        moveUnit(socket, message.userId, message.channel);
      } else if (message.type === 'settings') {
        syncSettings(socket, message);
      } else if (message.type === 'scan') {
        setScan(socket, message.ids);
        send(socket, { type: 'status', ...statusFor(socket) });
      } else if (message.type === 'panic') {
        void onPanicPress(socket);
      } else if (message.type === 'deaf') {
        socket.radio.deaf = Boolean(message.active);
        if (socket.radio.deaf) endTransmit(socket);
      } else if (message.type === 'ping') {
        send(socket, { type: 'pong', t: message.t });
      } else if (message.type === 'monitor') {
        void setMonitor(socket, Boolean(message.active));
      } else if (message.type === 'crash') {
        onCrashReport(socket, message);
      }
    });

    socket.on('close', () => {
      clearTimeout(socket.radioAuthTimer);
      endTransmit(socket);
      clients.delete(socket);
      if (socket.radio) broadcastStatus();
    });
    socket.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const socket of clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch { /* ignore */ }
    }
  }, 30_000);
  heartbeat.unref?.();

  // Anti-raid: everyone on the radio must still be in the Discord server with access to the channel.
  async function recheckAll() {
    for (const socket of [...clients]) {
      const userId = socket.radio?.userId;
      if (!userId) continue;
      let result;
      try {
        result = await authorize(userId);
      } catch {
        continue; // Discord hiccup: never kick on a failed lookup.
      }
      if (result?.removed && socket.radio?.userId === userId) {
        logger.info(`Radio closed for ${userId}: ${result.reason || 'no longer allowed'}`);
        endTransmit(socket);
        removeSocket(socket, result.reason);
      } else if (result?.ok && socket.radio?.userId === userId) {
        // Rank or department changed in Melonly: new label, and maybe new channel access.
        socket.radio.staff = Boolean(result.staff);
        socket.radio.profile = result.profile || [];
        socket.radio.label = String(result.label || '');
        enforceAccess(socket);
      }
    }
    if (clients.size) broadcastStatus();
  }
  const recheck = recheckMs > 0 ? setInterval(() => { void recheckAll(); }, recheckMs) : null;
  recheck?.unref?.();

  return {
    /** Attach to an http server's 'upgrade' event. Returns true when the request was for the radio. */
    handleUpgrade(request, socket, head) {
      let pathname = '';
      try {
        pathname = new URL(request.url || '/', 'http://radio.local').pathname;
      } catch {
        return false;
      }
      if (pathname !== RADIO_WS_PATH) return false;
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
      return true;
    },
    /** Audio a Discord member spoke in the radio channel, forwarded to every app. */
    relayDiscordAudio(speakerId, packet) {
      const frame = encodeAudioFrame(speakerId, packet);
      for (const socket of clients) {
        if (hears(socket, speakerId, RADIO_MAIN_CHANNEL)) send(socket, frame);
      }
    },
    /** A member joined or left the Discord channel: their app mutes and stops talking while they are in it. */
    voiceChanged(userId) {
      const talker = talkers.get(RADIO_MAIN_CHANNEL);
      if (talker?.userId === userId && inVoice(userId)) endTransmit(talker.socket);
      for (const socket of clients) {
        if (socket.radio?.userId === userId) {
          send(socket, { type: 'invoice', active: socket.radio.channel === RADIO_MAIN_CHANNEL && Boolean(inVoice(userId)) });
        }
      }
      // The units lists and dispatch status include the Discord channel.
      broadcastStatus();
    },
    /** A message for every signed-in radio, such as an in-game panic. */
    alert(message) {
      broadcast(message?.type === 'panic' ? withMap(message) : message);
    },
    discordSpeaking(speakerId, name, active) {
      if (active) {
        // Speaking in the Discord channel over a dispatcher (on a radio or in Discord).
        if (!isDispatcherName(name)) {
          const appTalker = talkers.get(RADIO_MAIN_CHANNEL);
          const dispatcher = isDispatcherName(appTalker?.name) ? appTalker.name : [...discordTalkers.values()].find(isDispatcherName);
          if (dispatcher) reportTalkOver({ userId: String(speakerId), name }, RADIO_MAIN_CHANNEL, dispatcher);
        }
        discordTalkers.set(speakerId, name);
      } else {
        discordTalkers.delete(speakerId);
        lastHeard.set(RADIO_MAIN_CHANNEL, { name, at: now() });
      }
      broadcast({ type: 'talk', id: speakerId, name, active, source: 'discord', channel: RADIO_MAIN_CHANNEL }, null, RADIO_MAIN_CHANNEL);
      broadcastTalking();
    },
    broadcastStatus,
    recheckAll,
    /** Staff open a temporary event channel (CH 4 on the radios); opening again renames it. */
    openEvent(name, by = 'Staff') {
      const clean = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) || 'Server Event';
      const wasOpen = Boolean(eventChannel);
      eventChannel = { name: clean, by: String(by), openedAt: now() };
      if (!wasOpen) broadcast({ type: 'event', open: true, name: clean });
      broadcastStatus();
      return { name: clean };
    },
    /** Closes the event channel; everyone on it goes back to MAIN. Returns how many radios moved. */
    closeEvent() {
      if (!eventChannel) return 0;
      let moved = 0;
      for (const socket of clients) {
        if (!socket.radio?.userId) continue;
        socket.radio.scan?.delete(RADIO_EVENT_CHANNEL);
        if (socket.radio.channel !== RADIO_EVENT_CHANNEL) continue;
        endTransmit(socket);
        socket.radio.channel = RADIO_MAIN_CHANNEL;
        send(socket, { type: 'moved', by: 'Staff', channel: RADIO_MAIN_CHANNEL, channelName: channelName(RADIO_MAIN_CHANNEL), reason: 'event-closed' });
        send(socket, { type: 'channel', ...statusFor(socket) });
        moved += 1;
      }
      const talker = talkers.get(RADIO_EVENT_CHANNEL);
      if (talker) endTransmit(talker.socket);
      eventChannel = null;
      broadcast({ type: 'event', open: false });
      broadcastStatus();
      return moved;
    },
    /** Channel access rules changed: move anyone who lost access back to MAIN and refresh every radio. */
    accessChanged() {
      for (const socket of clients) enforceAccess(socket);
      broadcastStatus();
    },
    get event() {
      return eventChannel ? { ...eventChannel } : null;
    },
    /**
     * New signal strengths from the coverage map (userId -> 0.1-1, or null for clear). Each radio
     * hears its own bars change, and listeners hear a talker's signal change mid-transmission.
     */
    setSignals(next) {
      const changed = new Set();
      const incoming = new Map([...(next || [])].map(([id, value]) => [String(id), value === null || value === undefined ? null : Number(value)]));
      for (const id of new Set([...signals.keys(), ...incoming.keys()])) {
        const value = incoming.get(id);
        const fresh = value === null || value === undefined || !Number.isFinite(value) ? undefined : value;
        if (signals.get(id) === fresh) continue;
        if (fresh === undefined) signals.delete(id);
        else signals.set(id, fresh);
        changed.add(id);
      }
      if (!changed.size) return 0;
      for (const socket of clients) {
        if (changed.has(socket.radio?.userId)) send(socket, { type: 'status', ...statusFor(socket) });
      }
      for (const [channel, talker] of talkers) {
        if (!changed.has(talker.userId)) continue;
        broadcast({ type: 'talk', id: talker.userId, name: talker.name, active: true, source: 'app', channel, signal: signalOf(talker.userId) }, talker.socket, channel);
      }
      return changed.size;
    },
    /** Game data for one member's radios: { postal, street, speed, heading }, or null when not in game. */
    setGame(userId, info) {
      const id = String(userId);
      if (info) games.set(id, info);
      else games.delete(id);
      for (const socket of clients) {
        if (socket.radio?.userId === id) send(socket, { type: 'game', game: info || null });
      }
    },
    /** A one-off message to every radio one member has open (radio damage, staff notices). */
    sendTo(userId, message) {
      const id = String(userId);
      let sent = 0;
      for (const socket of clients) {
        if (socket.radio?.userId !== id) continue;
        send(socket, message);
        sent += 1;
      }
      return sent;
    },
    /** Server weather (clear, rain, fog, thunderstorm); radios show an alert when it turns wet. */
    setWeather(next) {
      const value = String(next || '');
      if (value === weather) return false;
      weather = value;
      broadcastStatus();
      return true;
    },
    /** Everyone signed in on a radio right now, for the staff panel and the weekly stats. */
    users() {
      return [...clients].filter((socket) => socket.radio?.userId).map((socket) => ({
        userId: socket.radio.userId,
        name: socket.radio.name,
        channel: socket.radio.channel,
        channelName: channelName(socket.radio.channel),
        muted: mutedUsers.has(socket.radio.userId),
        since: socket.radio.since,
        signal: signalOf(socket.radio.userId) ?? null,
        monitor: Boolean(socket.radio.monitor),
        label: socket.radio.label || '',
        profile: socket.radio.profile || [],
      }));
    },
    /** Staff force-mute: the member still hears the radio but can't talk until unmuted. */
    setMuted(userId, active) {
      const id = String(userId);
      if (active) mutedUsers.add(id);
      else mutedUsers.delete(id);
      for (const socket of clients) {
        if (socket.radio?.userId !== id) continue;
        if (active) endTransmit(socket);
        send(socket, { type: 'status', ...statusFor(socket) });
      }
    },
    get muted() {
      return [...mutedUsers];
    },
    /** Staff kick: closes the member's radio and keeps them off for `blockMs`. Returns how many radios closed. */
    kick(userId, blockMs = 0) {
      const id = String(userId);
      if (blockMs > 0) kickedUntil.set(id, now() + blockMs);
      let closed = 0;
      for (const socket of [...clients]) {
        if (socket.radio?.userId !== id) continue;
        endTransmit(socket);
        const minutes = Math.ceil(blockMs / 60_000);
        removeSocket(socket, minutes > 0
          ? `Staff removed you from the radio. You can come back in ${minutes} minute${minutes === 1 ? '' : 's'}.`
          : 'Staff removed you from the radio.');
        closed += 1;
      }
      return closed;
    },
    get listeners() {
      return listenerCount();
    },
    /** Who is talking from an app on the Discord-bridged channel. */
    get talker() {
      const talker = talkers.get(RADIO_MAIN_CHANNEL);
      return talker ? { userId: talker.userId, name: talker.name } : null;
    },
    close() {
      clearInterval(watchdog);
      clearInterval(dispatchWatch);
      clearInterval(heartbeat);
      clearInterval(recheck);
      for (const talker of [...talkers.values()]) endTransmit(talker.socket);
      for (const socket of clients) socket.terminate();
      clients.clear();
      wss.close();
    },
  };
}
