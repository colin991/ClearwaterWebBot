import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BELLEAIR_APPLY_CHANNEL_URL,
  BELLEAIR_GUILD_ID,
  BELLEAIR_NICKNAME,
  BELLEAIR_WELCOME_CHANNEL_ID,
  ensureBelleairServerProfile,
  sendBelleairWelcome,
} from '../utils/belleairServer.js';

test('Belleair Operations guild id and nickname match the requested server', () => {
  assert.equal(BELLEAIR_GUILD_ID, '1526890993327280240');
  assert.equal(BELLEAIR_NICKNAME, 'Belleair Operations');
  assert.equal(BELLEAIR_WELCOME_CHANNEL_ID, '1535138419972513832');
  assert.match(BELLEAIR_APPLY_CHANNEL_URL, /1535143007551225926/);
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

test('Belleair welcome pings the joiner in the department welcome channel', async () => {
  const sent = [];
  const member = {
    id: '99',
    user: { bot: false, tag: 'join#0001' },
    guild: {
      id: BELLEAIR_GUILD_ID,
      channels: {
        cache: {
          get: (id) => (id === BELLEAIR_WELCOME_CHANNEL_ID
            ? { isTextBased: () => true, send: async (payload) => { sent.push(payload); } }
            : null),
        },
      },
    },
  };
  const ok = await sendBelleairWelcome(member);
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Welcome/);
  assert.match(sent[0].content, /<@99>/);
  assert.match(sent[0].content, /Belleair Police Department/);
  assert.equal(sent[0].content.includes(BELLEAIR_APPLY_CHANNEL_URL), true);
  assert.deepEqual(sent[0].allowedMentions.users, ['99']);
  assert.equal(await sendBelleairWelcome({ ...member, guild: { id: 'other' } }), false);
});
