import test from 'node:test';
import assert from 'node:assert/strict';
import fundsCommand from '../prefixCommands/funds.js';
import {
  fetchRobloxGroupFunds,
  formatRobux,
  groupFundsCard,
  looksLikeRobloxCookie,
  normalizeRobloxCookie,
  resolveFundsGroupId,
  ROBLOX_FUNDS_GROUP_ID,
} from '../utils/robloxGroupFunds.js';

test('resolveFundsGroupId defaults to the Clearwater share group 163783791', () => {
  assert.equal(ROBLOX_FUNDS_GROUP_ID, '163783791');
  assert.equal(resolveFundsGroupId({}), '163783791');
  assert.equal(resolveFundsGroupId({ robloxGroupId: '1' }), '1');
  assert.equal(resolveFundsGroupId({ robloxFundsGroupId: '2', robloxGroupId: '1' }), '2');
});

test('normalizeRobloxCookie accepts a raw value or a full cookie header', () => {
  assert.equal(normalizeRobloxCookie('  abc123  '), 'abc123');
  assert.equal(normalizeRobloxCookie('.ROBLOSECURITY=abc123'), 'abc123');
  assert.equal(
    normalizeRobloxCookie('other=1; .ROBLOSECURITY=_|WARNING:-DO-NOT-SHARE-THIS|abc; path=/'),
    '_|WARNING:-DO-NOT-SHARE-THIS|abc',
  );
  assert.equal(looksLikeRobloxCookie('.ROBLOSECURITY=secret'), true);
  assert.equal(looksLikeRobloxCookie('_|WARNING:-DO-NOT-SHARE-THIS|xyz'), true);
  assert.equal(looksLikeRobloxCookie('funds'), false);
});

test('formatRobux uses thousands separators', () => {
  assert.equal(formatRobux(1234567), '1,234,567 Robux');
  assert.equal(formatRobux('40'), '40 Robux');
});

test('fetchRobloxGroupFunds reads economy.roblox.com with the cookie', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), cookie: options.headers.Cookie });
    if (String(url).includes('/currency')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ robux: 5400 }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ name: 'Clearwater Roleplay', memberCount: 1200 }),
    };
  };
  const info = await fetchRobloxGroupFunds({
    groupId: '99',
    cookie: '.ROBLOSECURITY=host-secret',
    fetchImpl,
  });
  assert.equal(info.name, 'Clearwater Roleplay');
  assert.equal(info.robux, 5400);
  assert.equal(info.memberCount, 1200);
  assert.ok(calls.every((call) => call.cookie === '.ROBLOSECURITY=host-secret'));
  assert.match(JSON.stringify(groupFundsCard(info)), /5,400 Robux/);
});

test('fetchRobloxGroupFunds explains a missing cookie or expired cookie', async () => {
  await assert.rejects(
    () => fetchRobloxGroupFunds({ groupId: '99', cookie: '' }),
    /ROBLOX_COOKIE/,
  );
  await assert.rejects(
    () => fetchRobloxGroupFunds({
      groupId: '99',
      cookie: 'stale',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: async () => ({}),
      }),
    }),
    /invalid or expired/,
  );
});

test('-funds requires Ownership and rejects cookies typed in Discord', async () => {
  await assert.rejects(
    () => fundsCommand.execute({
      member: { id: '1', roles: { cache: { has: () => false } } },
      client: { config: { ownerDiscordIds: [], ownerRoleIds: [] } },
      content: '-funds',
    }, []),
    /Ownership/,
  );
  await assert.rejects(
    () => fundsCommand.execute({
      member: { id: 'owner', roles: { cache: { has: () => false } } },
      client: { config: { ownerDiscordIds: ['owner'], ownerRoleIds: [] } },
      content: '-funds .ROBLOSECURITY=do-not-share',
    }, ['.ROBLOSECURITY=do-not-share']),
    /Do not paste/,
  );
});
