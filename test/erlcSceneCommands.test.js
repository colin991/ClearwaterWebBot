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
  playerStudDistance,
  playersWithinStuds,
  majorityMatchingVoiceChannel,
  resolveSceneCommand,
  sceneCommandLogBody,
  SCENE_COMMAND_LOG_CHANNEL_ID,
  SCENE_NEARBY_STUDS,
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
  assert.equal(parseCustomCommand('ss').name, 'ss');
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
  const short = { event: 'CustomCommand', userId: 123456, command: 'civ' };
  assert.deepEqual(extractWebhookPlayer(short), { username: '', robloxId: '123456' });
  assert.equal(resolveSceneCommand(short).command.name, 'civ');
  assert.equal(resolveSceneCommand({ Type: 'EmergencyCall', Team: 'Fire', Description: 'Structure Fire' }), null);
  assert.equal(resolveSceneCommand({ Message: ';ping' }).reason, 'unknown_command');
  assert.equal(SCENE_COMMAND_LOG_CHANNEL_ID, '1514547037537046688');
  assert.match(
    sceneCommandLogBody({
      handled: false,
      reason: 'not_in_voice',
      commandName: 'civ',
      player: { username: 'Colin', robloxId: '99' },
    }),
    /FAIL — ;civ Colin \(99\) · player is not in a Discord voice channel/,
  );
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
    { Type: 'Command', Player: 'Colin:99', Command: 'civ' },
    {
      client,
      config: { guildId: 'guild', erlcServerKey: 'key' },
      now: 1_000,
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
  assert.equal(moved.nearbyMoved, 0);
});

test('50-stud nearby includes the edge and skips farther or missing coords', () => {
  const origin = { username: 'Colin', robloxId: '1', location: { x: 100, z: 100 } };
  const close = { username: 'Close', robloxId: '2', location: { x: 130, z: 140 } };
  const edge = { username: 'Edge', robloxId: '3', location: { x: 150, z: 100 } };
  const far = { username: 'Far', robloxId: '4', location: { x: 151, z: 100 } };
  const lost = { username: 'Lost', robloxId: '5', location: {} };
  assert.equal(playerStudDistance(origin, close), 50);
  assert.equal(SCENE_NEARBY_STUDS, 50);
  assert.deepEqual(
    playersWithinStuds(origin, [origin, close, edge, far, lost]).map((player) => player.username),
    ['Close', 'Edge'],
  );
});

