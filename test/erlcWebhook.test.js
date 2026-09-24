import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyErlcEvent, readEventBytes, MAX_EVENT_BYTES, eventHeaders } from '../lib/erlc-webhook.js';
import { createEventsHandler } from '../api/erlc/events.js';
import { createErlcEventRelay, MELONLY_EVENTS_WEBHOOK_URL } from '../utils/erlcEventRelay.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const timestamp = String(Math.floor(Date.now() / 1000));
const raw = Buffer.from('{ "type": "EmergencyCall", "text": "help é 🚓" }\n');
const headers = {
  'x-signature-timestamp': timestamp,
  'x-signature-ed25519': sign(null, Buffer.concat([Buffer.from(timestamp), raw]), privateKey).toString('hex'),
};
const verifyEvent = (body, values) => verifyErlcEvent(body, values, { publicKey });
const event = verifyEvent(raw, headers);

function response() {
  return { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.data = JSON.parse(value); } };
}
function request(body = raw, values = headers) {
  return Object.assign(Readable.from([body.subarray(0, 12), body.subarray(12)]), { method: 'POST', headers: values });
}

test('valid signatures preserve original UTF-8 bytes; tampering and stale replays are rejected', () => {
  assert.deepEqual(Buffer.from(event.raw, 'base64'), raw);
  assert.throws(() => verifyEvent(Buffer.from(JSON.stringify(event.payload)), headers), /signature/);
  assert.throws(() => verifyEvent(raw, {}), /signature/);
  assert.throws(() => verifyEvent(raw, { ...headers, 'x-signature-ed25519': 'aa' }), /signature/);
  assert.throws(() => verifyErlcEvent(raw, headers, { publicKey, now: (Number(timestamp) + 301) * 1000 }), /timestamp/);
});

test('oversized events stop before verification or forwarding', async () => {
  await assert.rejects(readEventBytes(Readable.from([Buffer.alloc(MAX_EVENT_BYTES + 1)])), error => error.status === 413);
});

test('public endpoint forwards only verified bytes with bot authentication and original headers', async () => {
  let calls = 0;
  const handler = createEventsHandler({ env: { BOT_API_URL: 'https://bot.example', BOT_API_KEY: 'test-key' }, verifyEvent,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://bot.example/api/erlc/events');
      assert.deepEqual(options.body, raw);
      assert.equal(options.headers.authorization, 'Bearer test-key');
      assert.equal(options.headers['x-signature-ed25519'], headers['x-signature-ed25519']);
      return new Response(JSON.stringify({ accepted: true, id: event.id }));
    },
  });
  const good = response(); await handler(request(), good);
  assert.equal(good.statusCode, 200);
  const bad = response(); await handler(request(raw, {}), bad);
  assert.equal(bad.statusCode, 401); assert.equal(calls, 1);
});

test('missing bridge, offline receiver and wrong receipts never acknowledge acceptance', async () => {
  for (const options of [
    { env: {} },
    { fetchImpl: async () => new Response('{}', { status: 404 }) },
    { fetchImpl: async () => new Response('{}') },
    { fetchImpl: async () => { throw Error('timeout'); } },
  ]) {
    const handler = createEventsHandler({ env: { BOT_API_URL: 'https://bot.example', BOT_API_KEY: 'test' }, verifyEvent, ...options });
    const res = response(); await handler(request(), res);
    assert.ok(res.statusCode >= 500);
  }
});

test('durable inbox survives restart, deduplicates and forwards byte-for-byte to Melonly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'erlc-relay-'));
  try {
    const path = join(directory, 'events.json');
    let emitted = 0, sent = 0;
    const first = createErlcEventRelay({ path, onEvent: () => { emitted++; } });
    assert.equal((await first.accept(event)).duplicate, false);
    assert.equal((await first.accept(event)).duplicate, true);
    assert.equal(emitted, 1);
    const restarted = createErlcEventRelay({ path, fetchImpl: async (url, options) => {
      sent++;
      assert.equal(url, MELONLY_EVENTS_WEBHOOK_URL);
      assert.equal(MELONLY_EVENTS_WEBHOOK_URL, 'https://erlc-wh.melon.ly/');
      assert.deepEqual(options.body, raw);
      assert.deepEqual(options.headers, eventHeaders(event));
      assert.equal(options.redirect, 'error');
      return new Response('{}');
    } });
    await Promise.all([restarted.tick(), restarted.tick()]);
    assert.equal(sent, 1); assert.equal((await restarted.inspect()).pending, 0);
    assert.equal((await restarted.accept(event)).duplicate, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed Melonly delivery stays pending, honors retry-after, and eventually succeeds', async () => {
  let records = [], now = 1000, calls = 0;
  const relay = createErlcEventRelay({ load: async () => structuredClone(records), save: async data => { records = structuredClone(data); }, now: () => now,
    fetchImpl: async () => ++calls === 1 ? new Response('{}', { status: 429, headers: { 'retry-after': '30' } }) : new Response('{}'),
  });
  await relay.accept(event); await relay.tick();
  assert.equal(records[0].lastStatus, 429);
  await relay.tick(); assert.equal(calls, 1);
  now += 30000; await relay.tick();
  assert.equal((await relay.inspect()).pending, 0); assert.equal(calls, 2);
});

test('failed persistence cannot acknowledge or notify the local consumer', async () => {
  const relay = createErlcEventRelay({ load: async () => [], save: async () => { throw Error('disk full'); }, onEvent: () => assert.fail('not durable') });
  await assert.rejects(relay.accept(event), /disk full/);
});
