import { createPublicKey, verify, createHash } from 'node:crypto';

// Published by https://apidocs.erlc.gg/event-webhooks (SPKI Ed25519).
export const ERLC_EVENT_PUBLIC_KEY = createPublicKey({
  key: Buffer.from('MCowBQYDK2VwAyEAjSICb9pp0kHizGQtdG8ySWsDChfGqi+gyFCttigBNOA=', 'base64'),
  format: 'der', type: 'spki',
});
export const MAX_EVENT_BYTES = 256 * 1024;

export async function readEventBytes(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_EVENT_BYTES) throw Object.assign(new Error('Event too large'), { status: 413 });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export function verifyErlcEvent(raw, headers, { publicKey = ERLC_EVENT_PUBLIC_KEY, now = Date.now() } = {}) {
  const signature = headers['x-signature-ed25519'];
  const timestamp = headers['x-signature-timestamp'];
  if (!Buffer.isBuffer(raw) || raw.length > MAX_EVENT_BYTES ||
      typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature) ||
      typeof timestamp !== 'string' || !/^\d{10,11}$/.test(timestamp) ||
      Math.abs(now / 1000 - Number(timestamp)) > 300) {
    throw Object.assign(new Error('Invalid webhook signature or timestamp'), { status: 401 });
  }
  if (!verify(null, Buffer.concat([Buffer.from(timestamp), raw]), publicKey, Buffer.from(signature, 'hex'))) {
    throw Object.assign(new Error('Invalid webhook signature'), { status: 401 });
  }
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
  if (!payload || typeof payload !== 'object') throw Object.assign(new Error('Invalid event'), { status: 400 });
  return {
    id: createHash('sha256').update(timestamp).update(signature).update(raw).digest('hex'),
    timestamp, signature, raw: raw.toString('base64'), payload,
  };
}

export function eventHeaders(event) {
  return { 'content-type': 'application/json', 'x-signature-ed25519': event.signature, 'x-signature-timestamp': event.timestamp };
}
