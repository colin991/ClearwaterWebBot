import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { civilianVehicles, formatPriorityVehicle, parseErlcKill, parseErlcVehicle } from '../utils/erlc.js';
import {
  allPriorityParticipantsDied,
  createPriorityRequestService,
  parsePriorityButton,
  canApprovePriorityExtraTime,
  extraTimeCommandSeconds,
  endedPayload,
  extraTimeResolvedPayload,
  handlePriorityRequest,
  hasBlockingPriority,
  PRIORITY_ANNOUNCE_VOICE_CHANNEL_ID,
  PRIORITY_BEEP_PATH,
  PRIORITY_VOICE,
  PRIORITY_VOICE_RATE,
  playPriorityStartAnnouncement,
  PRIORITY_PENDING_MS,
  PRIORITY_PEACE_SECONDS,
  PRIORITY_REQUEST_SECONDS,
  PRIORITY_REQUEST_STAFF_ROLE,
  PRIORITY_MAX_PARTICIPANTS,
  PRIORITY_MAX_VEHICLES,
  PRIORITY_TYPE_MAX,
  PRIORITY_CIVILIAN_KILL_PM,
  civilianKillersOutsidePriority,
  priorityStartMessageCommand,
  priorityStartSpeech,
  mergePriorityParticipants,
  resolvePriorityPlayers,
  resolvePriorityVehicles,
  uniqueMentionUsers,
} from '../utils/priorityRequest.js';

test('civilian vehicles keep civilian-owned cars and format the staff label', () => {
  const players = [
    { username: 'CivOne', robloxId: '1', team: 'Civilian' },
    { username: 'Cop', robloxId: '2', team: 'Sheriff' },
  ];
  const vehicles = [
    parseErlcVehicle({ Name: 'Navara Horizon 2013', Owner: 'CivOne:1', Texture: 'Really black', Plate: 'GOV-884' }),
    parseErlcVehicle({ Name: 'Interceptor', Owner: 'Cop:2', Texture: 'Standard', Plate: 'SH-1' }),
  ];
  const civ = civilianVehicles(vehicles, players);
  assert.equal(civ.length, 1);
  assert.equal(formatPriorityVehicle(civ[0]), 'Really black Navara Horizon 2013 [GOV-884]');
});

test('typed search and dropdown values resolve in-game players', () => {
  const players = [
    { username: 'Alpha', robloxId: '1' },
    { username: 'Bravo', robloxId: '2' },
    { username: 'Charlie', robloxId: '3' },
  ];
  const picked = resolvePriorityPlayers(players, ['0'], 'char');
  assert.deepEqual(picked.map((player) => player.username), ['Alpha', 'Charlie']);
});

test('typed search resolves extra civilian vehicles', () => {
  const vehicles = [
    { name: 'Navara', ownerUsername: 'Alpha', ownerRobloxId: '1', texture: 'Black', plate: 'AAA' },
    { name: 'Bullhorn', ownerUsername: 'Bravo', ownerRobloxId: '2', texture: 'Sand yellow metallic', plate: 'BBB' },
  ];
  const picked = resolvePriorityVehicles(vehicles, ['0'], 'bull');
  assert.deepEqual(picked.map((vehicle) => vehicle.name), ['Navara', 'Bullhorn']);
  assert.deepEqual(resolvePriorityVehicles(vehicles, ['none'], '').map((vehicle) => vehicle.name), []);
});

test('priority requests cap at 4 participants and 2 cars', () => {
  const players = ['A', 'B', 'C', 'D', 'E'].map((username, index) => ({ username, robloxId: String(index + 1) }));
  const vehicles = ['Navara', 'Bullhorn', 'Interceptor'].map((name, index) => ({
    name,
    ownerUsername: `Owner${index}`,
    ownerRobloxId: String(index + 1),
    texture: 'Black',
    plate: `P${index}`,
  }));
  assert.equal(PRIORITY_MAX_PARTICIPANTS, 4);
  assert.equal(PRIORITY_MAX_VEHICLES, 2);
  assert.deepEqual(resolvePriorityPlayers(players, ['0'], 'B, C, D, E').map((player) => player.username), ['A', 'B', 'C', 'D']);
  assert.equal(resolvePriorityPlayers(players, ['0'], 'B, C, D, E', { limit: Infinity }).length, 5);
  assert.deepEqual(resolvePriorityVehicles(vehicles, ['0'], 'Bullhorn, Interceptor').map((vehicle) => vehicle.name), ['Navara', 'Bullhorn']);
  assert.equal(resolvePriorityVehicles(vehicles, ['0'], 'Bullhorn, Interceptor', { limit: Infinity }).length, 3);
});

