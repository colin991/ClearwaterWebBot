import test from 'node:test';
import assert from 'node:assert/strict';
import { civilianVehicles, formatPriorityVehicle, parseErlcKill, parseErlcVehicle } from '../utils/erlc.js';
import {
  allPriorityParticipantsDied,
  createPriorityRequestService,
  extraTimeCommandSeconds,
  extraTimeResolvedPayload,
  handlePriorityRequest,
  hasBlockingPriority,
  PRIORITY_PENDING_MS,
  PRIORITY_PEACE_SECONDS,
  PRIORITY_REQUEST_SECONDS,
  PRIORITY_REQUEST_STAFF_ROLE,
  priorityStartMessageCommand,
  priorityStartSpeech,
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
  assert.match(json, /Type to search in-game users/);
  assert.match(json, /Type to search civilian vehicles/);
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
  let time = extras.time || 1_000_000;
  const stored = { request };
  const svc = createPriorityRequestService({
    now: () => time,
    load: async () => stored,
    save: async value => { stored.request = value.request; },
    send: async command => { commands.push(command); },
    snapshot: async () => extras.server || { KillLogs: [] },
    postStaff: async () => ({ id: 'msg1' }),
    editStaff: async () => {},
    dmUser: async (id, payload) => { dms.push({ id, payload }); },
    announceStart: extras.announceStart,
    onError: error => { throw error; },
  });
  return { svc, commands, dms, stored, setTime: value => { time = value; } };
}

test('start speech and in-game :m use the requester and details', () => {
  const request = { requesterUsername: 'HostUser', details: 'bank robbery downtown' };
  assert.equal(priorityStartSpeech(request), 'A new priority has now started, by HostUser, for bank robbery downtown.');
  assert.equal(
    priorityStartMessageCommand(request),
    ':m A new priority has now started by HostUser for bank robbery downtown. Do not start any major roleplays',
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
  await svc.submitRequest({
    user: { id: 'u1', username: 'DiscName' },
    selectedPlayers: [{ username: 'RobloxHost', robloxId: '99' }],
    selectedVehicles: [],
    background: 'bg',
    details: 'store robbery',
  });
  const json = JSON.stringify(posts[0]);
  assert.match(json, new RegExp(`<@&${PRIORITY_REQUEST_STAFF_ROLE}>`));
  assert.deepEqual(posts[0].allowedMentions.roles, [PRIORITY_REQUEST_STAFF_ROLE]);
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
  assert.equal(f.commands[1], ':m A new priority has now started by HostUser for bank robbery downtown. Do not start any major roleplays');
  assert.equal(f.dms[0].id, 'u1');
  assert.match(f.dms[0].payload.components[0].components[2].content, /Priority Started/);
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

test('anyone can approve extra time and the clicked message updates', async () => {
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
    member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } },
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
});
