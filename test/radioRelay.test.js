import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createRadioKey, decodeRadioKey, verifyRadioKey } from '../utils/radioKeys.js';
import { createRadioRelay, decodeAudioFrame, encodeAudioFrame } from '../utils/radioRelay.js';

const env = { RADIO_BOT_TOKEN: 'test-token', RADIO_PUBLIC_URL: 'ws://radio.example:2000/radio' };
const ALICE = '111111111111111111';
const BOB = '222222222222222222';

test('radio sign-in tokens carry the relay URL and only verify with the same secret', () => {
  const key = createRadioKey(ALICE, env);
  assert.ok(key.startsWith('CWR2.'));
  assert.equal(decodeRadioKey(key).url, env.RADIO_PUBLIC_URL);
  assert.equal(verifyRadioKey(key, env), ALICE);
  assert.equal(verifyRadioKey(key, { ...env, RADIO_BOT_TOKEN: 'other' }), null);
  assert.equal(verifyRadioKey(key, { ...env, RADIO_KEY_SECRET: 'override' }), null);
  const forged = decodeRadioKey(key);
  const tampered = 'CWR2.' + Buffer.from(JSON.stringify({ u: forged.url, i: BOB, s: forged.signature })).toString('base64url');
  assert.equal(verifyRadioKey(tampered, env), null);
  assert.equal(createRadioKey(ALICE, { RADIO_BOT_TOKEN: 'x' }), null, 'no public URL means no key');
  assert.equal(createRadioKey('not-an-id', env), null);
  const legacy = 'CWR1.' + Buffer.from(JSON.stringify({ u: forged.url, i: ALICE, s: forged.signature })).toString('base64url');
  assert.equal(verifyRadioKey(legacy, env), null, 'old pasted keys no longer work');
});

test('audio frames round-trip the speaker ID', () => {
  const frame = encodeAudioFrame(BOB, Buffer.from([1, 2, 3]));
  const decoded = decodeAudioFrame(frame);
  assert.equal(decoded.speakerId, BOB);
  assert.deepEqual([...decoded.packet], [1, 2, 3]);
});

