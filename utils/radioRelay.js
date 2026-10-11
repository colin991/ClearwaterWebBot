import { WebSocketServer } from 'ws';
import { logger } from './logger.js';

export const RADIO_WS_PATH = '/radio';
export const RADIO_AUTH_TIMEOUT_MS = 8_000;
export const RADIO_TX_IDLE_MS = 1_500;
export const RADIO_TX_MAX_MS = 120_000;
export const RADIO_MAX_PACKET_BYTES = 1_500;
export const RADIO_MAX_PACKETS_PER_SECOND = 75;
/** How often signed-in radios are re-checked against the Discord server (anti-raid). */
export const RADIO_RECHECK_MS = 5 * 60 * 1000;
const AUDIO_FRAME = 0x01;
/** Radio channels. MAIN is bridged to the Discord voice channel; the others are app-to-app only. */
export const RADIO_MAIN_CHANNEL = 'main';
export const RADIO_SRT_CHANNEL = 'srt';
export const RADIO_FREQ_CHANNEL = 'freq';
const APP_CHANNELS = [
  { id: RADIO_SRT_CHANNEL, name: 'Special Response Team' },
  { id: RADIO_FREQ_CHANNEL, name: 'Frequency Change' },
];
/** One EMER press per radio in this window. */
export const RADIO_PANIC_GAP_MS = 15_000;
export const RADIO_MESSAGE_MAX = 140;
const RADIO_MESSAGE_GAP_MS = 1_000;

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
 * @param {(userId: string, name: string) => Promise<{ name?: string, location?: string, unit?: string, postal?: string }|null>} [options.locatePanic]
 *   who and where a radio's EMER press came from, for the panic alert.
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
  locatePanic = async () => null,
  onPanic = () => {},
  now = () => Date.now(),
  recheckMs = RADIO_RECHECK_MS,
}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  /** @type {Set<import('ws').WebSocket>} */
  const clients = new Set();
  // One talker per channel: channel id -> { socket, userId, name, sink, startedAt, lastPacketAt }
  const talkers = new Map();
  const discordTalkers = new Map(); // userId -> name, members talking in the Discord channel
  const channelList = () => [{ id: RADIO_MAIN_CHANNEL, name: status().channel || 'Radio' }, ...APP_CHANNELS];
  const channelName = (id) => channelList().find((channel) => channel.id === id)?.name || 'Radio';
  const isChannel = (id) => id === RADIO_MAIN_CHANNEL || APP_CHANNELS.some((channel) => channel.id === id);
  // Members sitting in the Discord channel already hear MAIN there, so their app stays quiet on it.
  const hears = (socket, speakerId, channel) => {
    const radio = socket.radio;
    if (!radio?.userId || radio.deaf || radio.userId === speakerId || radio.channel !== channel) return false;
    return channel !== RADIO_MAIN_CHANNEL || !inVoice(radio.userId);
  };
  const watchdog = setInterval(() => {
    const at = now();
    for (const talker of [...talkers.values()]) {
      if (at - talker.lastPacketAt > RADIO_TX_IDLE_MS || at - talker.startedAt > RADIO_TX_MAX_MS) {
        endTransmit(talker.socket);
      }
    }
  }, 250);
  watchdog.unref?.();

  const listenerCount = (channel = null) => [...clients]
    .filter((socket) => socket.radio?.userId && (!channel || socket.radio.channel === channel)).length;

  /** Sends to every signed-in radio, or only those on `channel`. */
  function broadcast(message, except = null, channel = null) {
    for (const socket of clients) {
      if (socket !== except && socket.radio?.userId && (!channel || socket.radio.channel === channel)) send(socket, message);
    }
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
      channels: channelList().map(({ id, name }) => ({ id, name })),
      listeners: listenerCount(channel),
      inVoice: channel === RADIO_MAIN_CHANNEL && Boolean(inVoice(socket.radio.userId)),
    };
  }

  function broadcastStatus() {
    for (const socket of clients) {
      if (socket.radio?.userId) send(socket, { type: 'status', ...statusFor(socket) });
    }
  }

  function endTransmit(socket) {
    const channel = socket.radio?.channel;
    const talker = talkers.get(channel);
    if (!talker || talker.socket !== socket) return;
    talkers.delete(channel);
    try { talker.sink?.end(); } catch { /* ignore */ }
    broadcast({ type: 'talk', id: talker.userId, name: talker.name, active: false, source: 'app' }, null, channel);
  }

  function startTransmit(socket) {
    const { userId, name, channel } = socket.radio;
    const talker = talkers.get(channel);
    if (talker?.socket === socket) return send(socket, { type: 'tx', ok: true });
    if (talker) return send(socket, { type: 'tx', ok: false, reason: 'busy', name: talker.name });
    let sink = null;
    if (channel === RADIO_MAIN_CHANNEL) {
      if (!status().online) return send(socket, { type: 'tx', ok: false, reason: 'offline' });
      sink = openTransmit(userId);
      if (!sink) return send(socket, { type: 'tx', ok: false, reason: 'offline' });
    }
    const at = now();
    talkers.set(channel, { socket, userId, name, sink, startedAt: at, lastPacketAt: at });
    send(socket, { type: 'tx', ok: true });
    broadcast({ type: 'talk', id: userId, name, active: true, source: 'app' }, socket, channel);
  }

  function onAudio(socket, packet) {
    const channel = socket.radio.channel;
    const talker = talkers.get(channel);
    if (!talker || talker.socket !== socket) return;
    if (packet.length === 0 || packet.length > RADIO_MAX_PACKET_BYTES) return;
    const state = socket.radio;
    const second = Math.floor(now() / 1000);
    if (state.rateSecond !== second) {
      state.rateSecond = second;
      state.rateCount = 0;
    }
    state.rateCount += 1;
    if (state.rateCount > RADIO_MAX_PACKETS_PER_SECOND) return;
    talker.lastPacketAt = now();
    talker.sink?.push(packet);
    const frame = encodeAudioFrame(talker.userId, packet);
    for (const other of clients) {
      if (other !== socket && hears(other, talker.userId, channel)) send(other, frame);
    }
  }

  function switchChannel(socket, channel) {
    if (!isChannel(channel) || socket.radio.channel === channel) return;
    endTransmit(socket);
    socket.radio.channel = channel;
    send(socket, { type: 'channel', ...statusFor(socket) });
    const talker = talkers.get(channel);
    if (talker) send(socket, { type: 'talk', id: talker.userId, name: talker.name, active: true, source: 'app' });
    if (channel === RADIO_MAIN_CHANNEL) {
      for (const [id, name] of discordTalkers) send(socket, { type: 'talk', id, name, active: true, source: 'discord' });
    }
    broadcastStatus();
  }

  // Short text to everyone on the sender's channel, the sender included so it lands in their log.
  function onText(socket, text) {
    const clean = String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, RADIO_MESSAGE_MAX);
    if (!clean) return;
    const at = now();
    if (at - (socket.radio.lastTextAt || 0) < RADIO_MESSAGE_GAP_MS) return;
    socket.radio.lastTextAt = at;
    const channel = socket.radio.channel;
    broadcast({
      type: 'text', id: socket.radio.userId, from: socket.radio.name, text: clean,
      channel: channelName(channel), channelId: channel, at,
    }, null, channel);
  }

  // EMER on a radio: alert every radio with who pressed it and, when the game knows, where they are.
  async function onPanicPress(socket) {
    const { userId, name } = socket.radio;
    const at = now();
    if (at - (socket.radio.lastPanicAt || 0) < RADIO_PANIC_GAP_MS) return;
    socket.radio.lastPanicAt = at;
    let found = null;
    try {
      found = await locatePanic(userId, name);
    } catch (error) {
      logger.warn(`Radio panic lookup failed: ${error?.message || error}`);
    }
    const alert = {
      type: 'panic', name: found?.name || name, location: found?.location || '',
      unit: found?.unit || '', postal: found?.postal || '', at, source: 'radio',
    };
    broadcast(alert);
    onPanic(alert);
  }

  function removeSocket(socket, reason) {
    send(socket, { type: 'error', code: 'removed', message: reason || 'You are no longer allowed on this radio.' });
    socket.close(4004, 'removed');
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
    // One live app per member: a newer login replaces the older one.
    for (const other of clients) {
      if (other !== socket && other.radio?.userId === userId) {
        send(other, { type: 'error', code: 'replaced', message: 'Signed in from another radio.' });
        other.close(4002, 'replaced');
      }
    }
    clearTimeout(socket.radioAuthTimer);
    const channel = isChannel(message.channel) ? message.channel : RADIO_MAIN_CHANNEL;
    socket.radio = { userId, name: result.name || 'Unit', deaf: false, channel, rateSecond: 0, rateCount: 0 };
    if (session) send(socket, { type: 'session', key: session });
    send(socket, { type: 'ready', you: { id: userId, name: socket.radio.name }, ...statusFor(socket) });
    const talker = talkers.get(channel);
    if (talker) send(socket, { type: 'talk', id: talker.userId, name: talker.name, active: true, source: 'app' });
    broadcastStatus();
  }

  wss.on('connection', (socket) => {
    clients.add(socket);
    socket.radioAuthTimer = setTimeout(() => {
      if (!socket.radio) socket.close(4000, 'auth timeout');
    }, RADIO_AUTH_TIMEOUT_MS);
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
        if (message.active) startTransmit(socket);
        else endTransmit(socket);
      } else if (message.type === 'channel') {
        switchChannel(socket, message.id);
      } else if (message.type === 'text') {
        onText(socket, message.text);
      } else if (message.type === 'panic') {
        void onPanicPress(socket);
      } else if (message.type === 'deaf') {
        socket.radio.deaf = Boolean(message.active);
      } else if (message.type === 'ping') {
        send(socket, { type: 'pong', t: message.t });
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
      }
    }
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
    /** A member joined or left the Discord channel: their app mutes while they are in it. */
    voiceChanged(userId) {
      for (const socket of clients) {
        if (socket.radio?.userId === userId) {
          send(socket, { type: 'invoice', active: socket.radio.channel === RADIO_MAIN_CHANNEL && Boolean(inVoice(userId)) });
        }
      }
    },
    /** A message for every signed-in radio, such as an in-game panic. */
    alert(message) {
      broadcast(message);
    },
    discordSpeaking(speakerId, name, active) {
      if (active) discordTalkers.set(speakerId, name);
      else discordTalkers.delete(speakerId);
      broadcast({ type: 'talk', id: speakerId, name, active, source: 'discord' }, null, RADIO_MAIN_CHANNEL);
    },
    broadcastStatus,
    recheckAll,
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
      clearInterval(heartbeat);
      clearInterval(recheck);
      for (const talker of [...talkers.values()]) endTransmit(talker.socket);
      for (const socket of clients) socket.terminate();
      clients.clear();
      wss.close();
    },
  };
}
