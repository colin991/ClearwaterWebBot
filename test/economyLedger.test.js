import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeathFee,
  completeRobberyIfReady,
  depositCash,
  economyBlocksPriority,
  emptyEconomyStore,
  failRobbery,
  grantStarter,
  grantWeeklyDepartmentFunds,
  payDepartmentShift,
  payJobInterval,
  recentTransactions,
  reserveRobbery,
  beginRobbery,
  robberyStatus,
  transferCash,
  trySteal,
  withdrawBank,
} from '../utils/economyLedger.js';
import { ECONOMY_STARTER_GRANT, ECONOMY_DEATH_FEE, ECONOMY_DEPARTMENTS, departmentByGuildId, isPaidCivilianJob } from '../utils/economyConfig.js';

test('starter grant is once per user and writes STARTER_GRANT', () => {
  const store = emptyEconomyStore();
  const first = grantStarter(store, 'u1');
  const second = grantStarter(store, 'u1');
  assert.equal(first.granted, true);
  assert.equal(first.user.cash, ECONOMY_STARTER_GRANT);
  assert.equal(first.tx.type, 'STARTER_GRANT');
  assert.equal(second.granted, false);
  assert.equal(store.users.u1.cash, ECONOMY_STARTER_GRANT);
});

test('deposit and withdraw keep cash and bank separate', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'u1');
  depositCash(store, 'u1', 400);
  assert.equal(store.users.u1.cash, 600);
  assert.equal(store.users.u1.bank, 400);
  withdrawBank(store, 'u1', 100);
  assert.equal(store.users.u1.cash, 700);
  assert.equal(store.users.u1.bank, 300);
});

test('transfers move cash only and cannot overspend', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'a');
  grantStarter(store, 'b');
  const result = transferCash(store, 'a', 'b', 250, { note: 'test' });
  assert.equal(store.users.a.cash, 750);
  assert.equal(store.users.b.cash, 1250);
  assert.equal(result.outgoing.referenceId, result.incoming.referenceId);
  assert.throws(() => transferCash(store, 'a', 'b', 99999), /do not have/);
});

test('death fee can go negative and is charged once per fingerprint', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'u1');
  store.users.u1.cash = 200;
  const first = applyDeathFee(store, 'u1', 'kill-1');
  const second = applyDeathFee(store, 'u1', 'kill-1');
  assert.equal(first.charged, true);
  assert.equal(second.charged, false);
  assert.equal(store.users.u1.cash, 200 - ECONOMY_DEATH_FEE);
  assert.equal(first.tx.type, 'DEATH_FEE');
});

test('steal only takes cash and can fail server-side', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'thief');
  grantStarter(store, 'victim');
  depositCash(store, 'victim', 800);
  const fail = trySteal(store, 'thief', 'victim', {
    distance: 4,
    thiefTeam: 'Civilian',
    victimTeam: 'Civilian',
    roll: 90,
  });
  assert.equal(fail.success, false);
  assert.equal(store.users.victim.bank, 800);
  store.steals = {};
  const win = trySteal(store, 'thief', 'victim', {
    now: Date.now() + 60_000,
    distance: 4,
    thiefTeam: 'Civilian',
    victimTeam: 'Civilian',
    roll: 10,
  });
  assert.equal(win.success, true);
  assert.equal(store.users.victim.bank, 800);
  assert.equal(store.users.victim.cash + store.users.thief.cash, 1200);
});

test('civilian job pay waits a full interval on the same job, not unemployed Civilian', () => {
  const store = emptyEconomyStore();
  const t0 = 1_000_000;
  assert.equal(payJobInterval(store, 'u1', { now: t0, team: 'Civilian' }).reason, 'left-job');
  assert.equal(payJobInterval(store, 'u1', { now: t0, team: 'Civilian', job: 'Bank' }).paid, false);
  assert.equal(payJobInterval(store, 'u1', { now: t0 + 9 * 60_000, team: 'Civilian', job: 'Bank' }).paid, false);
  const paid = payJobInterval(store, 'u1', { now: t0 + 10 * 60_000, team: 'Civilian', job: 'Bank' });
  assert.equal(paid.paid, true);
  assert.equal(paid.amount, 50);
  assert.equal(payJobInterval(store, 'u1', { now: t0 + 10 * 60_000, team: 'Civilian' }).paid, false);
  assert.equal(store.jobs.u1, undefined);
});

test('department weekly grants run once per week and payroll comes from treasury', () => {
  const store = emptyEconomyStore();
  const granted = grantWeeklyDepartmentFunds(store, { now: Date.parse('2026-09-25T12:00:00Z') });
  assert.equal(granted.length, 5);
  assert.equal(store.departments.fhp.balance, 500_000);
  grantWeeklyDepartmentFunds(store, { now: Date.parse('2026-09-25T18:00:00Z') });
  assert.equal(store.departments.fhp.balance, 500_000);
  const armed = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 20 * 60_000 });
  assert.equal(armed.paid, false);
  assert.equal(armed.reason, 'armed');
  assert.equal(store.users.cop, undefined);
  const pay = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 30 * 60_000 });
  assert.equal(pay.paid, true);
  assert.equal(pay.amount, 200);
  assert.equal(store.departments.fhp.balance, 499_800);
  assert.equal(store.users.cop.cash, 200);
  const duplicate = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 'other', elapsedMs: 30 * 60_000 });
  assert.equal(duplicate.paid, false);
  store.departments.fhp.balance = 50;
  const broke = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 40 * 60_000 });
  assert.equal(broke.reason, 'insufficient');
  assert.equal(store.users.cop.cash, 200);
});

