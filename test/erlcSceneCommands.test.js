import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import {
  extractWebhookCommandText,
  extractWebhookPlayer,
  handleErlcSceneEvent,
  parseCustomCommand,
  parseNumberedVoiceName,
  pickEmptyNumberedVoiceChannel,
  resolveSceneCommand,
  teamVoiceChannelId,
  TEAM_VOICE_CHANNEL_IDS,
} from '../utils/erlcSceneCommands.js';

function voice(id, name, humans = []) {
  const members = new Map(humans.map((member) => [member.id, member]));
  return { id, name, type: ChannelType.GuildVoice, members };
}

function member(id, { bot = false, channelId = 'here', channel = null } = {}) {
  return {
    id,
    user: { bot, tag: `u${id}` },
    voice: { channelId, channel },
  };
}

test('parses in-game scene commands and ignores other chat', () => {
  assert.equal(parseCustomCommand(';ss').baseName, 'Mod Scene');
  assert.equal(parseCustomCommand(';TS extra').name, 'ts');
  assert.equal(parseCustomCommand(';scene').baseName, 'Scene');
  assert.equal(parseCustomCommand(';fc').baseName, 'Frequency Change');
  assert.equal(parseCustomCommand(';civ').baseName, 'Civilian');
  assert.equal(parseCustomCommand(';team').kind, 'team');
  assert.equal(parseCustomCommand(';ping'), null);
  assert.equal(parseCustomCommand(':ss'), null);
});

test('numbered VC names match Name + number and do not confuse Scene with Mod Scene', () => {
  assert.equal(parseNumberedVoiceName('Civilian 4', 'Civilian'), 4);
  assert.equal(parseNumberedVoiceName('Mod Scene 12', 'Mod Scene'), 12);
  assert.equal(parseNumberedVoiceName('Scene 3', 'Scene'), 3);
  assert.equal(parseNumberedVoiceName('Mod Scene 3', 'Scene'), null);
  assert.equal(parseNumberedVoiceName('Frequency Change 1', 'Frequency Change'), 1);
});

test('picks the lowest empty numbered VC and treats bots as empty', () => {
  const occupied = voice('c4', 'Civilian 4', [{ id: '1', user: { bot: false } }]);
  const emptySix = voice('c6', 'Civilian 6', [{ id: 'bot', user: { bot: true } }]);
  const emptyTwo = voice('c2', 'Civilian 2', []);
  const other = voice('ts', 'Traffic Stop 1', []);
  const picked = pickEmptyNumberedVoiceChannel([occupied, emptySix, emptyTwo, other], 'Civilian');
  assert.equal(picked.id, 'c2');
});

test('team VCs map fire, police/sheriff, and DOT, and skip civilians', () => {
  assert.equal(teamVoiceChannelId('Fire'), TEAM_VOICE_CHANNEL_IDS.fire);
  assert.equal(teamVoiceChannelId('Police'), TEAM_VOICE_CHANNEL_IDS.police);
  assert.equal(teamVoiceChannelId('Sheriff'), TEAM_VOICE_CHANNEL_IDS.sheriff);
  assert.equal(teamVoiceChannelId('DOT'), TEAM_VOICE_CHANNEL_IDS.dot);
  assert.equal(teamVoiceChannelId('Civilian'), null);
  assert.equal(teamVoiceChannelId(''), null);
});

test('webhook payloads expose ;command text and Player:Id', () => {
  const payload = { Type: 'Command', Player: 'Colin:123456', Message: ';ss' };
  assert.equal(extractWebhookCommandText(payload), ';ss');
  assert.deepEqual(extractWebhookPlayer(payload), { username: 'Colin', robloxId: '123456' });
  assert.equal(resolveSceneCommand(payload).command.name, 'ss');
});

test('handleErlcSceneEvent moves a linked member into an empty Civilian VC', async () => {
  const dest = voice('civ2', 'Civilian 2');
  const current = voice('lobby', 'Lobby', []);
  const user = {
    id: 'discord1',
    user: { bot: false, tag: 'colin' },
    voice: {
      channelId: 'lobby',
      channel: current,
      setChannel: async (channel) => { user.voice.channelId = channel.id; user.movedTo = channel.id; },
    },
  };
  dest.members = new Map();
  const client = {
    guilds: {
      cache: {
        get: () => ({
          members: {
            me: { permissions: { has: () => true } },
            cache: { get: (id) => (id === 'discord1' ? user : null), size: 2, values: () => [user].values() },
            fetch: async (id) => (id === 'discord1' ? user : null),
            fetchMe: async () => ({ permissions: { has: () => true } }),
          },
          channels: {
            cache: {
              size: 10,
              get: (id) => (id === dest.id ? dest : id === current.id ? current : null),
              values: () => [current, dest].values(),
            },
            fetch: async () => {},
          },
        }),
      },
      fetch: async () => client.guilds.cache.get(),
    },
  };
  const result = await handleErlcSceneEvent(
    { Player: 'Colin:99', Message: ';civ' },
    {
      client,
      config: { guildId: 'guild', erlcServerKey: 'key' },
      identities: new Map([['99', 'discord1']]),
      snapshot: async () => ({ Players: [{ username: 'Colin', robloxId: '99', team: 'Civilian' }] }),
    },
  );
  assert.equal(result.handled, true);
  assert.equal(result.reason, 'moved');
  assert.equal(user.movedTo, 'civ2');
});

test(';team does not drag civilians and does drag fire to the fire VC', async () => {
  const fire = voice('1514128961951760515', 'Fire Dispatch');
  const user = {
    id: 'discord1',
    user: { bot: false, tag: 'colin' },
    voice: {
      channelId: 'lobby',
      channel: voice('lobby', 'Lobby'),
      setChannel: async (channel) => { user.movedTo = channel.id; },
    },
  };
  const guild = {
    members: {
      me: { permissions: { has: () => true } },
      cache: { get: () => user, size: 2, values: () => [user].values() },
      fetch: async () => user,
    },
    channels: {
      cache: {
        size: 10,
        get: (id) => (id === fire.id ? fire : null),
        values: () => [fire].values(),
      },
      fetch: async (id) => (id === fire.id ? fire : null),
    },
  };
  const client = { guilds: { cache: { get: () => guild }, fetch: async () => guild } };
  const deps = {
    client,
    config: { guildId: 'guild' },
    identities: new Map([['99', 'discord1']]),
  };
  const civ = await handleErlcSceneEvent(
    { Player: 'Colin:99', Message: ';team' },
    { ...deps, now: 1_000, snapshot: async () => ({ Players: [{ username: 'Colin', robloxId: '99', team: 'Civilian' }] }) },
  );
  assert.equal(civ.reason, 'no_team');
  const moved = await handleErlcSceneEvent(
    { Player: 'Colin:99', Message: ';team' },
    { ...deps, now: 20_000, snapshot: async () => ({ Players: [{ username: 'Colin', robloxId: '99', team: 'Fire' }] }) },
  );
  assert.equal(moved.reason, 'moved');
  assert.equal(user.movedTo, TEAM_VOICE_CHANNEL_IDS.fire);
});
