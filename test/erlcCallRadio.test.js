import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  CALL_RADIO_CHANNELS,
  CALL_RADIO_VOICE,
  CALL_RADIO_VOICE_RATE,
  FD_TONE_PATH,
  classifyRadioCall,
  handleErlcCallEvent,
  isEmergencyCallEvent,
  parseErlcEmergencyCall,
  playRadioCallAnnouncement,
  callRadioChannelId,
  radioCallKey,
  radioCallSpeech,
  radioCallTonePath,
  radioTeam,
  withCallerName,
} from '../utils/erlcCallRadio.js';
import { PRIORITY_BEEP_PATH } from '../utils/priorityRequest.js';

test('classifies LEO, Fire, and DOT in-game calls and skips other teams', () => {
  assert.equal(radioTeam('Police'), 'leo');
  assert.equal(radioTeam('Sheriff'), 'leo');
  assert.equal(radioTeam('Fire'), 'fire');
  assert.equal(radioTeam('DOT'), 'dot');
  assert.equal(radioTeam('Civilian'), null);
  assert.equal(classifyRadioCall({ team: 'Police', description: 'Cash Register Robbery' }).kind, 'leo_server');
  assert.equal(classifyRadioCall({ team: 'Police', description: 'House Robbery' }).kind, 'leo_server');
  assert.equal(classifyRadioCall({ team: 'Sheriff', description: 'ATM robbery in progress' }).kind, 'leo_server');
  assert.equal(classifyRadioCall({ team: 'Police', description: 'someone is shooting' }).kind, 'leo_911');
  assert.equal(classifyRadioCall({ team: 'Fire', description: 'Structure Fire' }).kind, 'fire_structure');
  assert.equal(classifyRadioCall({ team: 'Fire', description: 'Dumper Fire' }), null);
  assert.equal(classifyRadioCall({ team: 'Fire', description: 'Dumpster Fire' }), null);
  assert.equal(classifyRadioCall({ team: 'Fire', description: 'dumpers on fire behind the store' }), null);
  assert.equal(classifyRadioCall({ team: 'Fire', description: 'person trapped in a car' }).kind, 'fire_911');
  assert.equal(classifyRadioCall({ team: 'DOT', description: 'debris in roadway' }).kind, 'dot');
  assert.equal(classifyRadioCall({ team: 'Civilian', description: 'help' }), null);
});

test('builds the spoken scripts without saying beep or fd tone', () => {
  const cash = radioCallSpeech({
    team: 'Police',
    description: 'Cash Register Robbery',
    callerName: 'Colin',
    location: '2083 Park Street',
  });
  assert.equal(
    cash,
    'Cash register robbery reported by Colin at 2083 Park Street nearby units please attach.',
  );
  assert.doesNotMatch(cash, /\[BEEP\]/i);

  const nine = radioCallSpeech({
    team: 'Police',
    description: 'man with a gun',
    location: 'Postal 304',
  });
  assert.equal(nine, 'man with a gun reported at Postal 304 any nearby units please attach.');

  const structure = radioCallSpeech({
    team: 'Fire',
    description: 'Structure Fire',
    location: 'Main Street',
  });
  assert.equal(
    structure,
    'Attention station 48. Attention station 48. Structure Fire reported Main Street, Engine 48, ladder 48. Medic 48, and all command please respond.',
  );

  const fire911 = radioCallSpeech({
    team: 'Fire',
    description: 'smoke in the kitchen',
    location: 'Oak Ave',
  });
  assert.equal(
    fire911,
    'Attention station 48. Attention station 48. smoke in the kitchen reported Oak Ave, Engine 48, ladder 48. Medic 48, and all command please respond.',
  );

  const dot = radioCallSpeech({
    team: 'DOT',
    description: 'stalled truck',
    location: 'I-76',
  });
  assert.equal(dot, 'stalled truck reported at I-76 nearby trucks please respond.');
});