test('mergePriorityParticipants always includes the requester first', () => {
  const selected = [
    { username: 'Partner', robloxId: '2' },
    { username: 'Host', robloxId: '1' },
  ];
  const merged = mergePriorityParticipants(selected, { username: 'Host', robloxId: '1' });
  assert.deepEqual(merged.map((player) => player.username), ['Host', 'Partner']);
});

test('mergePriorityParticipants adds a requester who was not selected', () => {
  const selected = ['A', 'B', 'C', 'D'].map((username, index) => ({ username, robloxId: String(index + 2) }));
  const merged = mergePriorityParticipants(selected, { username: 'Host', robloxId: '1' });
  assert.equal(merged.length, PRIORITY_MAX_PARTICIPANTS);
  assert.equal(merged[0].username, 'Host');
  assert.deepEqual(merged.map((player) => player.username), ['Host', 'A', 'B', 'C']);
});

test('submitRequest rejects more than 4 participants or 2 cars', async () => {
  const svc = createPriorityRequestService({
    now: () => 1,
    load: async () => ({ request: null }),
    save: async () => {},
    send: async () => {},
    snapshot: async () => ({}),
    postStaff: async () => ({ id: 'm' }),
    editStaff: async () => {},
    dmUser: async () => {},
  });
  await assert.rejects(
    () => svc.submitRequest({
      user: { id: 'u1', username: 'x' },
      selectedPlayers: [1, 2, 3, 4, 5].map((n) => ({ username: `P${n}`, robloxId: String(n) })),
      selectedVehicles: [],
      background: 'bg',
      details: 'd',
    }),
    /4 participants/,
  );
  await assert.rejects(
    () => svc.submitRequest({
      user: { id: 'u1', username: 'x' },
      selectedPlayers: [{ username: 'P1', robloxId: '1' }],
      selectedVehicles: [
        { name: 'A', ownerUsername: 'o', texture: 'Black', plate: '1' },
        { name: 'B', ownerUsername: 'o', texture: 'Black', plate: '2' },
        { name: 'C', ownerUsername: 'o', texture: 'Black', plate: '3' },
      ],
      background: 'bg',
      details: 'd',
    }),
    /2 cars/,
  );
});

test('priority form modal placeholders tell people they can search', async () => {
  const stored = { request: null };
  const svc = createPriorityRequestService({
    now: () => 1,
    load: async () => stored,
    save: async () => {},
    send: async () => {},
    snapshot: async () => ({}),
    postStaff: async () => ({ id: 'm' }),
    editStaff: async () => {},
    dmUser: async () => {},
  });
  const modal = await svc.openForm({ user: { id: 'u1' } }, {
    players: [{ username: 'Alpha', robloxId: '1', team: 'Civilian' }],
    vehicles: [{ name: 'Navara', ownerUsername: 'Alpha', texture: 'Black', plate: '1' }],
  });
  const payload = modal.toJSON();
  const json = JSON.stringify(payload);
  assert.match(json, /max 4 people including you/);
  assert.match(json, /max 2 cars/);
  assert.match(json, /Max 4 participants including you, and 2 cars total/);
  assert.match(json, /Type to search civilian vehicles/);
  assert.match(json, /"label":"Priority Type"/);
  assert.match(json, /"max_length":25/);
  assert.doesNotMatch(json, /Priority Details/);
  assert.equal(PRIORITY_TYPE_MAX, 25);
  assert.match(json, /"value":"none"/);
  assert.match(json, /Alpha · /);
  const vehicleSelect = payload.components
    .map((label) => label.component)
    .find((component) => component?.custom_id === 'vehs');
  assert.equal(vehicleSelect.max_values, 1);
  assert.equal(vehicleSelect.min_values, 1);
  assert.equal(vehicleSelect.required, true);
});

