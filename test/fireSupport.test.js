import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import {
  FIRE_SUPPORT_PANEL_CHANNEL_ID,
  FIRE_SUPPORT_TYPES,
  buildFireSupportPanel,
  buildFireTicketPayload,
  canStaffFireTicket,
  createFireSupportTicket,
  fireTicketOwnerId,
  fireTicketType,
} from '../utils/fireSupport.js';
import { FIRE_OPS_GUILD_ID } from '../utils/fireOpsServer.js';
import { getFireRankByName } from '../utils/firePromote.js';

const OWNER_ID = '1044686997194805280';

function member(rankNames, { admin = false } = {}) {
  return {
    roles: { cache: new Set(rankNames.map((name) => getFireRankByName(name).roleId)) },
    permissions: { has: () => admin },
  };
}

test('CWFR support panel matches the requested layout', () => {
  assert.equal(FIRE_SUPPORT_PANEL_CHANNEL_ID, '1514804888243142770');
  const json = buildFireSupportPanel().components[0].toJSON();
  assert.deepEqual(json.components.map((c) => c.type), [12, 14, 10, 14, 10, 14, 1, 14, 12]);
  const serialized = JSON.stringify(json);
  assert.match(serialized, /cwfd_4\.png/);
  assert.match(serialized, /cwfd_footer_4\.png/);
  assert.match(serialized, /CWFR Support/);
  assert.deepEqual(json.components[6].components.map((b) => b.label), ['Internal Affairs', 'Line Officer', 'Office of the Chief']);
});

test('Tickets map to the right categories', () => {
  assert.equal(FIRE_SUPPORT_TYPES.ia.categoryId, '1514804891154120796');
  assert.equal(FIRE_SUPPORT_TYPES.line.categoryId, '1514804890680033300');
  assert.equal(FIRE_SUPPORT_TYPES.chief.categoryId, '1514804891154120794');
});

test('Ticket opening message shows the inquiry with Close, Claim and Escalate', () => {
  const payload = buildFireTicketPayload({ ownerId: OWNER_ID, type: 'line', inquiry: 'Hello, this is an `example`.' });
  const json = payload.components[0].toJSON();
  const serialized = JSON.stringify(json);
  assert.match(serialized, /Line Officer Support/);
  assert.match(serialized, new RegExp(`Hello <@${OWNER_ID}>!`));
  assert.match(serialized, /Ticket Inquiry/);
  assert.match(serialized, /Hello, this is an 'example'\./);
  assert.deepEqual(json.components[4].components.map((b) => b.label), ['Close', 'Claim', 'Escalate']);
  assert.deepEqual(payload.allowedMentions, { parse: [], users: [OWNER_ID] });
});

test('Lieutenant+ staffs IA and Line Officer tickets; District Chief+ staffs Office of the Chief', () => {
  const lieutenant = member(['Lieutenant']);
  const districtChief = member(['District Chief']);
  assert.equal(canStaffFireTicket(lieutenant, 'line'), true);
  assert.equal(canStaffFireTicket(lieutenant, 'ia'), true);
  assert.equal(canStaffFireTicket(lieutenant, 'chief'), false);
  assert.equal(canStaffFireTicket(districtChief, 'chief'), true);
  assert.equal(canStaffFireTicket(member(['Engineer']), 'line'), false);
  assert.equal(canStaffFireTicket(member([], { admin: true }), 'chief'), true);
});

test('Opening a ticket creates a private channel in the category', async () => {
  const created = [];
  const sent = [];
  const guild = {
    id: FIRE_OPS_GUILD_ID,
    channels: {
      cache: new Map(),
      fetch: async () => {},
      create: async (options) => {
        created.push(options);
        return { id: '999', send: async (payload) => sent.push(payload) };
      },
    },
    members: { me: { id: '555' } },
  };
  guild.channels.cache.find = (fn) => [...guild.channels.cache.values()].find(fn);
  const opener = { id: OWNER_ID, displayName: 'Colin', user: { username: 'colin991' } };

  const result = await createFireSupportTicket(guild, opener, 'chief', 'Need the chief');
  assert.equal(result.existing, false);
  const options = created[0];
  assert.equal(options.parent, '1514804891154120794');
  assert.equal(options.name, 'chief-colin991');
  assert.equal(fireTicketOwnerId({ topic: options.topic }), OWNER_ID);
  assert.equal(fireTicketType({ topic: options.topic }), 'chief');
  const everyone = options.permissionOverwrites.find((o) => o.id === FIRE_OPS_GUILD_ID);
  assert.deepEqual(everyone.deny, [PermissionFlagsBits.ViewChannel]);
  const staffIds = options.permissionOverwrites.map((o) => o.id);
  assert.ok(staffIds.includes(getFireRankByName('District Chief').roleId));
  assert.ok(!staffIds.includes(getFireRankByName('Lieutenant').roleId));
  assert.equal(sent.length, 1);

  guild.channels.cache.set('999', { id: '999', topic: options.topic });
  const again = await createFireSupportTicket(guild, opener, 'chief', 'again');
  assert.equal(again.existing, true);
});
