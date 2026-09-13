import OpusScript from 'opusscript';
import { randomUUID } from 'node:crypto';

// Transient live jitter buffer only. Audio is never written to disk.
const epoch = randomUUID();
const streams = new WeakSet();
let sequence = 0;
let leaseUntil = 0;
let frames = [];
let decodeFailed = false;
const expiryTimer = setInterval(() => {
  frames = frames.filter((frame) => frame.at > Date.now() - 2000);
}, 1000);
expiryTimer.unref();

export function relayDispatchStream(stream, userId, isReady) {
  if (streams.has(stream)) return;
  streams.add(stream);
  let decoder;
  const cleanup = () => {
    decoder?.delete();
    decoder = null;
  };
  stream.on('data', (packet) => {
    if (Date.now() > leaseUntil || !isReady()) {
      cleanup();
      return;
    }
    try {
      decoder ||= new OpusScript(48000, 1, OpusScript.Application.AUDIO);
      const pcm = decoder.decode(packet);
      decodeFailed = false;
      frames.push({ id: ++sequence, at: Date.now(), speaker: userId, pcm: pcm.toString('base64') });
      // Bound memory and payload even when many people transmit simultaneously.
      if (frames.length > 150) frames.splice(0, frames.length - 150);
    } catch {
      decodeFailed = true;
      cleanup();
    }
  });
  stream.once('close', cleanup);
  stream.once('end', cleanup);
  stream.once('error', cleanup);
}

export function readDispatchAudio(cursor, clientEpoch, ready) {
  if (!ready) {
    frames = [];
    leaseUntil = 0;
    return { ready: false, epoch, cursor: sequence, frames: [] };
  }
  leaseUntil = Date.now() + 4000;
  const after = Number(cursor);
  const fresh = cursor == null || !Number.isSafeInteger(after) || after < 0 || clientEpoch !== epoch;
  return {
    ready: true,
    decodeFailed,
    epoch,
    cursor: sequence,
    frames: fresh ? [] : frames.filter((frame) => frame.id > after && frame.at > Date.now() - 1500),
  };
}