test('priority Discord mentions drop duplicate user ids', () => {
  assert.deepEqual(uniqueMentionUsers('111', ['111', '222'], '222', ''), ['111', '222']);
});

test('pending and active requests block a new submission', () => {
  assert.equal(hasBlockingPriority({ status: 'pending' }), true);
  assert.equal(hasBlockingPriority({ status: 'active' }), true);
  assert.equal(hasBlockingPriority({ status: 'denied' }), false);
  assert.equal(hasBlockingPriority({ status: 'voided' }), false);
});

test('extra time adds minutes onto remaining seconds', () => {
  assert.equal(extraTimeCommandSeconds(10_000, 5, 0), 310);
  assert.equal(extraTimeCommandSeconds(0, 5, 10_000), 300);
});

test('priority ends only after every listed participant has died', () => {
  const startedAt = 1_000_000;
  const people = [
    { username: 'Host', robloxId: '99' },
    { username: 'Partner', robloxId: '88' },
  ];
  const hostKill = [parseErlcKill({ Killed: 'Host:99', Timestamp: (startedAt + 1000) / 1000 })];
  assert.equal(allPriorityParticipantsDied({
    kills: hostKill, participants: people, startedAt,
  }), false);
  assert.equal(allPriorityParticipantsDied({
    kills: [
      ...hostKill,
      parseErlcKill({ Killed: 'Partner:88', Timestamp: (startedAt + 2000) / 1000 }),
    ],
    participants: people,
    startedAt,
  }), true);
  assert.equal(allPriorityParticipantsDied({
    kills: hostKill, participants: [{ username: 'Host', robloxId: '99' }], startedAt,
  }), true);
});

function serviceFixture(request, extras = {}) {
  const commands = [];
  const dms = [];
  const staffEdits = [];
  let time = extras.time || 1_000_000;
  const stored = { request };
  const svc = createPriorityRequestService({
    now: () => time,
    load: async () => stored,
    save: async value => { stored.request = value.request; },
    send: extras.send || (async command => { commands.push(command); }),
    snapshot: async () => extras.server || { KillLogs: [] },
    postStaff: async () => ({ id: 'msg1' }),
    editStaff: async (channelId, messageId, payload) => {
      staffEdits.push({ channelId, messageId, payload });
    },
    dmUser: async (id, payload) => { dms.push({ id, payload }); },
    announceStart: extras.announceStart,
    resolveDiscordIds: extras.resolveDiscordIds || (async () => extras.discordIds || new Map()),
    onError: extras.onError || (error => { throw error; }),
  });
  return { svc, commands, dms, staffEdits, stored, setTime: value => { time = value; } };
}

test('start speech uses requester, vehicles, and priority type at a normal pace', () => {
  const request = {
    requesterUsername: 'HostUser',
    details: 'bank robbery downtown',
    vehicles: ['Really black Navara [GOV-884]'],
  };
  assert.equal(
    priorityStartSpeech(request),
    'A new priority has been started by HostUser, vehicle description and priority is as follows: Really black Navara [GOV-884], and bank robbery downtown.',
  );
  assert.equal(
    priorityStartMessageCommand(request),
    ':h The priority timer is active, please refrain from triggering any priorities at this time.',
  );
  const long = { requesterUsername: 'HostUser', details: 'abcdefghijklmnopqrstuvwxyz', vehicles: [] };
  assert.equal(
    priorityStartSpeech(long),
    'A new priority has been started by HostUser, vehicle description and priority is as follows: no vehicle, and abcdefghijklmnopqrstuvwxy.',
  );
});

test('new pending requests ping the priority role', async () => {
  const posts = [];
  const svc = createPriorityRequestService({
    now: () => 1,
    load: async () => ({ request: null }),
    save: async () => {},
    send: async () => {},
    snapshot: async () => ({}),
    postStaff: async (payload) => {
      posts.push(payload);
      return { id: 'm' };
    },
    editStaff: async () => {},
    dmUser: async () => {},
  });
  const request = await svc.submitRequest({
    user: { id: 'u1', username: 'DiscName' },
    selectedPlayers: [{ username: 'RobloxHost', robloxId: '99' }],
    selectedVehicles: [],
    background: 'bg',
    details: 'abcdefghijklmnopqrstuvwxyz extra',
  });
  const json = JSON.stringify(posts[0]);
  assert.match(json, new RegExp(`<@&${PRIORITY_REQUEST_STAFF_ROLE}>`));
  assert.deepEqual(posts[0].allowedMentions.roles, [PRIORITY_REQUEST_STAFF_ROLE]);
  assert.deepEqual(request.participants.map((player) => player.username), ['DiscName', 'RobloxHost']);
  assert.equal(request.details, 'abcdefghijklmnopqrstuvwxy');
  assert.match(json, /\*\*Priority Type:\*\* abcdefghijklmnopqrstuvwxy/);
  assert.doesNotMatch(json, /Priority Details/);
});

