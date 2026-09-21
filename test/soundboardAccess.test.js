import test from 'node:test';
import assert from 'node:assert/strict';
import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import {
  SOUNDBOARD_CHANNEL_ID,
  SOUNDBOARD_CHANNEL_IDS,
  SOUNDBOARD_SOURCE_GUILD_ID,
  SOUNDBOARD_SOURCE_ROLE_ID,
  SOUNDBOARD_TARGET_GUILD_ID,
  handleSoundboardMemberRemove,
  handleSoundboardMemberUpdate,
  listSourceMembersWithRole,
  memberHasSoundboardSourceRole,
  overwriteAllowsOnlySoundboard,
  setSoundboardOverwrite,
  shouldDeleteOverwriteAfterRevoke,
  sourceRolesIncludeSoundboard,
  syncSoundboardAccess,
} from '../utils/soundboardAccess.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';

test('soundboard access uses the source role and both main-server voice channels', () => {
  assert.equal(SOUNDBOARD_SOURCE_ROLE_ID, '1515129421898448996');
  assert.equal(SOUNDBOARD_SOURCE_GUILD_ID, '1515101455525085337');
  assert.equal(SOUNDBOARD_CHANNEL_ID, '1514128904783139018');
  assert.deepEqual(SOUNDBOARD_CHANNEL_IDS, ['1514128904783139018', '1514128961951760515']);
  assert.equal(SOUNDBOARD_TARGET_GUILD_ID, CLEARWATER_GUILD_ID);
});

test('source role membership is detected from role ids', () => {
  assert.equal(sourceRolesIncludeSoundboard([SOUNDBOARD_SOURCE_ROLE_ID]), true);
  assert.equal(sourceRolesIncludeSoundboard(['1', '2']), false);
  const member = {
    user: { bot: false },
    guild: { id: SOUNDBOARD_SOURCE_GUILD_ID },
    roles: { cache: { has: (id) => id === SOUNDBOARD_SOURCE_ROLE_ID } },
  };
  assert.equal(memberHasSoundboardSourceRole(member), true);
  assert.equal(memberHasSoundboardSourceRole({ ...member, guild: { id: '1' } }), false);
});

test('only-soundboard member overwrites can be deleted when the role is removed', () => {
  const overwrite = {
    type: OverwriteType.Member,
    allow: {
      bitfield: PermissionFlagsBits.UseSoundboard | PermissionFlagsBits.UseExternalSounds,
      has: (bit) => bit === PermissionFlagsBits.UseSoundboard || bit === PermissionFlagsBits.UseExternalSounds,
    },
    deny: { bitfield: 0n },
  };
  assert.equal(overwriteAllowsOnlySoundboard(overwrite), true);
  assert.equal(shouldDeleteOverwriteAfterRevoke(overwrite), true);
});

function mockChannel(existing = new Map()) {
  const edits = [];
  const deletes = [];
  return {
    edits,
    deletes,
    permissionOverwrites: {
      cache: existing,
      edit: async (id, perms) => { edits.push({ id, perms }); },
      delete: async (id) => { deletes.push(id); },
    },
  };
}

test('setSoundboardOverwrite grants Use Soundboard on the channel', async () => {
  const channel = mockChannel();
  const result = await setSoundboardOverwrite(channel, '111111111111111111', true);
  assert.equal(result, 'granted');
  assert.equal(channel.edits[0].perms.UseSoundboard, true);
  assert.equal(channel.edits[0].perms.UseExternalSounds, true);
});

test('setSoundboardOverwrite deletes a soundboard-only overwrite when the role is gone', async () => {
  const existing = new Map([['111111111111111111', {
    id: '111111111111111111',
    type: OverwriteType.Member,
    allow: {
      bitfield: PermissionFlagsBits.UseSoundboard | PermissionFlagsBits.UseExternalSounds,
      has: (bit) => bit === PermissionFlagsBits.UseSoundboard || bit === PermissionFlagsBits.UseExternalSounds,
    },
    deny: { bitfield: 0n },
  }]]);
  const channel = mockChannel(existing);
  const result = await setSoundboardOverwrite(channel, '111111111111111111', false);
  assert.equal(result, 'removed');
  assert.deepEqual(channel.deletes, ['111111111111111111']);
});

function mockClient(channelMap) {
  return {
    channels: {
      cache: new Map(),
      fetch: async (id) => {
        const channel = channelMap.get(String(id));
        if (!channel) return null;
        return {
          id,
          isVoiceBased: () => true,
          guild: { id: CLEARWATER_GUILD_ID },
          permissionOverwrites: channel.permissionOverwrites,
        };
      },
    },
  };
}

test('gaining the source role grants soundboard on both main-server channels', async () => {
  const first = mockChannel();
  const second = mockChannel();
  const client = mockClient(new Map([
    ['1514128904783139018', first],
    ['1514128961951760515', second],
  ]));
  const previous = {
    user: { bot: false },
    guild: { id: SOUNDBOARD_SOURCE_GUILD_ID },
    roles: { cache: { has: () => false } },
  };
  const next = {
    id: '222222222222222222',
    user: { bot: false },
    guild: { id: SOUNDBOARD_SOURCE_GUILD_ID },
    roles: { cache: { has: (id) => id === SOUNDBOARD_SOURCE_ROLE_ID } },
  };
  const result = await handleSoundboardMemberUpdate(previous, next, client);
  assert.equal(result, 'granted');
  assert.equal(first.edits.length, 1);
  assert.equal(second.edits.length, 1);
});