test(';civ also drags in-game players within 50 studs into the same VC', async () => {
  const dest = voice('civ2', 'Civilian 2');
  const lobby = voice('lobby', 'Lobby');
  const other = voice('other', 'Other');
  function voiceUser(id, channel) {
    const user = {
      id,
      user: { bot: false, tag: id },
      voice: {
        channelId: channel.id,
        channel,
        setChannel: async (next) => {
          user.voice.channelId = next.id;
          user.movedTo = next.id;
        },
      },
    };
    return user;
  }
  const commander = voiceUser('discord1', lobby);
  const nearby = voiceUser('discord2', other);
  const far = voiceUser('discord3', other);
  const silent = voiceUser('discord4', { id: null });
  silent.voice.channelId = null;
  const members = new Map([
    [commander.id, commander],
    [nearby.id, nearby],
    [far.id, far],
    [silent.id, silent],
  ]);
  const client = {
    guilds: {
      cache: {
        get: () => ({
          members: {
            me: { permissions: { has: () => true } },
            cache: { get: (id) => members.get(id) || null, size: members.size, values: () => members.values() },
            fetch: async (id) => members.get(id) || null,
          },
          channels: {
            cache: {
              size: 10,
              get: (id) => (id === dest.id ? dest : id === lobby.id ? lobby : id === other.id ? other : null),
              values: () => [lobby, dest, other].values(),
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
      config: { guildId: 'guild' },
      now: 50_000,
      identities: new Map([
        ['99', 'discord1'],
        ['100', 'discord2'],
        ['101', 'discord3'],
        ['102', 'discord4'],
      ]),
      snapshot: async () => ({
        Players: [
          { username: 'Colin', robloxId: '99', team: 'Civilian', location: { x: 100, z: 100 } },
          { username: 'Near', robloxId: '100', team: 'Civilian', location: { x: 120, z: 110 } },
          { username: 'Far', robloxId: '101', team: 'Civilian', location: { x: 400, z: 400 } },
          { username: 'Silent', robloxId: '102', team: 'Civilian', location: { x: 101, z: 101 } },
        ],
      }),
    },
  );
  assert.equal(result.handled, true);
  assert.equal(result.nearbyMoved, 1);
  assert.equal(commander.movedTo, 'civ2');
  assert.equal(nearby.movedTo, 'civ2');
  assert.equal(far.movedTo, undefined);
  assert.equal(silent.movedTo, undefined);
});

test(';team does not drag nearby players', async () => {
  const fire = voice('1514128961951760515', 'Fire Dispatch');
  const lobby = voice('lobby', 'Lobby');
  function voiceUser(id) {
    const user = {
      id,
      user: { bot: false, tag: id },
      voice: {
        channelId: 'lobby',
        channel: lobby,
        setChannel: async (channel) => { user.movedTo = channel.id; },
      },
    };
    return user;
  }
  const commander = voiceUser('discord1');
  const nearby = voiceUser('discord2');
  const members = new Map([[commander.id, commander], [nearby.id, nearby]]);
  const guild = {
    members: {
      me: { permissions: { has: () => true } },
      cache: { get: (id) => members.get(id) || null, size: 2, values: () => members.values() },
      fetch: async (id) => members.get(id) || null,
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
  const result = await handleErlcSceneEvent(
    { Player: 'Colin:99', Message: ';team' },
    {
      client: { guilds: { cache: { get: () => guild }, fetch: async () => guild } },
      config: { guildId: 'guild' },
      identities: new Map([['99', 'discord1'], ['100', 'discord2']]),
      now: 40_000,
      snapshot: async () => ({
        Players: [
          { username: 'Colin', robloxId: '99', team: 'Fire', location: { x: 10, z: 10 } },
          { username: 'Near', robloxId: '100', team: 'Fire', location: { x: 11, z: 10 } },
        ],
      }),
    },
  );
  assert.equal(result.reason, 'moved');
  assert.equal(commander.movedTo, TEAM_VOICE_CHANNEL_IDS.fire);
  assert.equal(result.nearbyMoved, 0);
  assert.equal(nearby.movedTo, undefined);
});

test('majority already in a matching VC stays there instead of opening a new empty one', () => {
  const civ4 = voice('c4', 'Civilian 4');
  const lobby = voice('lobby', 'Lobby');
  const a = { id: '1', voice: { channelId: 'c4', channel: civ4 } };
  const b = { id: '2', voice: { channelId: 'c4', channel: civ4 } };
  const c = { id: '3', voice: { channelId: 'lobby', channel: lobby } };
  const d = { id: '4', voice: { channelId: 'c5', channel: voice('c5', 'Civilian 5') } };
  assert.equal(majorityMatchingVoiceChannel([a, b, c], 'Civilian').id, 'c4');
  assert.equal(majorityMatchingVoiceChannel([a, d], 'Civilian'), null);
  assert.equal(majorityMatchingVoiceChannel([a], 'Civilian').id, 'c4');
});

test(';civ keeps the existing scene VC and only drags people who are missing', async () => {
  const civ4 = voice('c4', 'Civilian 4', [{ id: 'discord1', user: { bot: false } }, { id: 'discord2', user: { bot: false } }]);
  const empty = voice('c2', 'Civilian 2');
  const lobby = voice('lobby', 'Lobby');
  function voiceUser(id, channel) {
    const user = {
      id,
      user: { bot: false, tag: id },
      voice: {
        channelId: channel.id,
        channel,
        setChannel: async (next) => {
          user.voice.channelId = next.id;
          user.movedTo = next.id;
        },
      },
    };
    return user;
  }
  const commander = voiceUser('discord1', civ4);
  const already = voiceUser('discord2', civ4);
  const missing = voiceUser('discord3', lobby);
  const members = new Map([
    [commander.id, commander],
    [already.id, already],
    [missing.id, missing],
  ]);
  const client = {
    guilds: {
      cache: {
        get: () => ({
          members: {
            me: { permissions: { has: () => true } },
            cache: { get: (id) => members.get(id) || null, size: members.size, values: () => members.values() },
            fetch: async (id) => members.get(id) || null,
          },
          channels: {
            cache: {
              size: 10,
              get: (id) => ({ c4: civ4, c2: empty, lobby }[id] || null),
              values: () => [civ4, empty, lobby].values(),
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
      config: { guildId: 'guild' },
      now: 80_000,
      identities: new Map([
        ['99', 'discord1'],
        ['100', 'discord2'],
        ['101', 'discord3'],
      ]),
      snapshot: async () => ({
        Players: [
          { username: 'Colin', robloxId: '99', team: 'Civilian', location: { x: 100, z: 100 } },
          { username: 'Already', robloxId: '100', team: 'Civilian', location: { x: 110, z: 100 } },
          { username: 'Missing', robloxId: '101', team: 'Civilian', location: { x: 120, z: 100 } },
        ],
      }),
    },
  );
  assert.equal(result.handled, true);
  assert.equal(result.channelId, 'c4');
  assert.equal(result.nearbyMoved, 1);
  assert.equal(commander.movedTo, undefined);
  assert.equal(already.movedTo, undefined);
  assert.equal(missing.movedTo, 'c4');
});