test('approve starts a 30 minute in-game timer and DMs the requester', async () => {
  const f = serviceFixture({
    id: 'p1',
    status: 'pending',
    requesterId: 'u1',
    requesterUsername: 'HostUser',
    details: 'bank robbery downtown',
    pendingExpiresAt: 9e12,
    staffMessageId: 'm',
  });
  await f.svc.approve('p1', { id: 'anyone' });
  assert.equal(f.commands[0], `:prty ${PRIORITY_REQUEST_SECONDS}`);
  assert.equal(f.commands[1], ':h The priority timer is active, please refrain from triggering any priorities at this time.');
  assert.equal(f.dms[0].id, 'u1');
  assert.match(f.dms[0].payload.components[0].components[2].content, /Priority Started/);
});

test('priority voice uses Onyx at 1.15 and the radio beep mp3', () => {
  assert.equal(PRIORITY_VOICE, 'onyx');
  assert.equal(PRIORITY_VOICE_RATE, 1.15);
  assert.match(PRIORITY_BEEP_PATH, /priority-beep\.mp3$/);
  assert.equal(existsSync(PRIORITY_BEEP_PATH), true);
});

test('voice talk starts even if the in-game command queue is slow', async () => {
  let releaseSend;
  const sendGate = new Promise((resolve) => { releaseSend = resolve; });
  let voiceStarted = false;
  const f = serviceFixture({
    id: 'p1',
    status: 'pending',
    requesterId: 'u1',
    requesterUsername: 'HostUser',
    details: 'bank robbery downtown',
    pendingExpiresAt: 9e12,
    staffMessageId: 'm',
  }, {
    send: async (command) => {
      await sendGate;
      f.commands.push(command);
    },
    announceStart: async () => { voiceStarted = true; },
  });
  const done = f.svc.approve('p1', { id: 'anyone' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(voiceStarted, true);
  releaseSend();
  await done;
  assert.equal(f.commands[0], `:prty ${PRIORITY_REQUEST_SECONDS}`);
  assert.equal(f.commands[1], ':h The priority timer is active, please refrain from triggering any priorities at this time.');
});

test('priority voice joins the LEO channel before waiting on TTS', async () => {
  const order = [];
  const channel = { id: PRIORITY_ANNOUNCE_VOICE_CHANNEL_ID, guild: { voiceAdapterCreator: {} } };
  await playPriorityStartAnnouncement(channel, {
    requesterUsername: 'HostUser',
    details: 'bank',
    vehicles: ['car'],
  }, {
    join: async () => { order.push('join'); },
    synthesize: async () => {
      order.push('tts-start');
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push('tts-done');
      return Buffer.from('mp3');
    },
    play: async (_ch, _adapter, audio) => {
      order.push(Buffer.isBuffer(audio) ? 'speech' : 'beep');
    },
    beepPath: '/beep.mp3',
  });
  assert.equal(PRIORITY_ANNOUNCE_VOICE_CHANNEL_ID, '1514128904783139018');
  assert.equal(order[0], 'join');
  assert.ok(order.indexOf('beep') > order.indexOf('tts-start'));
  assert.ok(order.indexOf('beep') < order.indexOf('tts-done'));
  assert.ok(order.indexOf('speech') > order.indexOf('tts-done'));
});

test('extra time approve extends the in-game timer', async () => {
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    startedAt: 1_000_000,
    endsAt: 1_000_000 + 600_000,
    staffMessageId: 'm',
  });
  await f.svc.addApprovedTime('p1', 1);
  assert.equal(f.commands[0], ':prty 660');
  assert.match(f.dms[0].payload.components[0].components[2].content, /Extra Time Approved/);
});

