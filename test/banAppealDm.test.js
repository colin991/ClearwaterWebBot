import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageFlags } from 'discord.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';
import {
  BAN_APPEAL_LOG_CHANNEL_ID,
  BAN_APPEAL_URL,
  buildBanAppealDmPayload,
  forgetBanAppealDm,
  handleMainServerBan,
  notifyExistingMainServerBans,
  setBanAppealDmDelayMs,
  setBanAppealStorePath,
} from '../utils/banAppealDm.js';

test('ban appeal DM includes the Melonly form and logs to the weather channel', () => {
  const payload = buildBanAppealDmPayload({ reason: 'rule break' });
  const text = JSON.stringify(payload);
  assert.equal(BAN_APPEAL_URL, 'https://melon.ly/form/7508742039031255040');
  assert.equal(BAN_APPEAL_LOG_CHANNEL_ID, '1549178818814812211');
  assert.equal(Boolean(payload.flags & MessageFlags.IsComponentsV2), true);
  assert.match(text, /banned from Clearwater Roleplay/i);
  assert.match(text, /7508742039031255040/);
  assert.match(text, /rule break/);
});

test('new main-server bans DM once, log the result, and skip other guilds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ban-appeal-'));
  setBanAppealStorePath(join(directory, 'store.json'));
  setBanAppealDmDelayMs(0);
  const dms = [];
  const logs = [];
  const user = {
    id: '123456789012345678',
    tag: 'banned#0001',
    bot: false,
    send: async (payload) => { dms.push(payload); },
  };
  const client = {
    channels: {
      cache: {
        get: (id) => (id === BAN_APPEAL_LOG_CHANNEL_ID
          ? { isTextBased: () => true, send: async (payload) => { logs.push(payload.content); } }
          : null),
      },
    },
  };

  const skipped = await handleMainServerBan({ guild: { id: 'other' }, user }, client);
  assert.equal(skipped.skipped, true);
  assert.equal(dms.length, 0);

  const first = await handleMainServerBan({
    guild: { id: CLEARWATER_GUILD_ID },
    user,
    reason: 'RDM',
  }, client);
  const second = await handleMainServerBan({
    guild: { id: CLEARWATER_GUILD_ID },
    user,
    reason: 'RDM',
  }, client);
  assert.equal(first.sent, true);
  assert.equal(second.reason, 'already_notified');
  assert.equal(dms.length, 1);
  assert.match(logs[0], /SENT/);
  assert.match(logs[0], /123456789012345678/);

  await forgetBanAppealDm(user.id);
  const afterUnban = await handleMainServerBan({
    guild: { id: CLEARWATER_GUILD_ID },
    user,
  }, client);
  assert.equal(afterUnban.sent, true);
  assert.equal(dms.length, 2);
  await rm(directory, { recursive: true, force: true });
});

test('restart scan DMs existing main-server bans that were not notified yet', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ban-appeal-'));
  setBanAppealStorePath(join(directory, 'store.json'));
  setBanAppealDmDelayMs(0);
  const dms = [];
  const already = {
    id: '111111111111111111',
    tag: 'old#1',
    bot: false,
    send: async () => { dms.push('old'); },
  };
  const fresh = {
    id: '222222222222222222',
    tag: 'new#2',
    bot: false,
    send: async () => { dms.push('new'); },
  };
  const client = {
    guilds: {
      cache: {
        get: (id) => (id === CLEARWATER_GUILD_ID
          ? {
            bans: {
              fetch: async () => new Map([
                [already.id, { user: already, reason: 'old ban' }],
                [fresh.id, { user: fresh, reason: 'new ban' }],
              ]),
            },
          }
          : null),
      },
    },
    channels: {
      cache: { get: () => ({ isTextBased: () => true, send: async () => {} }) },
    },
  };

  await handleMainServerBan({ guild: { id: CLEARWATER_GUILD_ID }, user: already, reason: 'old ban' }, client);
  dms.length = 0;
  const result = await notifyExistingMainServerBans(client);
  assert.equal(result.scanned, 2);
  assert.equal(result.sent, 1);
  assert.deepEqual(dms, ['new']);
  await rm(directory, { recursive: true, force: true });
});
