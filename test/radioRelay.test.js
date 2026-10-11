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

test('members in the Discord channel cannot talk through the radio until they leave', async () => {
  const harness = await startRelay();
  try {
    const bob = client(harness.url);
    await once(bob.ws, 'open');
    harness.voice.add(BOB);
    bob.send({ type: 'auth', key: createRadioKey(BOB, env) });
    await bob.until(() => bob.messages.find((m) => m.type === 'ready'));
    bob.send({ type: 'tx', active: true });
    const refused = await bob.until(() => bob.messages.find((m) => m.type === 'tx'));
    assert.deepEqual(refused, { type: 'tx', ok: false, reason: 'invoice' });

    harness.voice.delete(BOB);
    harness.relay.voiceChanged(BOB);
    bob.send({ type: 'tx', active: true });
    await bob.until(() => bob.messages.find((m) => m.type === 'tx' && m.ok));

    // Joining the Discord channel mid-transmission ends it.
    const endedBefore = harness.ended;
    harness.voice.add(BOB);
    harness.relay.voiceChanged(BOB);
    await bob.until(() => bob.messages.find((m) => m.type === 'invoice' && m.active));
    assert.equal(harness.ended, endedBefore + 1);

    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('each finished transmission is reported for the talk log', async () => {
  const talked = [];
  const harness = await startRelay({ onTalked: (entry) => talked.push(entry) });
  try {
    const alice = client(harness.url);
    await once(alice.ws, 'open');
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    alice.send({ type: 'tx', active: false });
    alice.send({ type: 'channel', id: 'srt' });
    await alice.until(() => alice.messages.find((m) => m.type === 'channel'));
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.filter((m) => m.type === 'tx' && m.ok).length === 2);
    alice.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(talked.length, 2);
    assert.equal(talked[0].userId, ALICE);
    assert.equal(talked[0].onDiscordChannel, true);
    assert.ok(talked[0].endedAt >= talked[0].startedAt);
    assert.equal(talked[1].channelName, 'Special Response Team');
    assert.equal(talked[1].onDiscordChannel, false, 'closing the radio mid-transmission still logs it');
  } finally {
    await harness.close();
  }
});

test('radios show dispatch active while someone tagged !C is in the Discord channel', async () => {
  const voice = [];
  const harness = await startRelay({ voiceMembers: () => voice, dispatchCheckMs: 20 });
  try {
    const alice = client(harness.url);
    await once(alice.ws, 'open');
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    const ready = await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    assert.equal(ready.dispatch, false);
    voice.push({ id: '333333333333333333', name: 'Carl !C' });
    const active = await alice.until(() => alice.messages.find((m) => m.type === 'status' && m.dispatch === true));
    assert.ok(active.channels[0].members.some((member) => member.name === 'Carl !C'));
    voice.length = 0;
    harness.relay.voiceChanged('333333333333333333');
    await alice.until(() => alice.messages.filter((m) => m.type === 'status').at(-1)?.dispatch === false);
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

test('Special Response Team stays off Discord', async () => {
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

    // Different channels: no shared audio or talk.
    harness.relay.relayDiscordAudio('333333333333333333', Buffer.from([1]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(alice.binary.length, 0, 'Discord audio never reaches SRT');

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

    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('Frequency Change is app-only, and PANIC alerts every radio once per 2 minutes', async () => {
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
    const wait = await alice.until(() => alice.messages.find((m) => m.type === 'panic-wait'));
    assert.ok(wait.seconds > 110 && wait.seconds <= 120, 'the presser is told how long the 2 minute cooldown has left');

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
      { id: BOB, name: 'Bob', app: true, discord: true, talking: false },
      { id: '333333333333333333', name: 'Carl', app: false, discord: true, talking: false },
    ]);
    assert.deepEqual(srt.members, [{ id: ALICE, name: 'Alice', app: true, discord: false, talking: false }]);
    assert.deepEqual(freq.members, []);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('spamming PTT times the member out of talking for a minute, even after reconnecting', async () => {
  let clock = 1_000_000;
  const harness = await startRelay({ now: () => clock });
  try {
    const alice = client(harness.url);
    await once(alice.ws, 'open');
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    const replies = () => alice.messages.filter((m) => m.type === 'tx');
    for (let press = 1; press <= 6; press += 1) {
      alice.send({ type: 'tx', active: true });
      await alice.until(() => replies().length === press);
      alice.send({ type: 'tx', active: false });
      clock += 500;
    }
    assert.deepEqual(replies().slice(0, 5).map((m) => m.ok), [true, true, true, true, true]);
    assert.deepEqual(replies()[5], { type: 'tx', ok: false, reason: 'timeout', seconds: 60 });

    alice.ws.close();
    const again = client(harness.url);
    await once(again.ws, 'open');
    again.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    await again.until(() => again.messages.find((m) => m.type === 'ready'));
    clock += 30_000;
    again.send({ type: 'tx', active: true });
    const blocked = await again.until(() => again.messages.find((m) => m.type === 'tx'));
    assert.equal(blocked.reason, 'timeout');
    assert.equal(blocked.seconds, 30);

    clock += 30_000;
    again.send({ type: 'tx', active: true });
    await again.until(() => again.messages.filter((m) => m.type === 'tx').length === 2);
    assert.equal(again.messages.filter((m) => m.type === 'tx')[1].ok, true, 'talking works again after the minute');
    again.ws.close();
  } finally {
    await harness.close();
  }
});

test('a deafened radio cannot talk, and deafening mid-transmission ends it', async () => {
  const harness = await startRelay();
  try {
    const alice = client(harness.url);
    await once(alice.ws, 'open');
    alice.send({ type: 'auth', key: createRadioKey(ALICE, env) });
    await alice.until(() => alice.messages.find((m) => m.type === 'ready'));
    const replies = () => alice.messages.filter((m) => m.type === 'tx');
    alice.send({ type: 'tx', active: true });
    await alice.until(() => replies().length === 1);
    assert.equal(replies()[0].ok, true);
    alice.send({ type: 'deaf', active: true });
    await alice.until(() => harness.ended === 1);

    alice.send({ type: 'tx', active: true });
    await alice.until(() => replies().length === 2);
    assert.deepEqual(replies()[1], { type: 'tx', ok: false, reason: 'deaf' });

    alice.send({ type: 'deaf', active: false });
    alice.send({ type: 'tx', active: true });
    await alice.until(() => replies().length === 3);
    assert.equal(replies()[2].ok, true, 'undeafened radios can talk again');
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

async function signIn(harness, userId, extra = {}) {
  const radio = client(harness.url);
  await once(radio.ws, 'open');
  radio.send({ type: 'auth', key: createRadioKey(userId, env), ...extra });
  await radio.until(() => radio.messages.find((m) => m.type === 'ready' || m.type === 'error'));
  return radio;
}

test('a !C dispatcher cuts in over anyone, and the radios remember who was last heard', async () => {
  const harness = await startRelay({
    authorize: async (userId) => ({ ok: true, name: userId === ALICE ? 'Alice' : 'Bob !C' }),
  });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    bob.send({ type: 'tx', active: true });
    const cut = await alice.until(() => alice.messages.find((m) => m.type === 'cut'));
    assert.equal(cut.name, 'Bob !C');
    const granted = await bob.until(() => bob.messages.find((m) => m.type === 'tx'));
    assert.equal(granted.ok, true, 'dispatch gets the channel');
    alice.send({ type: 'tx', active: true });
    const busy = await alice.until(() => alice.messages.filter((m) => m.type === 'tx')[1]);
    assert.equal(busy.reason, 'busy', 'nobody cuts in over dispatch');
    bob.send({ type: 'tx', active: false });
    const ended = await alice.until(() => alice.messages.find((m) => m.type === 'talk' && !m.active && m.name === 'Bob !C'));
    assert.equal(ended.channel, 'main');

    alice.send({ type: 'channel', id: 'srt' });
    alice.send({ type: 'channel', id: 'main' });
    const back = await alice.until(() => alice.messages.filter((m) => m.type === 'channel')[1]);
    assert.equal(back.lastHeard.name, 'Bob !C');
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('staff can force-mute and kick a radio, and a kicked member stays off until the time is up', async () => {
  let clock = 5_000_000;
  const harness = await startRelay({ now: () => clock });
  try {
    const alice = await signIn(harness, ALICE);
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.ok));
    harness.relay.setMuted(ALICE, true);
    await alice.until(() => harness.ended === 1);
    const status = await alice.until(() => alice.messages.find((m) => m.type === 'status' && m.muted));
    assert.equal(status.muted, true);
    alice.send({ type: 'tx', active: true });
    const refused = await alice.until(() => alice.messages.filter((m) => m.type === 'tx')[1]);
    assert.deepEqual(refused, { type: 'tx', ok: false, reason: 'muted' });
    assert.deepEqual(harness.relay.users().map((u) => [u.userId, u.muted]), [[ALICE, true]]);
    harness.relay.setMuted(ALICE, false);
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.filter((m) => m.type === 'tx')[2]);
    assert.equal(alice.messages.filter((m) => m.type === 'tx')[2].ok, true);

    assert.equal(harness.relay.kick(ALICE, 5 * 60_000), 1);
    const removed = await alice.until(() => alice.messages.find((m) => m.type === 'error'));
    assert.equal(removed.code, 'removed');
    assert.match(removed.message, /5 minutes/);
    const again = await signIn(harness, ALICE);
    assert.equal(again.messages.find((m) => m.type === 'error')?.code, 'removed', 'kicked members cannot sign straight back in');
    clock += 5 * 60_000 + 1;
    const later = await signIn(harness, ALICE);
    assert.ok(later.messages.find((m) => m.type === 'ready'), 'they can come back after the block');
    later.ws.close();
  } finally {
    await harness.close();
  }
});

test('scan mode hears other channels but talks on its own', async () => {
  const harness = await startRelay();
  try {
    const alice = await signIn(harness, ALICE, { channel: 'main', scan: ['srt', 'main', 'nope'] });
    assert.deepEqual(alice.messages.find((m) => m.type === 'ready').scan, ['srt']);
    const bob = await signIn(harness, BOB, { channel: 'srt' });
    bob.send({ type: 'tx', active: true });
    await bob.until(() => bob.messages.find((m) => m.type === 'tx' && m.ok));
    const talk = await alice.until(() => alice.messages.find((m) => m.type === 'talk' && m.active));
    assert.equal(talk.channel, 'srt');
    bob.ws.send(Buffer.from([7]));
    await alice.until(() => alice.binary.length > 0);
    alice.send({ type: 'scan', ids: [] });
    await alice.until(() => alice.messages.find((m) => m.type === 'status' && Array.isArray(m.scan) && m.scan.length === 0));
    const before = alice.binary.length;
    bob.ws.send(Buffer.from([8]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(alice.binary.length, before, 'scan off: nothing from SRT');
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('whoever is talking is flagged and listed first, on the radio or in the Discord channel', async () => {
  const discord = [{ id: '333333333333333333', name: 'Carl' }];
  const harness = await startRelay({ voiceMembers: () => discord });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    harness.relay.discordSpeaking('333333333333333333', 'Carl', true);
    const carl = await alice.until(() => alice.messages.find((m) => m.type === 'talking' && m.channels.main.length));
    assert.deepEqual(carl.channels, { main: ['333333333333333333'], srt: [], freq: [] });
    harness.relay.broadcastStatus();
    const status = await alice.until(() => alice.messages
      .find((m) => m.type === 'status' && m.channels[0].members[0]?.talking));
    assert.deepEqual(status.channels[0].members.map((m) => [m.name, m.talking]), [['Carl', true], ['Alice', false], ['Bob', false]]);
    harness.relay.discordSpeaking('333333333333333333', 'Carl', false);

    bob.send({ type: 'channel', id: 'srt' });
    await bob.until(() => bob.messages.find((m) => m.type === 'channel'));
    bob.send({ type: 'tx', active: true });
    await bob.until(() => bob.messages.find((m) => m.type === 'tx' && m.ok));
    const talking = await alice.until(() => alice.messages.find((m) => m.type === 'talking' && m.channels.srt.length));
    assert.deepEqual(talking.channels.srt, [BOB], 'radios on other channels learn who is talking too');
    bob.send({ type: 'tx', active: false });
    await alice.until(() => alice.messages.filter((m) => m.type === 'talking').at(-1)?.channels.srt.length === 0 || null);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('the second PTT talks on a scanned channel, and a stuck mic is cut after a minute', async () => {
  let clock = 1_000_000;
  const harness = await startRelay({ now: () => clock });
  try {
    const alice = await signIn(harness, ALICE, { scan: ['srt'] });
    const bob = await signIn(harness, BOB, { channel: 'srt' });
    alice.send({ type: 'tx', active: true, channel: 'srt' });
    const ok = await alice.until(() => alice.messages.find((m) => m.type === 'tx'));
    assert.deepEqual([ok.ok, ok.channel], [true, 'srt']);
    const talk = await bob.until(() => bob.messages.find((m) => m.type === 'talk' && m.active));
    assert.equal(talk.channel, 'srt', 'radios on the scanned channel hear it');
    alice.ws.send(Buffer.from([7, 7]));
    await bob.until(() => bob.binary.length > 0);
    assert.equal(harness.played.length, 0, 'nothing goes into Discord');

    clock += 61_000;
    const cut = await alice.until(() => alice.messages.find((m) => m.type === 'cut'));
    assert.equal(cut.reason, 'stuck');
    await bob.until(() => bob.messages.find((m) => m.type === 'talk' && !m.active));

    // A channel you are not scanning falls back to your own channel.
    alice.send({ type: 'tx', active: true, channel: 'freq' });
    const own = await alice.until(() => alice.messages.filter((m) => m.type === 'tx')[1]);
    assert.equal(own.channel, 'main');
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('whispers reach one unit only, and only dispatch can move a unit to another channel', async () => {
  const carl = '333333333333333333';
  const harness = await startRelay({
    authorize: async (userId) => ({ ok: true, name: { [ALICE]: 'Alice', [BOB]: 'Bob !C', [carl]: 'Carl' }[userId] }),
  });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    const carlRadio = await signIn(harness, carl);
    alice.send({ type: 'tx', active: true, to: carl });
    const ok = await alice.until(() => alice.messages.find((m) => m.type === 'tx'));
    assert.deepEqual([ok.ok, ok.to], [true, carl]);
    const heard = await carlRadio.until(() => carlRadio.messages.find((m) => m.type === 'whisper' && m.active));
    assert.equal(heard.name, 'Alice');
    alice.ws.send(Buffer.from([5, 5]));
    await carlRadio.until(() => carlRadio.binary.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(bob.binary.length, 0, 'nobody else hears a whisper');
    assert.equal(harness.played.length, 0, 'whispers never reach Discord');
    assert.ok(!bob.messages.some((m) => m.type === 'whisper'));
    alice.send({ type: 'tx', active: false });
    await carlRadio.until(() => carlRadio.messages.find((m) => m.type === 'whisper' && !m.active));

    alice.send({ type: 'tx', active: true, to: '444444444444444444' });
    const offline = await alice.until(() => alice.messages.filter((m) => m.type === 'tx')[1]);
    assert.equal(offline.reason, 'whisper-offline');

    alice.send({ type: 'move', userId: carl, channel: 'srt' });
    const refused = await alice.until(() => alice.messages.find((m) => m.type === 'move'));
    assert.equal(refused.reason, 'dispatch-only');
    bob.send({ type: 'move', userId: carl, channel: 'srt' });
    const moved = await carlRadio.until(() => carlRadio.messages.find((m) => m.type === 'moved'));
    assert.deepEqual([moved.by, moved.channel], ['Bob !C', 'srt']);
    const channel = carlRadio.messages.find((m) => m.type === 'channel');
    assert.equal(channel.channelId, 'srt');
    const done = await bob.until(() => bob.messages.find((m) => m.type === 'move'));
    assert.deepEqual([done.ok, done.name], [true, 'Carl']);
    for (const radio of [alice, bob, carlRadio]) radio.ws.close();
  } finally {
    await harness.close();
  }
});

test('settings sync, pending 911 calls, callsigns and the panic map point', async () => {
  const saved = {};
  let clock = 2_000_000;
  const harness = await startRelay({
    now: () => clock,
    authorize: async (userId) => ({ ok: true, name: userId === ALICE ? '1A-12 | Alice' : 'Bob', callsign: userId === ALICE ? '1A-12' : '' }),
    loadSettings: (userId) => saved[userId] || null,
    saveSettings: (userId, value) => { saved[userId] = value; },
    calls: () => [{ id: 'c1', name: 'Civ Sam', since: clock - 90_000, kind: 'discord' }],
    mapPoint: (postal) => (postal === '204' ? { x: 0.28, y: 0.78 } : null),
  });
  try {
    const alice = await signIn(harness, ALICE);
    const ready = alice.messages.find((m) => m.type === 'ready');
    assert.equal(ready.you.callsign, '1A-12');
    assert.equal(ready.synced, null);
    assert.deepEqual(ready.calls, [{ id: 'c1', name: 'Civ Sam', kind: 'discord', detail: '', waited: 90 }]);
    alice.send({ type: 'settings', data: { volume: 40, night: true, scan: ['srt', 'nope'], key: 'secret', listenFx: 'x'.repeat(40) }, updatedAt: clock });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(saved[ALICE], { data: { volume: 40, scan: ['srt'] }, updatedAt: clock });
    alice.ws.close();
    const phone = await signIn(harness, ALICE);
    assert.deepEqual(phone.messages.find((m) => m.type === 'ready').synced.data.volume, 40, 'the other radio gets the saved settings');

    phone.send({ type: 'panic' });
    const panic = await phone.until(() => phone.messages.find((m) => m.type === 'panic'));
    assert.deepEqual(panic.map, { x: 0.28, y: 0.78 });
    phone.ws.close();
  } finally {
    await harness.close();
  }
});

test('signal from the coverage map reaches the radio bars and rides along with a transmission', async () => {
  const harness = await startRelay();
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    assert.equal(alice.messages.find((m) => m.type === 'ready').signal, null, 'clear until the map says otherwise');

    assert.equal(harness.relay.setSignals(new Map([[ALICE, 0.4], [BOB, null]])), 1);
    const status = await alice.until(() => alice.messages.find((m) => m.type === 'status' && m.signal === 0.4));
    assert.equal(status.signal, 0.4);
    assert.equal(harness.relay.setSignals(new Map([[ALICE, 0.4]])), 0, 'no change, nothing sent');
    assert.equal(harness.relay.users().find((u) => u.userId === ALICE).signal, 0.4);

    alice.send({ type: 'tx', active: true });
    const talk = await bob.until(() => bob.messages.find((m) => m.type === 'talk' && m.active && m.id === ALICE));
    assert.equal(talk.signal, 0.4, 'listeners hear how weak the talker is');

    // Driving out of range mid-transmission: listeners get the new signal.
    harness.relay.setSignals(new Map([[ALICE, 0.15]]));
    const weaker = await bob.until(() => bob.messages.find((m) => m.type === 'talk' && m.active && m.signal === 0.15));
    assert.equal(weaker.id, ALICE);

    harness.relay.setSignals(new Map());
    await alice.until(() => alice.messages.filter((m) => m.type === 'status').at(-1)?.signal === null);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('game data reaches only that member, and the server weather rides on the channel status', async () => {
  const harness = await startRelay();
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    assert.equal(alice.messages.find((m) => m.type === 'ready').game, null);

    harness.relay.setGame(ALICE, { postal: '204', street: 'Main St', speed: 35, heading: 'NE' });
    const game = await alice.until(() => alice.messages.find((m) => m.type === 'game'));
    assert.deepEqual(game.game, { postal: '204', street: 'Main St', speed: 35, heading: 'NE' });
    assert.equal(bob.messages.some((m) => m.type === 'game'), false, 'only the member sees their own postal');

    // A radio signing in again gets the last game data straight away.
    const again = await signIn(harness, ALICE);
    assert.equal(again.messages.find((m) => m.type === 'ready').game.postal, '204');
    harness.relay.setGame(ALICE, null);
    await again.until(() => again.messages.find((m) => m.type === 'game' && m.game === null));

    assert.equal(harness.relay.setWeather('rain'), true);
    await bob.until(() => bob.messages.find((m) => m.type === 'status' && m.weather === 'rain'));
    assert.equal(harness.relay.setWeather('rain'), false, 'no change, nothing sent');
    alice.ws.close();
    again.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('a one-off message reaches every radio a member has open, and nobody else', async () => {
  const harness = await startRelay();
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    assert.equal(harness.relay.sendTo(ALICE, { type: 'damage', seconds: 20 }), 1);
    const damage = await alice.until(() => alice.messages.find((m) => m.type === 'damage'));
    assert.equal(damage.seconds, 20);
    assert.equal(harness.relay.sendTo('999999999999999999', { type: 'notice' }), 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(bob.messages.some((m) => m.type === 'damage'), false);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('talking over dispatch is reported, on a radio or in the Discord channel', async () => {
  const talkOvers = [];
  const harness = await startRelay({
    authorize: async (userId) => ({ ok: true, name: userId === ALICE ? 'Alice' : 'Bob !C' }),
    onTalkOver: (event) => talkOvers.push(event),
  });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    bob.send({ type: 'tx', active: true });
    await bob.until(() => bob.messages.find((m) => m.type === 'tx' && m.ok));
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'tx' && m.reason === 'busy'));
    assert.deepEqual(talkOvers.at(-1), { userId: ALICE, name: 'Alice', channel: 'Radio', dispatcher: 'Bob !C' });
    harness.relay.discordSpeaking('333333333333333333', 'Carl', true);
    assert.equal(talkOvers.at(-1).userId, '333333333333333333', 'speaking in Discord over a radio dispatcher');
    bob.send({ type: 'tx', active: false });
    harness.relay.discordSpeaking('333333333333333333', 'Carl', false);

    // A Discord dispatcher speaking: a radio talking on MAIN is talking over them.
    harness.relay.discordSpeaking('444444444444444444', 'Dee !C', true);
    alice.send({ type: 'tx', active: false });
    alice.send({ type: 'tx', active: true });
    await alice.until(() => alice.messages.filter((m) => m.type === 'tx' && m.ok).length >= 1);
    assert.equal(talkOvers.at(-1).dispatcher, 'Dee !C');
    assert.equal(talkOvers.length, 3);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('staff monitor hears every channel, listen-only, and only admins get it', async () => {
  const harness = await startRelay({
    authorize: async (userId) => ({ ok: true, name: userId === ALICE ? 'Alice' : 'Bob', staff: userId === ALICE }),
    isStaff: async (userId) => userId === ALICE,
  });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    assert.equal(alice.messages.find((m) => m.type === 'ready').you.staff, true);
    bob.send({ type: 'monitor', active: true });
    assert.equal((await bob.until(() => bob.messages.find((m) => m.type === 'monitor'))).reason, 'staff-only');

    alice.send({ type: 'monitor', active: true });
    await alice.until(() => alice.messages.find((m) => m.type === 'monitor' && m.active));
    assert.equal(harness.relay.users().find((u) => u.userId === ALICE).monitor, true);
    bob.send({ type: 'channel', id: 'srt' });
    await bob.until(() => bob.messages.find((m) => m.type === 'channel'));
    bob.send({ type: 'tx', active: true });
    await bob.until(() => bob.messages.find((m) => m.type === 'tx' && m.ok));
    bob.ws.send(Buffer.from([7, 7]));
    await alice.until(() => alice.messages.find((m) => m.type === 'talk' && m.channel === 'srt' && m.active));
    await alice.until(() => alice.binary.length > 0);
    alice.send({ type: 'tx', active: true });
    assert.equal((await alice.until(() => alice.messages.find((m) => m.type === 'tx'))).reason, 'monitor');
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('staff open an event channel as CH 4, and closing it moves everyone back to CH 1', async () => {
  const harness = await startRelay();
  try {
    const alice = await signIn(harness, ALICE);
    harness.relay.openEvent('Car Meet', 'staff');
    await alice.until(() => alice.messages.find((m) => m.type === 'event' && m.open));
    const status = await alice.until(() => alice.messages.find((m) => m.type === 'status' && m.event?.name === 'Car Meet'));
    assert.deepEqual(status.channels.map((c) => c.id), ['main', 'srt', 'freq', 'event']);
    alice.send({ type: 'channel', id: 'event' });
    await alice.until(() => alice.messages.find((m) => m.type === 'channel' && m.channelId === 'event'));
    assert.equal(harness.relay.closeEvent(), 1);
    const moved = await alice.until(() => alice.messages.find((m) => m.type === 'moved'));
    assert.equal(moved.reason, 'event-closed');
    assert.equal(harness.relay.users()[0].channel, 'main');
    assert.equal(harness.relay.event, null);
    alice.send({ type: 'channel', id: 'event' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(harness.relay.users()[0].channel, 'main', 'a closed event channel cannot be joined');
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

test('crash reports from a radio reach the staff panel, a few per connection', async () => {
  const crashes = [];
  const harness = await startRelay({ onCrash: (report) => crashes.push(report) });
  try {
    const alice = await signIn(harness, ALICE);
    for (let i = 0; i < 8; i += 1) alice.send({ type: 'crash', message: `boom ${i}`, stack: 'at x', where: 'renderer', version: '1.2.3' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(crashes.length, 5);
    assert.deepEqual([crashes[0].userId, crashes[0].name, crashes[0].message, crashes[0].version], [ALICE, 'Alice', 'boom 0', '1.2.3']);
    alice.ws.close();
  } finally {
    await harness.close();
  }
});

test('dispatch radios get scene timers; other radios do not', async () => {
  const harness = await startRelay({
    authorize: async (userId) => ({ ok: true, name: userId === ALICE ? 'Alice' : 'Bob !C' }),
    scenes: () => [{ id: '333333333333333333', name: 'Carl', channel: 'Traffic Stop 1', since: Date.now() - 65_000 }],
  });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    const ready = bob.messages.find((m) => m.type === 'ready');
    assert.equal(ready.scenes[0].channel, 'Traffic Stop 1');
    assert.ok(ready.scenes[0].seconds >= 65);
    assert.equal('scenes' in alice.messages.find((m) => m.type === 'ready'), false);
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});

test('rank-limited channels are locked for the wrong rank, and losing access moves a radio back to CH 1', async () => {
  let allowed = true;
  const harness = await startRelay({
    authorize: async (userId) => ({ ok: true, name: userId === ALICE ? 'Alice' : 'Bob', label: 'PCSO SGT' }),
    canUse: (radio, channel) => channel !== 'srt' || (radio.userId === ALICE && allowed),
  });
  try {
    const alice = await signIn(harness, ALICE);
    const bob = await signIn(harness, BOB);
    const ready = bob.messages.find((m) => m.type === 'ready');
    assert.equal(ready.channels.find((c) => c.id === 'srt').locked, true);
    assert.equal(ready.channels[0].members.find((m) => m.id === ALICE).label, 'PCSO SGT');
    bob.send({ type: 'channel', id: 'srt' });
    assert.equal((await bob.until(() => bob.messages.find((m) => m.type === 'locked'))).channel, 'srt');

    alice.send({ type: 'channel', id: 'srt' });
    await alice.until(() => alice.messages.find((m) => m.type === 'channel' && m.channelId === 'srt'));
    allowed = false;
    harness.relay.accessChanged();
    const moved = await alice.until(() => alice.messages.find((m) => m.type === 'moved'));
    assert.equal(moved.reason, 'locked');
    assert.equal(harness.relay.users().find((u) => u.userId === ALICE).channel, 'main');
    alice.ws.close();
    bob.ws.close();
  } finally {
    await harness.close();
  }
});