test('resolved extra-time cards drop the approve and deny buttons', () => {
  const payload = extraTimeResolvedPayload({
    requesterId: 'u1',
    submittedAt: 1,
    endsAt: 2,
  }, 1, true, 'anyone');
  const json = JSON.stringify(payload);
  assert.match(json, /Priority Extra Time — Approved/);
  assert.doesNotMatch(json, /Approve time/);
  assert.doesNotMatch(json, /Deny time/);
});

test('priority button ids keep approve distinct from deny', () => {
  assert.deepEqual(parsePriorityButton('prq:approve:p1'), { action: 'approve', requestId: 'p1', extraMinutes: null });
  assert.deepEqual(parsePriorityButton('prq:deny:p1'), { action: 'deny', requestId: 'p1', extraMinutes: null });
  assert.deepEqual(parsePriorityButton('prq:timeok:p1:1'), { action: 'timeok', requestId: 'p1', extraMinutes: 1 });
  assert.deepEqual(parsePriorityButton('prq:timeno:p1:1'), { action: 'timeno', requestId: 'p1', extraMinutes: 1 });
  assert.equal(parsePriorityButton('prq:approve:p1').action === 'deny', false);
});

test('approve button starts the timer instead of denying', async () => {
  const f = serviceFixture({
    id: 'p1',
    status: 'pending',
    requesterId: 'u1',
    requesterUsername: 'HostUser',
    details: 'bank robbery downtown',
    pendingExpiresAt: 9e12,
    staffMessageId: 'm',
  });
  const edits = [];
  const interaction = {
    customId: 'prq:approve:p1',
    user: { id: 'anyone' },
    member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    deferred: false,
    replied: false,
    async deferUpdate() { interaction.deferred = true; },
    async editReply(payload) { edits.push(payload); },
    async followUp() {},
    async reply() {},
    client: { priorityRequest: f.svc },
  };
  assert.equal(await handlePriorityRequest(interaction), true);
  assert.equal(f.commands[0], `:prty ${PRIORITY_REQUEST_SECONDS}`);
  const json = JSON.stringify(edits[0]);
  assert.match(json, /Priority Request — Active/);
  assert.doesNotMatch(json, /Denied/);
});

test('priority extra time can be approved by staff or role 1515107822432419971', () => {
  assert.equal(canApprovePriorityExtraTime({
    permissions: { has: () => false },
    roles: { cache: { has: (id) => id === PRIORITY_REQUEST_STAFF_ROLE } },
  }), true);
  assert.equal(canApprovePriorityExtraTime({
    permissions: { has: () => true },
    roles: { cache: { has: () => false } },
  }), true);
  assert.equal(canApprovePriorityExtraTime({
    permissions: { has: () => false },
    roles: { cache: { has: () => false } },
  }), false);
});

test('the priority role can approve extra time and the clicked message updates', async () => {
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    startedAt: 1_000_000,
    endsAt: 1_000_000 + 600_000,
    staffMessageId: 'm',
  });
  const edits = [];
  const interaction = {
    customId: 'prq:timeok:p1:1',
    user: { id: 'anyone' },
    member: {
      permissions: { has: () => false },
      roles: { cache: { has: (id) => id === PRIORITY_REQUEST_STAFF_ROLE } },
    },
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
    deferred: false,
    replied: false,
    async deferUpdate() { interaction.deferred = true; },
    async editReply(payload) { edits.push(payload); },
    async followUp() {},
    async reply() {},
    client: { priorityRequest: f.svc },
  };
  assert.equal(await handlePriorityRequest(interaction), true);
  assert.equal(f.commands[0], ':prty 660');
  assert.equal(edits.length, 1);
  assert.match(JSON.stringify(edits[0]), /Priority Extra Time — Approved/);
});

test('people without staff or the priority role cannot approve extra time', async () => {
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    startedAt: 1_000_000,
    endsAt: 1_000_000 + 600_000,
    staffMessageId: 'm',
  });
  const replies = [];
  const interaction = {
    customId: 'prq:timeok:p1:1',
    user: { id: 'anyone' },
    member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
    deferred: false,
    replied: false,
    async deferUpdate() { interaction.deferred = true; },
    async editReply() {},
    async followUp(payload) { replies.push(payload); },
    async reply() {},
    client: { priorityRequest: f.svc },
  };
  assert.equal(await handlePriorityRequest(interaction), true);
  assert.deepEqual(f.commands, []);
  assert.match(String(replies[0]?.content || ''), /priority role/);
});

