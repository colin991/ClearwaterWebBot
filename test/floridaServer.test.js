import assert from 'node:assert/strict';
import test from 'node:test';
import { FLORIDA_GUILD_ID, FLORIDA_NICKNAME, ensureFloridaServerProfile } from '../utils/floridaServer.js';

test('Florida Operations uses the requested guild and nickname', () => {
  assert.equal(FLORIDA_GUILD_ID, '1513609541483499790');
  assert.equal(FLORIDA_NICKNAME, 'Florida Operations');
});

test('Florida server profile sets nick, animated logo, and banner', async () => {
  const edits = [];
  const guild = {
    id: FLORIDA_GUILD_ID,
    members: {
      me: { nickname: 'Old Name', avatar: null, banner: null },
      editMe: async (options) => { edits.push(options); },
    },
  };
  const client = {
    guilds: {
      cache: { get: (id) => (id === FLORIDA_GUILD_ID ? guild : null) },
      fetch: async () => guild,
    },
  };
  const ok = await ensureFloridaServerProfile(client);
  assert.equal(ok, true);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].nick, 'Florida Operations');
  assert.match(edits[0].avatar, /^data:image\/gif;base64,/);
  assert.match(edits[0].banner, /^data:image\/png;base64,/);
});
