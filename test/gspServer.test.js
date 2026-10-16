import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GSP_GUILD_ID, GSP_NICKNAME, ensureGspServerProfile } from '../utils/gspServer.js';

function fakeClient(me, edits) {
  const guild = {
    id: GSP_GUILD_ID,
    members: {
      me,
      editMe: async (options) => {
        edits.push(options);
        if (options.nick) me.nickname = options.nick;
        if (options.avatar) me.avatar = 'avatar';
        if (options.banner) me.banner = 'banner';
      },
    },
  };
  return {
    guilds: {
      cache: { get: (id) => (id === GSP_GUILD_ID ? guild : null) },
      fetch: async () => guild,
    },
  };
}

test('GSP profile targets the Georgia State Patrol server with the requested name', () => {
  assert.equal(GSP_GUILD_ID, '1558194098890874971');
  assert.equal(GSP_NICKNAME, 'Georgia Operations');
});

test('GSP profile applies the patch logo and banner once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cw-gsp-'));
  try {
    const edits = [];
    const client = fakeClient({ nickname: null, avatar: null, banner: null }, edits);
    const statePath = join(dir, 'state.json');
    assert.equal(await ensureGspServerProfile(client, { statePath }), true);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].nick, 'Georgia Operations');
    assert.equal(Buffer.isBuffer(edits[0].avatar), true);
    assert.match(edits[0].banner, /^data:image\/webp;base64,/);
    assert.equal(await ensureGspServerProfile(client, { statePath }), true);
    assert.equal(edits.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
