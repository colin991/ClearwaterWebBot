import test from 'node:test';
import assert from 'node:assert/strict';
import { civilianVehicles, formatPriorityVehicle, parseErlcKill, parseErlcVehicle } from '../utils/erlc.js';
import {
  allPriorityParticipantsDied,
  createPriorityRequestService,
  extraTimeCommandSeconds,
  hasBlockingPriority,
  PRIORITY_PENDING_MS,
  PRIORITY_PEACE_SECONDS,
  PRIORITY_REQUEST_SECONDS,
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
  const json = JSON.stringify(modal.toJSON());
  assert.match(json, /Type to search in-game users/);
  assert.match(json, /Type to search civilian vehicles/);
  assert.match(json, /"max_values":1/);
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
    onError: error => { throw error; },
  });
  return { svc, commands, dms, stored, setTime: value => { time = value; } };
}

test('approve starts a 30 minute in-game timer and DMs the requester', async () => {
  const f = serviceFixture({
    id: 'p1', status: 'pending', requesterId: 'u1', pendingExpiresAt: 9e12, staffMessageId: 'm',
  });
  await f.svc.approve('p1', { id: 'staff' });
  assert.deepEqual(f.commands, [`:prty ${PRIORITY_REQUEST_SECONDS}`]);
  assert.equal(f.dms[0].id, 'u1');
  assert.match(f.dms[0].payload.components[0].components[2].content, /Priority Started/);
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