test('uses the priority beep for LEO, the FD tone for Fire, and no tone for DOT', () => {
  assert.equal(existsSync(PRIORITY_BEEP_PATH), true);
  assert.equal(existsSync(FD_TONE_PATH), true);
  assert.equal(CALL_RADIO_VOICE_RATE, 1.15);
  assert.equal(CALL_RADIO_VOICE, 'en-US-BrianNeural');
  assert.equal(radioCallTonePath({ team: 'leo', kind: 'leo_server' }), PRIORITY_BEEP_PATH);
  assert.equal(radioCallTonePath({ team: 'fire', kind: 'fire_structure' }), FD_TONE_PATH);
  assert.equal(radioCallTonePath({ team: 'fire', kind: 'fire_structure' }, CALL_RADIO_CHANNELS.leo), PRIORITY_BEEP_PATH);
  assert.equal(radioCallTonePath({ team: 'dot', kind: 'dot' }), null);
  assert.equal(callRadioChannelId('leo'), CALL_RADIO_CHANNELS.leo);
  assert.equal(callRadioChannelId('fire'), '1514128961951760515');
  assert.equal(callRadioChannelId('dot'), '1514130037052407932');
});

test('parses emergency-call webhooks and ignores in-game ; commands', () => {
  const payload = {
    Type: 'EmergencyCall',
    Team: 'Police',
    Description: 'Cash Register Robbery',
    PositionDescriptor: 'Tool Store',
    Player: 'Colin:99',
    CallNumber: 12,
  };
  assert.equal(isEmergencyCallEvent(payload), true);
  assert.deepEqual(parseErlcEmergencyCall(payload), {
    team: 'Police',
    description: 'Cash Register Robbery',
    location: 'Tool Store',
    callerName: 'Colin',
    callerId: '99',
    callNumber: 12,
    startedAt: 0,
  });
  assert.equal(isEmergencyCallEvent({ Type: 'Command', Player: 'Colin:99', Message: ';ss' }), false);
  assert.equal(isEmergencyCallEvent({ Type: 'Command', Player: 'Colin:99', Command: 'civ' }), false);
  assert.equal(isEmergencyCallEvent({ event: 'CustomCommand', userId: 99, command: 'scene' }), false);
});

test('fills the robber username from the live player list', () => {
  const filled = withCallerName(
    { callerId: '99', callerName: '', description: 'ATM Robbery', team: 'Police' },
    [{ username: 'Colin', robloxId: '99' }],
  );
  assert.equal(filled.callerName, 'Colin');
});

test('handleErlcCallEvent announces a cash register on LEO radio and skips a duplicate', async () => {
  const announced = [];
  const payload = {
    Type: 'EmergencyCall',
    team: 'Police',
    description: 'Cash Register Robbery',
    position_descriptor: 'Park Street',
    caller: 99,
    call_number: 400,
    started_at: 1_700_000_000,
  };
  const deps = {
    now: 10_000,
    snapshot: async () => ({ Players: [{ username: 'Colin', robloxId: '99' }] }),
    announce: async (_client, call, classified) => {
      announced.push({ call, classified, text: radioCallSpeech(call, classified) });
      return { played: true };
    },
  };
  const first = await handleErlcCallEvent(payload, deps);
  const second = await handleErlcCallEvent(payload, { ...deps, now: 11_000 });
  assert.equal(first.handled, true);
  assert.equal(first.classified.kind, 'leo_server');
  assert.equal(announced[0].call.callerName, 'Colin');
  assert.match(announced[0].text, /Cash register robbery reported by Colin at Park Street/);
  assert.equal(second.reason, 'duplicate');
  assert.equal(announced.length, 1);
});