test('department and player transaction lists keep payroll as one row', () => {
  const store = emptyEconomyStore();
  grantWeeklyDepartmentFunds(store, { now: Date.parse('2026-09-25T12:00:00Z') });
  payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 0 });
  payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 10 * 60_000 });
  const deptRows = recentTransactions(store, { deptId: 'fhp', limit: 20 });
  const userRows = recentTransactions(store, { userId: 'cop', limit: 20 });
  assert.equal(deptRows.filter((tx) => tx.type === 'DEPARTMENT_SHIFT_PAY').length, 0);
  assert.equal(deptRows.filter((tx) => tx.type === 'DEPARTMENT_PAYROLL').length, 1);
  assert.equal(userRows.filter((tx) => tx.type === 'DEPARTMENT_PAYROLL').length, 0);
  assert.equal(userRows.filter((tx) => tx.type === 'DEPARTMENT_SHIFT_PAY').length, 1);
});

test('robberies block priorities while reserved/active and pay once', () => {
  const store = emptyEconomyStore();
  const blocked = robberyStatus(store, { leoCount: 3 });
  assert.equal(blocked.reasons.bank, 'NOT ENOUGH LEO');
  reserveRobbery(store, 'house', 'u1', { leoCount: 12 });
  assert.equal(economyBlocksPriority(store), true);
  beginRobbery(store, 'u1', { x: 0, z: 0 });
  assert.equal(store.robbery.status, 'active');
  store.robbery.sceneComplete = true;
  store.robbery.endsAt = Date.now() - 1;
  const first = completeRobberyIfReady(store, 'u1', { payout: 2000 });
  const second = completeRobberyIfReady(store, 'u1', { payout: 2000 });
  assert.equal(first.paid, true);
  assert.equal(second.paid, false);
  assert.equal(store.users.u1.cash, 2000);
  failRobbery(store, 'cancelled');
});

test('unemployed Civilian is not a paid job', () => {
  assert.equal(isPaidCivilianJob('Civilian'), false);
  assert.equal(isPaidCivilianJob('Civilian', ''), false);
  assert.equal(isPaidCivilianJob('Civilian', 'Civilian'), false);
  assert.equal(isPaidCivilianJob('Civilian', 'Bank'), true);
  assert.equal(isPaidCivilianJob('Civilian', 'Delivery Driver'), true);
  assert.equal(isPaidCivilianJob('Bank'), true);
  assert.equal(isPaidCivilianJob('Police'), false);
  assert.equal(isPaidCivilianJob('FHP'), false);
});

test('player parser keeps Job separate from Civilian team', async () => {
  const { parseErlcPlayer } = await import('../utils/erlc.js');
  const unemployed = parseErlcPlayer({ Player: 'Alex:1', Team: 'Civilian' });
  assert.equal(unemployed.team, 'Civilian');
  assert.equal(unemployed.job, '');
  const bank = parseErlcPlayer({ Player: 'Alex:1', Team: 'Civilian', Job: 'Bank' });
  assert.equal(bank.job, 'Bank');
});

test('department Discord IDs map to the configured treasuries', () => {
  assert.equal(departmentByGuildId('1513609541483499790').id, 'fhp');
  assert.equal(departmentByGuildId('1514100977920245760').id, 'pcso');
  assert.equal(departmentByGuildId('1515101455525085337').id, 'dispatch');
  assert.equal(departmentByGuildId('1514804886292795544').id, 'cfr');
  assert.equal(departmentByGuildId('1526890993327280240').id, 'bpd');
});

test('every department treasury pulls Melonly shifts from its own department', () => {
  const ids = Object.fromEntries(ECONOMY_DEPARTMENTS.map((dept) => [dept.id, dept.melonlyDepartmentId]));
  assert.equal(ids.fhp, '7470614371899543552');
  assert.equal(ids.pcso, '7470323914464301056');
  assert.equal(ids.dispatch, '7471402738098638848');
  assert.equal(ids.cfr, '7471029576076890112');
  assert.equal(ids.bpd, '7492084093606170624');
  assert.equal(ECONOMY_DEPARTMENTS.every((dept) => Boolean(dept.melonlyDepartmentId)), true);
});

test('in-game steal PMs strip dollar signs that ER:LC censors', async () => {
  const { sanitizeGamePm, dmEconomyUser } = await import('../utils/economyService.js');
  assert.equal(sanitizeGamePm('You successfully stole $1,250 from Alex.'), 'You successfully stole 1,250 from Alex.');
  const sent = [];
  const ok = await dmEconomyUser({
    guilds: { cache: { get: () => null }, fetch: async () => null },
    users: {
      fetch: async (id) => ({
        id,
        createDM: async () => ({ send: async (payload) => { sent.push(payload); } }),
      }),
    },
  }, '123', { title: 'Steal successful', description: 'You stole **$50** cash.' });
  assert.equal(ok, true);
  assert.match(sent[0].content, /Steal successful/);
  assert.match(sent[0].content, /\$50/);
});
