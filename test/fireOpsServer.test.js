import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FIRE_OPS_BIO,
  FIRE_OPS_GUILD_ID,
  FIRE_OPS_NICKNAME,
  FIRE_OPS_WELCOME_CHANNEL_ID,
  ensureFireOpsServerProfile,
  sendFireOpsWelcome,
} from '../utils/fireOpsServer.js';

test('Fire & Rescue welcome pings the joiner with the member count button', async () => {
  const sent = [];
  const member = {
    id: '99',
    user: { bot: false, tag: 'join#0001' },
    guild: {
      id: FIRE_OPS_GUILD_ID,
      memberCount: 422,
      channels: {
        cache: {
          get: (id) => (id === FIRE_OPS_WELCOME_CHANNEL_ID
            ? { isTextBased: () => true, send: async (payload) => { sent.push(payload); } }
            : null),
        },
      },
    },
  };
  assert.equal(await sendFireOpsWelcome(member), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, [
    '<:wave:1517217333234503790> **Welcome** <@99> to the <:CFD:1514806304621989978> **Clearwater Fire & Rescue**',
    '-# We are always in search of additional personnel, please apply in https://discord.com/channels/1514804886292795544/1514804887630643327. We hope you enjoy your stay.',
  ].join('\n'));
  assert.deepEqual(sent[0].allowedMentions.users, ['99']);
  const button = sent[0].components[0].toJSON().components[0];
  assert.equal(button.label, '422');
  assert.equal(button.disabled, true);
  assert.equal(button.style, 2);
  assert.equal(button.emoji.id, '1517350373671833732');

  assert.equal(await sendFireOpsWelcome({ ...member, guild: { id: 'other' } }), false);
  assert.equal(await sendFireOpsWelcome({ ...member, user: { bot: true } }), false);
});

function fakeClient(me, edits) {
  const guild = {
    id: FIRE_OPS_GUILD_ID,
    members: {
      me,
      editMe: async (options) => {
        edits.push(options);
        Object.assign(me, { nickname: options.nick ?? me.nickname, avatar: options.avatar ? 'a' : me.avatar, banner: options.banner ? 'b' : me.banner });
      },
    },
  };
  return {
    guilds: {
      cache: { get: (id) => (id === FIRE_OPS_GUILD_ID ? guild : null) },
      fetch: async () => guild,
    },
  };
}

test('Fire Operations profile targets the Clearwater Fire & Rescue server', () => {
  assert.equal(FIRE_OPS_GUILD_ID, '1514804886292795544');
  assert.equal(FIRE_OPS_NICKNAME, 'Fire Operations');
  assert.equal(FIRE_OPS_BIO, '**Clearwater Fire & Rescue** internal utilities and operations manager.');
});

test('Fire Operations sets nickname, logo, banner, and bio once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cw-fire-ops-'));
  try {
    const statePath = join(dir, 'state.json');
    const edits = [];
    const client = fakeClient({ nickname: null, avatar: null, banner: null }, edits);
    assert.equal(await ensureFireOpsServerProfile(client, { statePath }), true);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].nick, FIRE_OPS_NICKNAME);
    assert.equal(edits[0].bio, FIRE_OPS_BIO);
    assert.equal(Buffer.isBuffer(edits[0].avatar), true);
    assert.match(edits[0].banner, /^data:image\/png;base64,/);

    assert.equal(await ensureFireOpsServerProfile(client, { statePath }), true);
    assert.equal(edits.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a rejected image upload still applies the nickname and bio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cw-fire-ops-'));
  try {
    const edits = [];
    const client = fakeClient({ nickname: null, avatar: null, banner: null }, []);
    const guild = client.guilds.cache.get(FIRE_OPS_GUILD_ID);
    guild.members.editMe = async (options) => {
      edits.push(options);
      if (options.avatar) throw new Error('Invalid image');
    };
    assert.equal(await ensureFireOpsServerProfile(client, { statePath: join(dir, 's.json') }), false);
    assert.equal(edits.length, 2);
    assert.deepEqual({ nick: edits[1].nick, bio: edits[1].bio }, { nick: FIRE_OPS_NICKNAME, bio: FIRE_OPS_BIO });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