test('losing the source role removes the soundboard overwrites on both channels', async () => {
  const existing = () => new Map([['222222222222222222', {
    id: '222222222222222222',
    type: OverwriteType.Member,
    allow: {
      bitfield: PermissionFlagsBits.UseSoundboard | PermissionFlagsBits.UseExternalSounds,
      has: (bit) => bit === PermissionFlagsBits.UseSoundboard || bit === PermissionFlagsBits.UseExternalSounds,
    },
    deny: { bitfield: 0n },
  }]]);
  const first = mockChannel(existing());
  const second = mockChannel(existing());
  const client = mockClient(new Map([
    ['1514128904783139018', first],
    ['1514128961951760515', second],
  ]));
  const previous = {
    user: { bot: false },
    guild: { id: SOUNDBOARD_SOURCE_GUILD_ID },
    roles: { cache: { has: (id) => id === SOUNDBOARD_SOURCE_ROLE_ID } },
  };
  const next = {
    id: '222222222222222222',
    user: { bot: false },
    guild: { id: SOUNDBOARD_SOURCE_GUILD_ID },
    roles: { cache: { has: () => false } },
  };
  const result = await handleSoundboardMemberUpdate(previous, next, client);
  assert.equal(result, 'removed');
  assert.deepEqual(first.deletes, ['222222222222222222']);
  assert.deepEqual(second.deletes, ['222222222222222222']);
});

test('leaving the source server also removes the soundboard overwrites', async () => {
  const existing = new Map([['222222222222222222', {
    id: '222222222222222222',
    type: OverwriteType.Member,
    allow: {
      bitfield: PermissionFlagsBits.UseSoundboard | PermissionFlagsBits.UseExternalSounds,
      has: (bit) => bit === PermissionFlagsBits.UseSoundboard || bit === PermissionFlagsBits.UseExternalSounds,
    },
    deny: { bitfield: 0n },
  }]]);
  const first = mockChannel(existing);
  const second = mockChannel(new Map(existing));
  const client = mockClient(new Map([
    ['1514128904783139018', first],
    ['1514128961951760515', second],
  ]));
  const result = await handleSoundboardMemberRemove({
    id: '222222222222222222',
    guild: { id: SOUNDBOARD_SOURCE_GUILD_ID },
  }, client);
  assert.equal(result, 'removed');
  assert.deepEqual(first.deletes, ['222222222222222222']);
  assert.deepEqual(second.deletes, ['222222222222222222']);
});

test('REST listing keeps people who currently have the source role', async () => {
  const client = {
    rest: {
      get: async () => ([
        { user: { id: '333333333333333333' }, roles: [SOUNDBOARD_SOURCE_ROLE_ID] },
        { user: { id: '444444444444444444', bot: true }, roles: [SOUNDBOARD_SOURCE_ROLE_ID] },
        { user: { id: '555555555555555555' }, roles: ['1'] },
      ]),
    },
  };
  const listed = await listSourceMembersWithRole(client);
  assert.deepEqual(listed.ids, ['333333333333333333']);
  assert.equal(listed.complete, true);
});

test('restart sync grants current role holders on both channels', async () => {
  const first = mockChannel();
  const second = mockChannel();
  const client = mockClient(new Map([
    ['1514128904783139018', first],
    ['1514128961951760515', second],
  ]));
  client.rest = {
    get: async () => ([{ user: { id: '333333333333333333' }, roles: [SOUNDBOARD_SOURCE_ROLE_ID] }]),
  };
  const result = await syncSoundboardAccess(client);
  assert.equal(result.ok, true);
  assert.equal(result.eligible, 1);
  assert.equal(result.granted, 2);
  assert.equal(first.edits[0].id, '333333333333333333');
  assert.equal(second.edits[0].id, '333333333333333333');
});

test('an empty restart roster does not wipe existing soundboard overwrites', async () => {
  const existing = new Map([['333333333333333333', {
    id: '333333333333333333',
    type: OverwriteType.Member,
    allow: {
      bitfield: PermissionFlagsBits.UseSoundboard | PermissionFlagsBits.UseExternalSounds,
      has: (bit) => bit === PermissionFlagsBits.UseSoundboard || bit === PermissionFlagsBits.UseExternalSounds,
    },
    deny: { bitfield: 0n },
  }]]);
  const first = mockChannel(existing);
  const second = mockChannel(new Map(existing));
  const client = mockClient(new Map([
    ['1514128904783139018', first],
    ['1514128961951760515', second],
  ]));
  client.rest = { get: async () => [] };
  const result = await syncSoundboardAccess(client);
  assert.equal(result.removed, 0);
  assert.deepEqual(first.deletes, []);
  assert.deepEqual(second.deletes, []);
});
