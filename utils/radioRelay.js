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
  now = () => Date.now(),
  recheckMs = RADIO_RECHECK_MS,
}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  /** @type {Set<import('ws').WebSocket>} */
  const clients = new Set();
  let talker = null; // { socket, userId, name, sink, startedAt, lastPacketAt }
  const discordTalkers = new Map(); // userId -> name, members talking in the Discord channel
  // Members sitting in the Discord channel already hear it there, so their app stays quiet.
  const hears = (socket, speakerId) => {
    const radio = socket.radio;
    return Boolean(radio?.userId) && !radio.deaf && radio.userId !== speakerId && !inVoice(radio.userId);
  };
  const watchdog = setInterval(() => {
    if (!talker) return;
    const at = now();
    if (at - talker.lastPacketAt > RADIO_TX_IDLE_MS || at - talker.startedAt > RADIO_TX_MAX_MS) {
      endTransmit(talker.socket);
    }
  }, 250);
  watchdog.unref?.();

  const listenerCount = () => [...clients].filter((socket) => socket.radio?.userId).length;

  function broadcast(message, except = null) {
    for (const socket of clients) {
      if (socket !== except && socket.radio?.userId) send(socket, message);
    }
  }

  function broadcastStatus() {
    broadcast({ type: 'status', ...status(), listeners: listenerCount() });
  }

  function endTransmit(socket) {
    if (!talker || talker.socket !== socket) return;
    const { userId, name, sink } = talker;
    talker = null;
    try { sink.end(); } catch { /* ignore */ }
    broadcast({ type: 'talk', id: userId, name, active: false, source: 'app' });
  }

  function startTransmit(socket) {
    const { userId, name } = socket.radio;
    if (talker?.socket === socket) return send(socket, { type: 'tx', ok: true });
    if (talker) return send(socket, { type: 'tx', ok: false, reason: 'busy', name: talker.name });
    // One voice at a time: wait while someone is talking in the Discord channel.
    const discordTalker = [...discordTalkers].find(([id]) => id !== userId);
    if (discordTalker) return send(socket, { type: 'tx', ok: false, reason: 'busy', name: discordTalker[1] });
    if (!status().online) return send(socket, { type: 'tx', ok: false, reason: 'offline' });
    const sink = openTransmit(userId);
    if (!sink) return send(socket, { type: 'tx', ok: false, reason: 'offline' });
    const at = now();
    talker = { socket, userId, name, sink, startedAt: at, lastPacketAt: at };
    send(socket, { type: 'tx', ok: true });
    broadcast({ type: 'talk', id: userId, name, active: true, source: 'app' }, socket);
  }

  function onAudio(socket, packet) {
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
    talker.sink.push(packet);
    const frame = encodeAudioFrame(talker.userId, packet);
    for (const other of clients) {
      if (other !== socket && hears(other, talker.userId)) send(other, frame);
    }
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
    socket.radio = { userId, name: result.name || 'Unit', deaf: false, rateSecond: 0, rateCount: 0 };
    if (session) send(socket, { type: 'session', key: session });
    send(socket, { type: 'ready', you: { id: userId, name: socket.radio.name }, ...status(), listeners: listenerCount(), inVoice: Boolean(inVoice(userId)) });
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
        if (hears(socket, speakerId)) send(socket, frame);
      }
    },
    /** A member joined or left the Discord channel: their app mutes while they are in it. */
    voiceChanged(userId) {
      for (const socket of clients) {
        if (socket.radio?.userId === userId) send(socket, { type: 'invoice', active: Boolean(inVoice(userId)) });
      }
    },
    /** A message for every signed-in radio, such as an in-game panic. */
    alert(message) {
      broadcast(message);
    },
    discordSpeaking(speakerId, name, active) {
      if (active) discordTalkers.set(speakerId, name);
      else discordTalkers.delete(speakerId);
      broadcast({ type: 'talk', id: speakerId, name, active, source: 'discord' });
    },
    broadcastStatus,
    recheckAll,
    get listeners() {
      return listenerCount();
    },
    get talker() {
      return talker ? { userId: talker.userId, name: talker.name } : null;
    },
    close() {
      clearInterval(watchdog);
      clearInterval(heartbeat);
      clearInterval(recheck);
      if (talker) endTransmit(talker.socket);
      for (const socket of clients) socket.terminate();
      clients.clear();
      wss.close();
    },
  };
}
