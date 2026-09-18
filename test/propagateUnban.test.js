import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';
import { propagateMainServerUnban } from '../events/guildBanRemove.js';

function guild({ id, canBan = true, remove } = {}) {
  return {
    id,
    members: {
      me: {
        permissions: { has: (bit) => bit === PermissionFlagsBits.BanMembers && canBan },
      },
    },
    bans: {
      remove: remove || (async () => {}),
    },
  };
}

test('unbans from other bot guilds only when the main server unbans', async () => {
  const removed = [];
  const main = guild({ id: CLEARWATER_GUILD_ID });
  const pinellas = guild({
    id: '1514100977920245760',
    remove: async (userId, reason) => { removed.push({ userId, reason, guild: 'pinellas' }); },
  });
  const extra = guild({
    id: '999',
    remove: async (userId) => { removed.push({ userId, guild: 'extra' }); },
  });
  const client = {
    guilds: {
      cache: new Map([[main.id, main], [pinellas.id, pinellas], [extra.id, extra]]),
      fetch: async () => {},
    },
  };

  const skipped = await propagateMainServerUnban(
    { guild: pinellas, user: { id: '123456789012345678' } },
    client,
  );
  assert.equal(skipped.skipped, true);
  assert.deepEqual(removed, []);

  const result = await propagateMainServerUnban(
    { guild: main, user: { id: '123456789012345678' } },
    client,
  );
  assert.equal(result.skipped, false);
  assert.deepEqual(removed.map((entry) => entry.guild).sort(), ['extra', 'pinellas']);
  assert.equal(removed[0].userId, '123456789012345678');
  assert.match(removed.find((entry) => entry.guild === 'pinellas').reason, /main Clearwater/);
});

test('does not treat missing bans as failures', async () => {
  const other = guild({
    id: '1514100977920245760',
    remove: async () => {
      const error = new Error('Unknown Ban');
      error.code = 10026;
      throw error;
    },
  });
  const client = {
    guilds: {
      cache: new Map([
        [CLEARWATER_GUILD_ID, guild({ id: CLEARWATER_GUILD_ID })],
        [other.id, other],
      ]),
      fetch: async () => {},
    },
  };
  const result = await propagateMainServerUnban(
    { guild: { id: CLEARWATER_GUILD_ID }, user: { id: '123456789012345678' } },
    client,
  );
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[0].reason, 'not-banned');
});
