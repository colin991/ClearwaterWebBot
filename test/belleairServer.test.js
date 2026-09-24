import assert from 'node:assert/strict';
import test from 'node:test';
import { BELLEAIR_GUILD_ID, BELLEAIR_NICKNAME, ensureBelleairServerProfile } from '../utils/belleairServer.js';

test('Belleair Operations guild id and nickname match the requested server', () => {
  assert.equal(BELLEAIR_GUILD_ID, '1526890993327280240');
  assert.equal(BELLEAIR_NICKNAME, 'Belleair Operations');
});

test('Belleair server profile sets nickname, badge avatar, and car banner', async () => {
  const edits = [];
  const guild = {
    id: BELLEAIR_GUILD_ID,
    members: {
      me: { nickname: null, avatar: null, banner: null },
      editMe: async (options) => { edits.push(options); },
    },
  };
  const client = {
    guilds: {
      cache: { get: (id) => (id === BELLEAIR_GUILD_ID ? guild : null) },
      fetch: async () => guild,
    },
  };
  const ok = await ensureBelleairServerProfile(client);
  assert.equal(ok, true);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].nick, BELLEAIR_NICKNAME);
  assert.equal(Buffer.isBuffer(edits[0].avatar), true);
  assert.match(edits[0].banner, /^data:image\/webp;base64,/);
});
