import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GEORGIA_GUILD_ID,
  GEORGIA_NICKNAME,
  ensureGeorgiaServerProfile,
} from '../utils/georgiaServer.js';

function fakeClient(me, edits) {
  const guild = {
    id: GEORGIA_GUILD_ID,
    members: {
      me,
      editMe: async (options) => {
        edits.push(options);
        Object.assign(me, {
          nickname: options.nick ?? me.nickname,
          avatar: options.avatar ? 'avatar' : me.avatar,
          banner: options.banner ? 'banner' : me.banner,
        });
      },
    },
  };
  return {
    guilds: {
      cache: { get: (id) => (id === GEORGIA_GUILD_ID ? guild : null) },
      fetch: async () => guild,
    },
  };
}

test('Georgia Operations targets the requested guild and profile name', () => {
  assert.equal(GEORGIA_GUILD_ID, '1557972171522052226');
  assert.equal(GEORGIA_NICKNAME, 'Georgia Operations');
});

test('Georgia Operations applies the supplied logo and banner once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cw-georgia-ops-'));
  try {
    const edits = [];
    const client = fakeClient({ nickname: null, avatar: null, banner: null }, edits);
    const statePath = join(dir, 'state.json');

    assert.equal(await ensureGeorgiaServerProfile(client, { statePath }), true);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].nick, 'Georgia Operations');
    assert.equal(Buffer.isBuffer(edits[0].avatar), true);
    assert.match(edits[0].banner, /^data:image\/png;base64,/);

    assert.equal(await ensureGeorgiaServerProfile(client, { statePath }), true);
    assert.equal(edits.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Georgia Operations still applies its name if Discord rejects an image', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cw-georgia-ops-'));
  try {
    const edits = [];
    const client = fakeClient({ nickname: null, avatar: null, banner: null }, []);
    const guild = client.guilds.cache.get(GEORGIA_GUILD_ID);
    guild.members.editMe = async (options) => {
      edits.push(options);
      if (options.avatar) throw new Error('Invalid image');
    };

    assert.equal(await ensureGeorgiaServerProfile(client, { statePath: join(dir, 'state.json') }), false);
    assert.equal(edits.length, 2);
    assert.equal(edits[1].nick, 'Georgia Operations');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
