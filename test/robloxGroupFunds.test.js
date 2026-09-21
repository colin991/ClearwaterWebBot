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

test('resolveFundsGroupId uses the treasury group 140437562 and ignores the join-request group', () => {
  assert.equal(ROBLOX_FUNDS_GROUP_ID, '140437562');
  assert.equal(resolveFundsGroupId({}), '140437562');
  assert.equal(resolveFundsGroupId({ robloxGroupId: '163783791' }), '140437562');
  assert.equal(resolveFundsGroupId({ robloxFundsGroupId: '163783791', robloxGroupId: '163783791' }), '140437562');
  assert.equal(resolveFundsGroupId({ robloxFundsGroupId: '999', robloxGroupId: '163783791' }), '999');
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
  const card = groupFundsCard(info);
  assert.match(card.sections[0], /5,400 Robux/);
  assert.equal(card.sections[0].includes('Payouts sent'), false);
  assert.match(card.sections[1], /Paid \*\*Payee\*\*/);
  assert.match(card.sections[2], /bought Shirt/);
});

test('groupFundsCard keeps balance and payouts in separate V2 sections', async () => {
  const { v2Sections } = await import('../utils/v2Message.js');
  const card = groupFundsCard({
    name: 'Clearwater Roleplay',
    memberCount: 10,
    robux: 2994,
    groupId: '163783791',
    payouts: [{ username: 'Payee', amount: 100 }],
    sales: [],
  });
  assert.match(card.sections[0], /\*\*Balance:\*\* 2,994 Robux/);
  assert.match(card.sections[1], /Payouts sent \(last 7\)/);
  assert.match(card.sections[1], /Paid \*\*Payee\*\*/);
  assert.match(card.sections[2], /No sales in recent records/);
  const payload = v2Sections(card.sections);
  const json = payload.components[0].toJSON();
  assert.equal(json.components.length, 4);
});

test('fetchRobloxGroupFunds still shows the balance if transaction pages fail', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/transactions')) {
      return {
        ok: false,
        status: 403,
        headers: { get: () => null },
        json: async () => ({}),
      };
    }
    if (String(url).includes('/currency')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ robux: 2994 }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ name: 'Clearwater Roleplay', memberCount: 1 }),
    };
  };
  const info = await fetchRobloxGroupFunds({
    groupId: '163783791',
    cookie: 'host-secret',
    fetchImpl,
  });
  assert.equal(info.robux, 2994);
  assert.equal(info.payoutsError, 'no permission');
  const card = JSON.stringify(groupFundsCard(info));
  assert.match(card, /Could not load payouts/);
  assert.match(card, /Could not load sales/);
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
