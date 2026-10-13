'use strict';

/**
 * Discord Rich Presence: "Playing Clearwater Radio" on the member's Discord profile while the radio is open.
 * Talks to the Discord desktop app over its local IPC pipe (no extra packages). If Discord isn't running,
 * it quietly tries again later.
 */
const net = require('node:net');
const path = require('node:path');

const RETRY_MS = 30_000;
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;

function pipePath(index) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${index}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return path.join(base, `discord-ipc-${index}`);
}

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function connectPipe(index = 0) {
  return new Promise((resolve, reject) => {
    if (index > 9) return reject(new Error('Discord is not running'));
    const socket = net.createConnection(pipePath(index));
    socket.once('connect', () => resolve(socket));
    socket.once('error', () => { connectPipe(index + 1).then(resolve, reject); });
  });
}

function createPresence() {
  let socket = null;
  let clientId = '';
  let ready = false;
  let activity = null;
  let retry = null;
  let connecting = false;
  let stopped = false;
  const startedAt = Date.now();

  function send() {
    if (!socket || !ready) return;
    socket.write(encode(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: activity ? { ...activity, timestamps: { start: startedAt } } : null },
      nonce: String(Date.now()) + Math.random(),
    }));
  }

  function drop() {
    ready = false;
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
    }
    socket = null;
    if (!stopped && clientId && !retry) {
      retry = setTimeout(() => { retry = null; void connect(); }, RETRY_MS);
      retry.unref?.();
    }
  }

  async function connect() {
    if (stopped || connecting || socket || !clientId) return;
    connecting = true;
    try {
      const next = await connectPipe();
      socket = next;
      let pending = Buffer.alloc(0);
      next.on('data', (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 8) {
          const op = pending.readInt32LE(0);
          const length = pending.readInt32LE(4);
          if (pending.length < 8 + length) break;
          let message = null;
          try { message = JSON.parse(pending.subarray(8, 8 + length).toString()); } catch { /* ignore */ }
          pending = pending.subarray(8 + length);
          if (op === OP_CLOSE) return drop();
          if (message?.evt === 'READY') {
            ready = true;
            send();
          }
        }
      });
      next.on('error', drop);
      next.on('close', drop);
      next.write(encode(OP_HANDSHAKE, { v: 1, client_id: clientId }));
    } catch {
      drop();
    } finally {
      connecting = false;
    }
  }

  return {
    /** @param {{ clientId?: string, details?: string, state?: string, image?: string, imageText?: string, buttons?: {label: string, url: string}[] }|null} next */
    set(next) {
      if (!next || !/^\d{15,22}$/.test(String(next.clientId || ''))) {
        activity = null;
        send();
        return;
      }
      activity = {
        details: String(next.details || '').slice(0, 128) || undefined,
        state: String(next.state || '').slice(0, 128) || undefined,
        assets: next.image ? { large_image: next.image, large_text: String(next.imageText || 'Clearwater Radio').slice(0, 128) } : undefined,
        buttons: Array.isArray(next.buttons) && next.buttons.length ? next.buttons.slice(0, 2) : undefined,
        instance: false,
      };
      if (next.clientId !== clientId) {
        // A different Discord application: start over with it.
        clientId = next.clientId;
        drop();
        clearTimeout(retry);
        retry = null;
      }
      if (socket) send();
      else void connect();
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      activity = null;
      send();
      drop();
    },
  };
}

module.exports = { createPresence };
