import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DOD_GUILD_ID } from '../utils/dodReports.js';
import { DOD_NICKNAME, ensureDodServerProfile } from '../utils/dodServer.js';

test('Divisional Hub uses its requested guild and PCSO name', () => {
  assert.equal(DOD_GUILD_ID, '1536695906768781362');
  assert.equal(DOD_NICKNAME, 'PCSO | Divisional Hub');
});

test('Divisional Hub profile applies the PCSO avatar, banner, bio, and nickname', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dod-profile-test-'));
  const edits = [];
  const guild = {
    members: {
      me: { nickname: null, avatar: null, banner: null },
      editMe: async (options) => { edits.push(options); },
    },
  };
  const client = { guilds: { cache: { get: () => guild }, fetch: async () => guild } };
  try {
    assert.equal(await ensureDodServerProfile(client, { statePath: path.join(directory, 'profile.json') }), true);
    assert.equal(edits[0].nick, DOD_NICKNAME);
    assert.equal(Buffer.isBuffer(edits[0].avatar), true);
    assert.match(edits[0].banner, /^data:image\/webp;base64,/);
    assert.match(edits[0].bio, /Sheriff/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