test('void button rewrites the card before in-game commands finish', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const commands = [];
  const edits = [];
  const stored = {
    request: {
      id: 'p1',
      status: 'active',
      requesterId: 'u1',
      startedAt: 1,
      endsAt: 9e12,
      staffMessageId: 'm',
    },
  };
  const svc = createPriorityRequestService({
    now: () => 2,
    load: async () => stored,
    save: async (value) => { stored.request = value.request; },
    send: async (command) => {
      commands.push(command);
      if (command === ':prty 0') await held;
    },
    snapshot: async () => ({}),
    postStaff: async () => ({ id: 'm' }),
    editStaff: async () => {
      throw new Error('staff fetch should not block the Void button');
    },
    dmUser: async () => {},
    onError: () => {},
  });
  const interaction = {
    customId: 'prq:void:p1',
    user: { id: 'staff' },
    member: { permissions: { has: () => true }, roles: { cache: { has: () => false } } },
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
    deferred: false,
    replied: false,
    async deferUpdate() { interaction.deferred = true; },
    async editReply(payload) { edits.push(payload); },
    async followUp() {},
    async reply() {},
    client: { priorityRequest: svc },
  };
  const sawEdit = new Promise((resolve) => {
    const original = interaction.editReply;
    interaction.editReply = async (payload) => {
      await original(payload);
      resolve();
    };
  });
  const finished = handlePriorityRequest(interaction);
  await Promise.race([
    sawEdit,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Void card did not update before in-game commands finished')), 100)),
  ]);
  assert.equal(interaction.deferred, true);
  assert.equal(edits.length, 1);
  assert.match(JSON.stringify(edits[0]), /Priority Request — Voided/);
  assert.equal(stored.request.status, 'voided');
  release();
  await finished;
});

test('void runs prty 0 then a 10 minute peace timer and DMs the requester', async () => {
  const f = serviceFixture({
    id: 'p1', status: 'active', requesterId: 'u1', startedAt: 1, endsAt: 9e12, staffMessageId: 'm',
  });
  await f.svc.voidActive('p1', { id: 'staff' });
  assert.deepEqual(f.commands, [':prty 0', `:pt ${PRIORITY_PEACE_SECONDS}`]);
  assert.match(f.dms[0].payload.components[0].components[2].content, /Voided/);
});

test('unanswered pending requests auto-deny after 25 minutes', async () => {
  const f = serviceFixture({
    id: 'p1', status: 'pending', requesterId: 'u1', pendingExpiresAt: 1_000_000 + PRIORITY_PENDING_MS, staffMessageId: 'm',
  });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'pending');
  f.setTime(1_000_000 + PRIORITY_PENDING_MS);
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'denied');
  assert.deepEqual(f.commands, []);
});

test('all listed deaths end the running priority immediately and start peace timer', async () => {
  const startedAt = 1_000_000;
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    requesterRobloxId: '99',
    requesterUsername: 'Host',
    participants: [
      { username: 'Host', robloxId: '99' },
      { username: 'Partner', robloxId: '88' },
    ],
    startedAt,
    endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
    staffMessageId: 'm',
  }, {
    time: startedAt + 5000,
    server: {
      KillLogs: [
        { Killed: 'Host:99', Timestamp: Math.floor((startedAt + 1000) / 1000) },
        { Killed: 'Partner:88', Timestamp: Math.floor((startedAt + 2000) / 1000) },
      ],
    },
  });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'ended');
  assert.deepEqual(f.commands, [':prty 0', `:pt ${PRIORITY_PEACE_SECONDS}`]);
  const endedJson = JSON.stringify(f.staffEdits.at(-1).payload);
  assert.match(endedJson, /Priority Request — Ended/);
  assert.match(endedJson, /"label":"Ended"/);
  assert.doesNotMatch(endedJson, /Priority Request — Active/);
  assert.doesNotMatch(endedJson, /"label":"Void"/);
  assert.doesNotMatch(endedJson, /"label":"Started"/);
});

