import test from 'node:test';
import assert from 'node:assert/strict';
import command from '../prefixCommands/addfollowers.js';
import messageEvent from '../events/messageCreate.js';
import { ensureDefaultInternetAccount, activeInternetAccount, createInternetAccount, addInternetFollowers, internetFollowerCount, followerDiscordIds } from '../utils/internetStore.js';

const actor = { id: '123456789012345678', username: 'discord.name', displayName: 'Discord Name', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' };
const empty = () => ({ users: {}, posts: [], reports: [], logs: [] });

test('default profile is ready immediately, syncs Discord identity, and preserves alternate accounts', () => {
  const store = empty();
  const first = ensureDefaultInternetAccount(store, actor);
  assert.equal(first.id, actor.id);
  assert.equal(first.username, actor.username);
  assert.equal(first.avatarUrl, actor.avatarUrl);
  assert.equal(first.accountCreated, true);
  const alt = createInternetAccount(store, { actor, username: 'another', displayName: 'Another' });
  assert.notEqual(alt.id, actor.id);
  assert.equal(activeInternetAccount(store, { ...actor, username: 'new.discord.name' }).id, alt.id);
  assert.equal(store.users[actor.id].username, 'new.discord.name');
  assert.equal(store.users[alt.id].username, 'another');
  assert.equal(Object.keys(store.users).length, 2);
});

test('follower additions accumulate alongside real follows without adding notification recipients', () => {
  const store = empty();
  ensureDefaultInternetAccount(store, actor);
  store.users.fan = { id: '223456789012345678', following: [actor.id] };
  const args = { actorId: '1074411240757137589', handle: '@Discord.Name', amount: 100 };
  addInternetFollowers(store, args); addInternetFollowers(store, args);
  assert.equal(internetFollowerCount(store, actor.id), 201);
  assert.deepEqual(followerDiscordIds(store, actor.id), ['223456789012345678']);
  for (const amount of [-1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => addInternetFollowers(store, { ...args, amount }));
  }
  assert.throws(() => addInternetFollowers(store, { ...args, actorId: actor.id }), /Not authorized/);
  assert.equal(internetFollowerCount(store, actor.id), 201);
});

test('unauthorized command is silent before command parsing and other message handlers', async () => {
  const message = { author: { id: actor.id }, content: '-addfollowers @someone 100', reply: () => assert.fail('Must remain silent') };
  await command.execute(message, []);
  await messageEvent.execute(message, {});
});
