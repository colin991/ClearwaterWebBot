import assert from 'node:assert/strict';
import test from 'node:test';
import { FLORIDA_GUILD_ID, clearFloridaServerProfile, shouldIgnoreGuildCommands } from '../utils/floridaServer.js';

test('Florida Operations guild id is the requested server', () => {
  assert.equal(FLORIDA_GUILD_ID, '1513609541483499790');
  assert.equal(shouldIgnoreGuildCommands(FLORIDA_GUILD_ID), true);
  assert.equal(shouldIgnoreGuildCommands('1514100977920245760'), false);
  assert.equal(shouldIgnoreGuildCommands(null), false);
});

test('Florida server profile is cleared on that guild', async () => {
  const edits = [];
  const guild = {
    id: FLORIDA_GUILD_ID,
    members: {
      me: { nickname: 'Florida Operations', avatar: 'abc', banner: 'def' },
      editMe: async (options) => { edits.push(options); },
    },
  };
  const client = {
    guilds: {
      cache: { get: (id) => (id === FLORIDA_GUILD_ID ? guild : null) },
      fetch: async () => guild,
    },
  };
  const ok = await clearFloridaServerProfile(client);
  assert.equal(ok, true);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].nick, null);
  assert.equal(edits[0].avatar, null);
  assert.equal(edits[0].banner, null);
});