test('one listed player dying does not end the priority', async () => {
  const startedAt = 1_000_000;
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    participants: [
      { username: 'Host', robloxId: '99' },
      { username: 'Partner', robloxId: '88' },
    ],
    startedAt,
    endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
    staffMessageId: 'm',
  }, {
    time: startedAt + 5000,
    server: { KillLogs: [{ Killed: 'Host:99', Timestamp: Math.floor((startedAt + 1000) / 1000) }] },
  });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'active');
  assert.deepEqual(f.commands, []);
  assert.equal(f.stored.request.deadParticipants.length, 1);
});

test('saved deaths still end the priority after a restart with empty kill logs', async () => {
  const startedAt = 1_000_000;
  const stored = {
    request: {
      id: 'p1',
      status: 'active',
      requesterId: 'u1',
      participants: [
        { username: 'Host', robloxId: '99' },
        { username: 'Partner', robloxId: '88' },
      ],
      deadParticipants: [
        { username: 'Host', robloxId: '99' },
        { username: 'Partner', robloxId: '88' },
      ],
      startedAt,
      endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
      staffMessageId: 'm',
    },
  };
  const commands = [];
  const svc = createPriorityRequestService({
    now: () => startedAt + 5000,
    load: async () => stored,
    save: async (value) => { stored.request = value.request; },
    send: async (command) => { commands.push(command); },
    snapshot: async () => ({ KillLogs: [] }),
    postStaff: async () => ({ id: 'm' }),
    editStaff: async () => {},
    dmUser: async () => {},
  });
  await svc.tick();
  assert.equal(stored.request.status, 'ended');
  assert.deepEqual(commands, [':prty 0', `:pt ${PRIORITY_PEACE_SECONDS}`]);
});

test('restart keeps saved deaths and ends when the remaining player dies', async () => {
  const startedAt = 1_000_000;
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    participants: [
      { username: 'Host', robloxId: '99' },
      { username: 'Partner', robloxId: '88' },
    ],
    deadParticipants: [{ username: 'Host', robloxId: '99' }],
    startedAt,
    endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
    staffMessageId: 'm',
  }, {
    time: startedAt + 5000,
    server: {
      KillLogs: [{ Killed: 'Partner:88', Timestamp: Math.floor((startedAt + 4000) / 1000) }],
    },
  });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'ended');
  assert.equal(f.stored.request.deadParticipants.length, 2);
  assert.deepEqual(f.commands, [':prty 0', `:pt ${PRIORITY_PEACE_SECONDS}`]);
});

test('restart still ends an active priority when its saved timer is up', async () => {
  const startedAt = 1_000_000;
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    participants: [{ username: 'Host', robloxId: '99' }],
    startedAt,
    endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
    staffMessageId: 'm',
  }, { time: startedAt + PRIORITY_REQUEST_SECONDS * 1000 });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'ended');
  assert.deepEqual(f.commands, [':prty 0', `:pt ${PRIORITY_PEACE_SECONDS}`]);
});

test('ending the timer rewrites the staff card to Ended', async () => {
  const startedAt = 1_000_000;
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    startedAt,
    endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
    staffMessageId: 'm',
  }, { time: startedAt + PRIORITY_REQUEST_SECONDS * 1000 });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'ended');
  const json = JSON.stringify(f.staffEdits.at(-1).payload);
  assert.match(json, /Priority Request — Ended/);
  assert.match(json, /"label":"Ended"/);
  assert.match(json, /\*\*Ended:\*\*/);
});

test('endedPayload replaces Started with a disabled Ended button', () => {
  const json = JSON.stringify(endedPayload({
    id: 'p1',
    requesterId: 'u1',
    endedAt: 1_000_000,
    endIntro: 'Everyone listed on this priority died in-game.',
  }));
  assert.match(json, /Priority Request — Ended/);
  assert.match(json, /"label":"Ended"/);
  assert.match(json, /"disabled":true/);
  assert.doesNotMatch(json, /"label":"Started"/);
  assert.doesNotMatch(json, /"label":"Void"/);
});

