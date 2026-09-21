import test from 'node:test';
import assert from 'node:assert/strict';
import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import {
  SOUNDBOARD_CHANNEL_ID,
  SOUNDBOARD_SOURCE_GUILD_ID,
  SOUNDBOARD_SOURCE_ROLE_ID,
  SOUNDBOARD_TARGET_GUILD_ID,
  handleSoundboardMemberUpdate,
  memberHasSoundboardSourceRole,
  overwriteAllowsOnlySoundboard,
  setSoundboardOverwrite,
  shouldDeleteOverwriteAfterRevoke,
  sourceRolesIncludeSoundboard,
} from '../utils/soundboardAccess.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';

test('soundboard access uses the source role, source guild, and main LEO voice channel', () => {
  assert.equal(SOUNDBOARD_SOURCE_ROLE_ID, '1515129421898448996');
  assert.equal(SOUNDBOARD_SOURCE_GUILD_ID, '1515101455525085337');
  assert.equal(SOUNDBOARD_CHANNEL_ID, '1514128904783139018');
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

test('gaining the source role grants the channel overwrite', async () => {
  const channel = mockChannel();
  const client = {
    channels: {
      cache: new Map(),
      fetch: async () => ({
        isVoiceBased: () => true,
        guild: { id: CLEARWATER_GUILD_ID },
        permissionOverwrites: channel.permissionOverwrites,
      }),
    },
  };
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
});
