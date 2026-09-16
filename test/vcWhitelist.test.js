import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isVcExempt } from '../utils/enforcementExemptions.js';
import { createVcChecks } from '../utils/vcChecks.js';
import command from '../commands/vc.js';
import {
  loadVcWhitelist,
  resetVcWhitelistForTests,
} from '../utils/vcWhitelist.js';

test('whitelist by Discord member, Roblox id, or username skips VC jail and PMs', async () => {
  resetVcWhitelistForTests({
    entries: [
      { discordId: '111111111111111111' },
      { robloxId: '99' },
      { username: 'GhostUser' },
    ],
  });
  const members = new Map([['111111111111111111', { id: '111111111111111111', nickname: 'Nick | Linked', user: {} }]]);
  assert.equal(isVcExempt({ username: 'Linked', robloxId: '1' }, members), true);
  assert.equal(isVcExempt({ username: 'Other', robloxId: '99' }, new Map()), true);
  assert.equal(isVcExempt({ username: 'GhostUser', robloxId: '2' }, new Map()), true);
  assert.equal(isVcExempt({ username: 'Random', robloxId: '3' }, new Map()), false);

  const calls = [];
  const service = createVcChecks({
    snapshot: async () => ({
      players: [{ username: 'GhostUser', robloxId: '2' }],
      members: new Map(),
      inVoice: () => false,
    }),
    send: async (text) => calls.push(text),
  });
  await service.tick();
  assert.deepEqual(calls, []);
});

test('whitelisting a jailed player unjails them and sends no more PMs', async () => {
  resetVcWhitelistForTests({ entries: [{ username: 'Player' }] });
  const calls = [];
  const service = createVcChecks({
    load: async () => [['1', { jailed: true }]],
    snapshot: async () => ({
      players: [{ username: 'Player', robloxId: '1' }],
      members: new Map(),
      inVoice: () => false,
    }),
    send: async (text) => calls.push(text),
  });
  await service.tick();
  await service.tick();
  assert.deepEqual(calls, [':unjail Player']);
});

test('/vc whitelist add persists a Roblox username', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vc-whitelist-'));
  const path = join(dir, 'vc-whitelist.json');
  resetVcWhitelistForTests({ entries: [], path });
  let reply;
  await command.execute({
    inGuild: () => true,
    guildId: 'home',
    client: { config: { guildId: 'home' }, vcChecks: { tick() {} } },
    memberPermissions: { has: () => true },
    user: { id: '222222222222222222', username: 'Staff' },
    options: {
      getSubcommand: () => 'whitelist',
      getString: (name) => (name === 'roblox' ? 'iTsAronJ' : name === 'action' ? 'add' : null),
      getUser: () => null,
    },
    deferReply: async () => {},
    editReply: async (content) => { reply = content; },
    reply: async (payload) => { reply = payload.content || payload; },
  });
  assert.match(String(reply), /iTsAronJ/i);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.entries[0].username, 'itsaronj');
  await loadVcWhitelist(path);
  assert.equal(isVcExempt({ username: 'iTsAronJ' }, new Map()), true);
});

test('/vc whitelist rejects members without Discord Administrator', async () => {
  let reply;
  await command.execute({
    inGuild: () => true,
    guildId: 'home',
    client: { config: { guildId: 'home' } },
    memberPermissions: { has: () => false },
    member: { permissions: { has: () => false } },
    user: { id: '333333333333333333', username: 'Staffless' },
    options: { getSubcommand: () => 'whitelist' },
    reply: async (payload) => { reply = payload.content; },
  });
  assert.match(reply, /Administrator/);
});

test('/vc whitelist list is empty until someone is added', async () => {
  resetVcWhitelistForTests({ entries: [] });
  let reply;
  await command.execute({
    inGuild: () => true,
    guildId: 'home',
    client: { config: { guildId: 'home' } },
    memberPermissions: { has: () => true },
    user: { id: '222222222222222222', username: 'Staff' },
    options: {
      getSubcommand: () => 'whitelist',
      getString: () => 'list',
      getUser: () => null,
    },
    reply: async (payload) => { reply = payload.content; },
  });
  assert.match(reply, /empty/i);
});