test('a restored ended request still updates the Active card to Ended', async () => {
  const f = serviceFixture({
    id: 'p1',
    status: 'ended',
    requesterId: 'u1',
    staffMessageId: 'm',
    endedAt: 1_000_000,
    endIntro: 'The in-game priority timer ended. A **10 minute** peace timer is now running.',
  });
  await f.svc.tick();
  assert.equal(f.staffEdits.length, 1);
  assert.match(JSON.stringify(f.staffEdits[0].payload), /Priority Request — Ended/);
  assert.equal(f.stored.request.staffCardStatus, 'ended');
});

test('a restored pending request still blocks a new one', async () => {
  const svc = createPriorityRequestService({
    now: () => 1,
    load: async () => ({ request: { id: 'p1', status: 'pending' } }),
    save: async () => {},
    send: async () => {},
    snapshot: async () => ({}),
    postStaff: async () => ({ id: 'm' }),
    editStaff: async () => {},
    dmUser: async () => {},
  });
  await assert.rejects(
    () => svc.openForm({ user: { id: 'u1' } }, { players: [{ username: 'A', robloxId: '1' }], vehicles: [] }),
    /already pending/,
  );
});

test('parseErlcKill keeps the killer and victim', () => {
  const kill = parseErlcKill({
    Killed: 'Victim:1',
    Killer: 'Rando:77',
    Timestamp: 1000,
  });
  assert.equal(kill.username, 'Victim');
  assert.equal(kill.robloxId, '1');
  assert.equal(kill.killerUsername, 'Rando');
  assert.equal(kill.killerRobloxId, '77');
});

test('only civilian killers outside the priority are warned', () => {
  const startedAt = 1_000_000;
  const people = [{ username: 'Host', robloxId: '99' }];
  const players = [
    { username: 'Rando', robloxId: '77', team: 'Civilian' },
    { username: 'Host', robloxId: '99', team: 'Civilian' },
    { username: 'Deputy', robloxId: '55', team: 'Sheriff' },
  ];
  const civKill = parseErlcKill({
    Killed: 'Bystander:2',
    Killer: 'Rando:77',
    Timestamp: (startedAt + 1000) / 1000,
  });
  assert.equal(civilianKillersOutsidePriority({
    kills: [civKill],
    players,
    participants: people,
    startedAt,
  }).map((entry) => entry.username).join(','), 'Rando');
  assert.deepEqual(civilianKillersOutsidePriority({
    kills: [parseErlcKill({ Killed: 'Bystander:2', Killer: 'Host:99', Timestamp: (startedAt + 1000) / 1000 })],
    players,
    participants: people,
    startedAt,
  }), []);
  assert.deepEqual(civilianKillersOutsidePriority({
    kills: [parseErlcKill({ Killed: 'Bystander:2', Killer: 'Deputy:55', Timestamp: (startedAt + 1000) / 1000 })],
    players,
    participants: people,
    startedAt,
  }), []);
});

test('a civilian outside the priority is PM’d and DMed after a kill', async () => {
  const startedAt = 1_000_000;
  const f = serviceFixture({
    id: 'p1',
    status: 'active',
    requesterId: 'u1',
    participants: [{ username: 'Host', robloxId: '99' }],
    startedAt,
    endsAt: startedAt + PRIORITY_REQUEST_SECONDS * 1000,
    staffMessageId: 'm',
    warnedPriorityKills: [],
  }, {
    time: startedAt + 5000,
    discordIds: new Map([['77', 'discord77']]),
    server: {
      Players: [
        { Player: 'Host:99', Team: 'Civilian' },
        { Player: 'Rando:77', Team: 'Civilian' },
      ],
      KillLogs: [{
        Killed: 'Bystander:2',
        Killer: 'Rando:77',
        Timestamp: Math.floor((startedAt + 1000) / 1000),
      }],
    },
  });
  await f.svc.tick();
  assert.equal(f.stored.request.status, 'active');
  assert.equal(f.commands[0], `:pm Rando ${PRIORITY_CIVILIAN_KILL_PM}`);
  assert.equal(f.dms[0].id, 'discord77');
  assert.match(JSON.stringify(f.dms[0].payload), /active Priority/i);
  assert.equal(f.stored.request.warnedPriorityKills.length, 1);
  await f.svc.tick();
  assert.equal(f.commands.length, 1);
  assert.equal(f.dms.length, 1);
});
