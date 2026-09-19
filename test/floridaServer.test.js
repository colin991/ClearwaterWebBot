import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLORIDA_GUILD_ID,
  FLORIDA_NICKNAME,
  FLORIDA_WELCOME_BUTTON_ID,
  FLORIDA_WELCOME_CHANNEL_ID,
  buildFloridaWelcomePayload,
  ensureFloridaServerProfile,
  sendFloridaWelcome,
} from '../utils/floridaServer.js';

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

test('Florida welcome pings the joiner and shows the member count', async () => {
  const sent = [];
  const member = {
    id: '99',
    user: { bot: false, tag: 'tester#0001' },
    guild: {
      id: FLORIDA_GUILD_ID,
      memberCount: 142,
      channels: {
        cache: {
          get: (id) => (id === FLORIDA_WELCOME_CHANNEL_ID ? {
            isTextBased: () => true,
            send: async (payload) => { sent.push(payload); },
          } : null),
        },
      },
    },
  };
  const ok = await sendFloridaWelcome(member);
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].content,
    '<:wave:1521080434488901682> Welcome aboard, <@99>. The **Florida Highway Patrol** is glad to have you!',
  );
  assert.deepEqual(sent[0].allowedMentions.users, ['99']);
  const button = sent[0].components[0].components[0];
  assert.equal(button.data.custom_id, FLORIDA_WELCOME_BUTTON_ID);
  assert.equal(button.data.label, '142');
  assert.equal(button.data.disabled, true);
  assert.equal(button.data.emoji.id, '1521081600354418750');
});

test('Florida welcome ignores other servers and bots', async () => {
  const payload = buildFloridaWelcomePayload({
    id: '55',
    guild: { memberCount: 10 },
  });
  assert.match(payload.content, /<@55>/);
  assert.equal(await sendFloridaWelcome({
    id: '55',
    user: { bot: false },
    guild: { id: '1', channels: { cache: { get: () => null } } },
  }), false);
  assert.equal(await sendFloridaWelcome({
    id: '55',
    user: { bot: true },
    guild: { id: FLORIDA_GUILD_ID },
  }), false);
});
