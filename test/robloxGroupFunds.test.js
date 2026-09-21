import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import fundsCommand from '../prefixCommands/funds.js';
import {
  fetchRobloxGroupFunds,
  formatRobux,
  formatTransactionLine,
  FUNDS_TRANSACTION_COUNT,
  groupFundsCard,
  looksLikeRobloxCookie,
  normalizeRobloxCookie,
  parseGroupTransaction,
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

test('parseGroupTransaction formats payouts and sales', () => {
  assert.equal(FUNDS_TRANSACTION_COUNT, 7);
  const payout = parseGroupTransaction({
    created: '2026-09-21T00:00:00.000Z',
    agent: { id: 1, name: 'Payee' },
    currency: { amount: 250 },
  }, 'payout');
  const unix = Math.floor(Date.parse('2026-09-21T00:00:00.000Z') / 1000);
  assert.equal(formatTransactionLine(payout, 'payout'), `• Paid **Payee** — **250 Robux** · <t:${unix}:R>`);
  const sale = parseGroupTransaction({
    agent: { id: 2, name: 'Buyer' },
    details: { name: 'Clearwater Shirt' },
    currency: { amount: 5 },
  }, 'sale');
  assert.equal(formatTransactionLine(sale, 'sale'), '• **Buyer** bought Clearwater Shirt — **5 Robux**');
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
    if (String(url).includes('/transactions')) {
      const payout = String(url).includes('GroupPayout');
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          data: payout
            ? [{ agent: { name: 'Payee' }, currency: { amount: 100 } }]
            : [{ agent: { name: 'Buyer' }, details: { name: 'Shirt' }, currency: { amount: 12 } }],
        }),
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
  assert.equal(info.payouts[0].username, 'Payee');
  assert.equal(info.sales[0].item, 'Shirt');
  assert.ok(calls.every((call) => call.cookie === '.ROBLOSECURITY=host-secret'));
  const card = JSON.stringify(groupFundsCard(info));
  assert.match(card, /5,400 Robux/);
  assert.match(card, /Paid \*\*Payee\*\*/);
  assert.match(card, /bought Shirt/);
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

test('-funds requires Administrator and rejects cookies typed in Discord', async () => {
  await assert.rejects(
    () => fundsCommand.execute({
      member: { permissions: { has: () => false } },
      client: { config: {} },
      content: '-funds',
    }, []),
    /Administrator/,
  );
  await assert.rejects(
    () => fundsCommand.execute({
      member: { permissions: { has: (bit) => bit === PermissionFlagsBits.Administrator } },
      client: { config: {} },
      content: '-funds .ROBLOSECURITY=do-not-share',
    }, ['.ROBLOSECURITY=do-not-share']),
    /Do not paste/,
  );
});