test('the same fire is not re-announced when webhook timestamps change', async () => {
  const announced = [];
  const deps = {
    now: 50_000,
    snapshot: async () => ({ Players: [] }),
    announce: async (_client, call) => {
      announced.push(call);
      return { played: true };
    },
  };
  const wrapped = (timestamp) => ({
    timestamp,
    event: 'EmergencyCall',
    origin: 'Colin:99',
    data: {
      Team: 'Fire',
      Description: 'Structure Fire',
      PositionDescriptor: 'Main Street',
    },
  });
  const first = await handleErlcCallEvent(wrapped(1_700_000_001), deps);
  const second = await handleErlcCallEvent(wrapped(1_700_000_003), { ...deps, now: 52_000 });
  const later = await handleErlcCallEvent(wrapped(1_700_000_010), { ...deps, now: 50_000 + (3 * 60 * 1000) });
  assert.equal(first.handled, true);
  assert.equal(first.classified.kind, 'fire_structure');
  assert.equal(radioCallKey(parseErlcEmergencyCall(wrapped(1))), 'fire|structure fire');
  assert.equal(second.reason, 'duplicate');
  assert.equal(later.reason, 'duplicate');
  assert.equal(announced.length, 1);
});

test('playRadioCallAnnouncement joins, plays the tone, then speech', async () => {
  const order = [];
  const channel = { id: CALL_RADIO_CHANNELS.leo, guild: { voiceAdapterCreator: {} } };
  await playRadioCallAnnouncement(channel, {
    team: 'Police',
    description: 'Cash Register Robbery',
    callerName: 'Colin',
    location: 'Park Street',
  }, classifyRadioCall({ team: 'Police', description: 'Cash Register Robbery' }), {
    join: async () => { order.push('join'); },
    synthesize: async (text) => { order.push(`tts:${text.slice(0, 20)}`); return Buffer.from('mp3'); },
    playQueue: async (_channel, _adapter, clips) => { order.push(`clips:${clips.length}`); },
  });
  assert.equal(order.includes('join'), true);
  assert.equal(order.includes('clips:2'), true);
  assert.ok(order.indexOf('join') < order.indexOf('clips:2'));

  await assert.rejects(
    () => playRadioCallAnnouncement(
      { id: CALL_RADIO_CHANNELS.leo, guild: { voiceAdapterCreator: {} } },
      { team: 'Fire', description: 'Structure Fire', location: 'Main Street' },
      classifyRadioCall({ team: 'Fire', description: 'Structure Fire' }),
      { join: async () => {}, synthesize: async () => Buffer.from('mp3'), playQueue: async () => {} },
    ),
    /refused to play fire audio/,
  );
});

test('playRadioCallAnnouncement waits for the current speak session before joining another channel', async () => {
  const order = [];
  let releaseLeo;
  const leoHold = new Promise((resolve) => { releaseLeo = resolve; });
  const leo = {
    id: CALL_RADIO_CHANNELS.leo,
    guild: { id: 'guild-1', voiceAdapterCreator: {} },
  };
  const fire = {
    id: CALL_RADIO_CHANNELS.fire,
    guild: { id: 'guild-1', voiceAdapterCreator: {} },
  };
  const leoCall = playRadioCallAnnouncement(leo, {
    team: 'Police',
    description: 'Cash Register Robbery',
    callerName: 'Colin',
    location: 'Park Street',
  }, classifyRadioCall({ team: 'Police', description: 'Cash Register Robbery' }), {
    join: async () => { order.push('leo-join'); },
    synthesize: async () => Buffer.from('mp3'),
    playQueue: async () => {
      order.push('leo-speak');
      await leoHold;
      order.push('leo-done');
    },
  });
  const fireCall = playRadioCallAnnouncement(fire, {
    team: 'Fire',
    description: 'Structure Fire',
    location: 'Main Street',
  }, classifyRadioCall({ team: 'Fire', description: 'Structure Fire' }), {
    join: async () => { order.push('fire-join'); },
    synthesize: async () => Buffer.from('mp3'),
    playQueue: async () => { order.push('fire-speak'); },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ['leo-join', 'leo-speak']);
  releaseLeo();
  await leoCall;
  await fireCall;
  assert.deepEqual(order, ['leo-join', 'leo-speak', 'leo-done', 'fire-join', 'fire-speak']);
});