async function startRelay(extra = {}) {
  const played = [];
  let ended = 0;
  let online = true;
  const members = new Set([ALICE, BOB]);
  const voice = new Set();
  const relay = createRadioRelay({
    inVoice: (userId) => voice.has(userId),
    locatePanic: async (userId, name) => (userId === ALICE ? { name, location: '120 Main St', unit: '1A-12', postal: '204' } : { name }),
    verifyKey: (key) => verifyRadioKey(key, env),
    exchangeCode: async (code) => {
      if (code === 'alice-code') return ALICE;
      if (code === 'stranger-code') return '333333333333333333';
      throw new Error('bad code');
    },
    createSession: (userId) => createRadioKey(userId, env),
    loginInfo: () => ({ clientId: '444444444444444444', redirectUri: 'http://127.0.0.1:53682/callback' }),
    recheckMs: 0,
    authorize: async (userId) => (members.has(userId)
      ? { ok: true, name: userId === ALICE ? 'Alice' : 'Bob' }
      : { ok: false, removed: true, reason: 'Not in the server.' }),
    status: () => ({ online, channel: 'Radio' }),
    openTransmit: () => ({ push: (packet) => played.push(packet), end: () => { ended += 1; } }),
    ...extra,
  });
  const server = createServer();
  server.on('upgrade', (request, socket, head) => {
    if (!relay.handleUpgrade(request, socket, head)) socket.destroy();
  });
  server.listen(0);
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}/radio`;
  return {
    relay,
    url,
    played,
    voice,
    get ended() { return ended; },
    setOnline(value) { online = value; },
    removeMember(userId) { members.delete(userId); },
    async close() {
      relay.close();
      server.close();
    },
  };
}

function client(url) {
  const ws = new WebSocket(url);
  const messages = [];
  const binary = [];
  const waiters = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) binary.push(data);
    else messages.push(JSON.parse(String(data)));
    for (const waiter of [...waiters]) waiter();
  });
  const until = (predicate) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), 2000);
    const check = () => {
      const found = predicate();
      if (found) {
        clearTimeout(timer);
        waiters.splice(waiters.indexOf(check), 1);
        resolve(found);
      }
    };
    waiters.push(check);
    check();
  });
  return { ws, messages, binary, until, send: (value) => ws.send(typeof value === 'string' ? value : JSON.stringify(value)) };
}

test('relay authenticates apps, lets one talk at a time, and fans audio out', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    const bob = client(harness.url);
    await Promise.all([once(alice.ws, 'open'), once(bob.ws, 'open')]);
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    bob.send({ type: 'auth', key: createRadioKey(BOB, env) });
    const ready = await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    assert.equal(ready.you.name, 'Alice');
    await bob.until(() => bob.messages.find((m) => m.type === 'ready'));

    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    await bob.until(() => bob.messages.find((m) => m.type === 'talk' && m.active && m.id === ALICE));

    bob.send({ type: 'tx', active: true });
    const busy = await bob.until(() => bob.messages.find((m) => m.type === 'tx' && !m.ok));
    assert.equal(busy.reason, 'busy');
    assert.equal(busy.name, 'Alice');

    alice.ws.send(Buffer.from([9, 9, 9]));
    await bob.until(() => bob.binary.length > 0);
    assert.equal(decodeAudioFrame(bob.binary[0]).speakerId, ALICE);
    assert.equal(harness.played.length, 1);
    assert.equal(alice.binary.length, 0, 'talkers do not hear themselves');

    alice.send({ type: 'tx', active: false });
    await bob.until(() => bob.messages.find((m) => m.type === 'talk' && !m.active && m.id === ALICE));
    assert.equal(harness.ended, 1);

    harness.relay.relayDiscordAudio(BOB, Buffer.from([4]));
    await alice.until(() => alice.binary.length > 0);
    assert.equal(bob.binary.length, 1, 'Discord audio is not echoed to the same member');

    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('relay rejects bad keys and refuses to transmit while the bot is offline', async () => {
  const harness = await startRelay();
  try {
    const stranger = client(harness.url);
    await once(stranger.ws, 'open');
    stranger.send({ type: 'auth', key: 'CWR1.nope' });
    const [code] = await once(stranger.ws, 'close');
    assert.equal(code, 4001);

    harness.setOnline(false);
    const alice = client(harness.url);
    await once(alice.ws, 'open');
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    alice.send({ type: 'tx', active: true });
    const denied = await alice.until(() => alice.messages.find((m) => m.type === 'tx'));
    assert.deepEqual([denied.ok, denied.reason], [false, 'offline']);
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

test('Discord sign-in issues a session token and non-members are turned away', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    await once(alice.ws, 'open');
    alice.send({ type: 'hello' });
    const login = await alice.until(() => alice.messages.find((m) => m.type === 'login'));
    assert.equal(login.clientId, '444444444444444444');
    alice.send({ type: 'auth', code: 'alice-code' });
    const session = await alice.until(() => alice.messages.find((m) => m.type === 'session'));
    assert.equal(verifyRadioKey(session.key, env), ALICE);
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    alice.ws.close();

    const stranger = client(harness.url);
    await once(stranger.ws, 'open');
    stranger.send({ type: 'auth', code: 'stranger-code' });
    const [code] = await once(stranger.ws, 'close');
    assert.equal(code, 4004);
    assert.equal(stranger.messages.find((m) => m.type === 'error').code, 'removed');
    assert.equal(stranger.messages.some((m) => m.type === 'session'), false, 'no token for non-members');

    const forged = client(harness.url);
    await once(forged.ws, 'open');
    forged.send({ type: 'auth', code: 'made-up' });
    const [forgedCode] = await once(forged.ws, 'close');
    assert.equal(forgedCode, 4001);
  } finally {
    await harness.close();
  }
});

test('the periodic check closes radios of members who left the server', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    const bob = client(harness.url);
    await Promise.all([once(alice.ws, 'open'), once(bob.ws, 'open')]);
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    bob.send({ type: 'auth', key: createRadioKey(BOB, env) });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    await bob.until(() => bob.messages.find((m) => m.type === 'ready'));
    harness.removeMember(BOB);
    const closed = once(bob.ws, 'close');
    await harness.relay.recheckAll();
    const [code] = await closed;
    assert.equal(code, 4004);
    assert.equal(alice.ws.readyState, WebSocket.OPEN, 'members who are still in the server stay on');
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

test('Discord talkers never block the app, and members in the Discord channel are muted in the app', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    const bob = client(harness.url);
    await Promise.all([once(alice.ws, 'open'), once(bob.ws, 'open')]);
    harness.voice.add(BOB);
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    bob.send({ type: 'auth', key: createRadioKey(BOB, env) });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    const bobReady = await bob.until(() => bob.messages.find((m) => m.type === 'ready'));
    assert.equal(bobReady.inVoice, true);

    // Talking in Discord does not stop an app from keying up.
    harness.relay.discordSpeaking('333333333333333333', 'Carl', true);
    harness.relay.relayDiscordAudio('333333333333333333', Buffer.from([1]));
    await alice.until(() => alice.binary.length > 0);
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    alice.ws.send(Buffer.from([2]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(bob.binary.length, 0, 'a member in the Discord channel gets no app audio');

    harness.voice.delete(BOB);
    harness.relay.voiceChanged(BOB);
    const left = await bob.until(() => bob.messages.find((m) => m.type === 'invoice'));
    assert.equal(left.active, false);
    alice.ws.send(Buffer.from([3]));
    await bob.until(() => bob.binary.length > 0);

    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('Special Response Team stays off Discord, and messages reach only the same channel', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    const bob = client(harness.url);
    await Promise.all([once(alice.ws, 'open'), once(bob.ws, 'open')]);
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env), channel: 'srt' });
    bob.send({ type: 'auth', key: createRadioKey(BOB, env) });
    const ready = await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    assert.equal(ready.channelId, 'srt');
    assert.equal(ready.channel, 'Special Response Team');
    assert.deepEqual(ready.channels.map((c) => c.id), ['main', 'srt', 'freq']);
    await bob.until(() => bob.messages.find((m) => m.type === 'ready'));

    // Different channels: no shared audio, talk or messages.
    harness.relay.relayDiscordAudio('333333333333333333', Buffer.from([1]));
    bob.send({ type: 'text', text: 'main only' });
    await bob.until(() => bob.messages.find((m) => m.type === 'text'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(alice.binary.length, 0, 'Discord audio never reaches SRT');
    assert.equal(alice.messages.some((m) => m.type === 'text'), false);

    // Bob joins SRT; Alice talks: Bob hears it and nothing goes to the Discord bot.
    bob.send({ type: 'channel', id: 'srt' });
    const moved = await bob.until(() => bob.messages.find((m) => m.type === 'channel'));
    assert.equal(moved.listeners, 2);
    harness.setOnline(false); // SRT does not need the bot in voice
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    alice.ws.send(Buffer.from([7]));
    await bob.until(() => bob.binary.length > 0);
    assert.equal(harness.played.length, 0, 'SRT audio is not played into Discord');
    bob.send({ type: 'tx', active: true });
    const busy = await bob.until(() => bob.messages.find((m) => m.type === 'tx' && !m.ok));
    assert.equal(busy.name, 'Alice');

    alice.send({ type: 'text', text: '  10-4\n copy  ' });
    const text = await bob.until(() => bob.messages.find((m) => m.type === 'text' && m.channelId === 'srt'));
    assert.equal(text.text, '10-4 copy');
    assert.equal(text.from, 'Alice');
    await alice.until(() => alice.messages.find((m) => m.type === 'text'));

    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('Frequency Change is app-only, and EMER alerts every radio once per 15 seconds', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    const bob = client(harness.url);
    await Promise.all([once(alice.ws, 'open'), once(bob.ws, 'open')]);
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env), channel: 'freq' });
    bob.send({ type: 'auth', key: createRadioKey(BOB, env), channel: 'freq' });
    const ready = await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    assert.equal(ready.channel, 'Frequency Change');
    await bob.until(() => bob.messages.find((m) => m.type === 'ready'));
    harness.setOnline(false);
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    alice.ws.send(Buffer.from([9]));
    await bob.until(() => bob.binary.length > 0);
    assert.equal(harness.played.length, 0, 'Frequency Change audio is not played into Discord');

    alice.send({ type: 'panic' });
    const panic = await bob.until(() => bob.messages.find((m) => m.type === 'panic'));
    assert.equal(panic.name, 'Alice');
    assert.equal(panic.location, '120 Main St');
    assert.equal(panic.unit, '1A-12');
    assert.equal(panic.postal, '204');
    await alice.until(() => alice.messages.find((m) => m.type === 'panic'));
    alice.send({ type: 'panic' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(bob.messages.filter((m) => m.type === 'panic').length, 1, 'a second press right away is ignored');

    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('a radio approving Discord sign-in in the browser is not cut off by the auth timeout', async () => {
  const harness = await startRelay({ authTimeoutMs: 80, signInTimeoutMs: 400 });
  try {
    const idle = client(harness.url);
    const alice = client(harness.url);
    await Promise.all([once(idle.ws, 'open'), once(alice.ws, 'open')]);
    alice.send({ type: 'hello' });
    await alice.until(() => alice.messages.find((m) => m.type === 'login'));
    const [idleCode] = await once(idle.ws, 'close');
    assert.equal(idleCode, 4000, 'a socket that never signs in still times out');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(alice.ws.readyState, WebSocket.OPEN, 'still open after the normal auth window');
    alice.send({ type: 'auth', code: 'alice-code' });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

test('each channel lists app radios and Discord members together', async () => {
  const discord = [{ id: '333333333333333333', name: 'Carl' }, { id: BOB, name: 'Bob (VC)' }];
  const harness = await startRelay({ voiceMembers: () => discord });
  try {
    const alice = client(harness.url);
    const bob = client(harness.url);
    await Promise.all([once(alice.ws, 'open'), once(bob.ws, 'open')]);
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env), channel: 'srt' });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    bob.send({ type: 'auth', key: createRadioKey(BOB, env) });
    await bob.until(() => bob.messages.find((m) => m.type === 'ready'));
    const status = await alice.until(() => alice.messages
      .find((m) => m.type === 'status' && m.channels[0].members.some((member) => member.id === BOB && member.app)));
    const [main, srt, freq] = status.channels;
    assert.deepEqual(main.members, [
      { id: BOB, name: 'Bob', app: true, discord: true },
      { id: '333333333333333333', name: 'Carl', app: false, discord: true },
    ]);
    assert.deepEqual(srt.members, [{ id: ALICE, name: 'Alice', app: true, discord: false }]);
    assert.deepEqual(freq.members, []);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});
