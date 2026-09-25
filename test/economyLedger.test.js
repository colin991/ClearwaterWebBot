import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCitationFine,
  applyDeathFee,
  completeRobberyIfReady,
  confirmRobbery,
  depositCash,
  economyBlocksPriority,
  emptyEconomyStore,
  failRobbery,
  grantStarter,
  grantWeeklyDepartmentFunds,
  payDepartmentShift,
  payJobInterval,
  recentTransactions,
  refundTransaction,
  reserveRobbery,
  beginRobbery,
  robberyStatus,
  spendDepartmentFunds,
  stopMissingJobSessions,
  transferCash,
  trySteal,
  withdrawBank,
} from '../utils/economyLedger.js';
import { ECONOMY_STARTER_GRANT, ECONOMY_DEATH_FEE, ECONOMY_DEPARTMENTS, ECONOMY_JOB_PAY, ECONOMY_ROBBERIES, departmentByGuildId, isPaidCivilianJob, matchRobberyKindFromText } from '../utils/economyConfig.js';

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
  assert.equal(store.users.u1.cash, ECONOMY_STARTER_GRANT - 400);
  assert.equal(store.users.u1.bank, 400);
  withdrawBank(store, 'u1', 100);
  assert.equal(store.users.u1.cash, ECONOMY_STARTER_GRANT - 300);
  assert.equal(store.users.u1.bank, 300);
});

test('transfers take a 5% tax for the server treasury', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'a');
  grantStarter(store, 'b');
  const result = transferCash(store, 'a', 'b', 250, { note: 'test' });
  assert.equal(store.users.a.cash, ECONOMY_STARTER_GRANT - 250);
  assert.equal(result.taxAmount, 12);
  assert.equal(result.received, 238);
  assert.equal(store.users.b.cash, ECONOMY_STARTER_GRANT + 238);
  assert.equal(store.server.balance, 12);
  assert.equal(result.outgoing.referenceId, result.incoming.referenceId);
  assert.equal(result.tax.referenceId, result.incoming.referenceId);
  assert.throws(() => transferCash(store, 'a', 'b', 99999), /do not have/);
  const later = Date.now() + 10_000;
  const small = transferCash(store, 'a', 'b', 19, { now: later });
  assert.equal(small.taxAmount, 0);
  assert.equal(small.received, 19);
});

test('refunding a taxed send returns the tax from the server treasury', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'a');
  grantStarter(store, 'b');
  const result = transferCash(store, 'a', 'b', 250, { note: 'test' });
  const refunded = refundTransaction(store, result.referenceId, { adminId: 'staff', reason: 'test refund' });
  assert.equal(store.users.a.cash, ECONOMY_STARTER_GRANT);
  assert.equal(store.users.b.cash, ECONOMY_STARTER_GRANT);
  assert.equal(store.server.balance, 0);
  assert.equal(refunded.tx.type, 'REFUND');
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

test('citation fines take cash then bank, can go negative, and credit the server once', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'u1');
  store.users.u1.cash = 1000;
  depositCash(store, 'u1', 400);
  const first = applyCitationFine(store, 'u1', 900, { recordId: 'cad-1', note: 'speeding' });
  assert.equal(first.charged, true);
  assert.equal(first.tx.type, 'CITATION_FINE');
  assert.equal(store.users.u1.cash, 0);
  assert.equal(store.users.u1.bank, 100);
  assert.equal(store.server.balance, 900);
  const dup = applyCitationFine(store, 'u1', 900, { recordId: 'cad-1' });
  assert.equal(dup.charged, false);
  assert.equal(store.server.balance, 900);
  const overdraft = applyCitationFine(store, 'u1', 250, { recordId: 'cad-2' });
  assert.equal(overdraft.charged, true);
  assert.equal(store.users.u1.cash, -150);
  assert.equal(store.users.u1.bank, 0);
  assert.equal(store.server.balance, 1150);
});

test('steal only takes cash and can fail server-side', () => {
  const store = emptyEconomyStore();
  grantStarter(store, 'thief');
  grantStarter(store, 'victim');
  store.users.victim.cash = 1000;
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
  assert.equal(store.users.victim.cash + store.users.thief.cash, ECONOMY_STARTER_GRANT + 200);
});

test('Civilian team pay waits a full interval and stops on another team', () => {
  const store = emptyEconomyStore();
  const t0 = 1_000_000;
  assert.equal(payJobInterval(store, 'u1', { now: t0, team: 'Civilian' }).reason, 'started');
  assert.equal(payJobInterval(store, 'u1', { now: t0 + 9 * 60_000, team: 'Civilian' }).paid, false);
  const paid = payJobInterval(store, 'u1', { now: t0 + 10 * 60_000, team: 'Civilian' });
  assert.equal(paid.paid, true);
  assert.equal(paid.amount, ECONOMY_JOB_PAY);
  assert.equal(payJobInterval(store, 'u1', { now: t0 + 10 * 60_000, team: 'Police' }).paid, false);
  assert.equal(store.jobs.u1, undefined);
});

test('department weekly grants run once per week and payroll comes from treasury', () => {
  const store = emptyEconomyStore();
  const granted = grantWeeklyDepartmentFunds(store, { now: Date.parse('2026-09-25T12:00:00Z') });
  assert.equal(granted.length, 5);
  assert.equal(store.departments.fhp.balance, 250_000);
  grantWeeklyDepartmentFunds(store, { now: Date.parse('2026-09-25T18:00:00Z') });
  assert.equal(store.departments.fhp.balance, 250_000);
  const armed = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 20 * 60_000 });
  assert.equal(armed.paid, false);
  assert.equal(armed.reason, 'armed');
  assert.equal(store.users.cop, undefined);
  const pay = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 30 * 60_000 });
  assert.equal(pay.paid, true);
  assert.equal(pay.amount, 100);
  assert.equal(store.departments.fhp.balance, 249_900);
  assert.equal(store.users.cop.cash, 100);
  const duplicate = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 'other', elapsedMs: 30 * 60_000 });
  assert.equal(duplicate.paid, false);
  store.departments.fhp.balance = 50;
  const broke = payDepartmentShift(store, 'fhp', 'cop', { shiftKey: 's1', elapsedMs: 40 * 60_000 });
  assert.equal(broke.reason, 'insufficient');
  assert.equal(store.users.cop.cash, 100);
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

test('department funds can send to a person or the server with a note', () => {
  const store = emptyEconomyStore();
  grantWeeklyDepartmentFunds(store, { now: Date.parse('2026-09-25T12:00:00Z') });
  assert.throws(() => spendDepartmentFunds(store, 'fhp', 100, { toId: 'u1' }), /note/);
  const person = spendDepartmentFunds(store, 'fhp', 1000, {
    toId: 'u1',
    note: 'equipment reimbursement',
    authorizedBy: 'boss',
  });
  assert.equal(store.departments.fhp.balance, 249_000);
  assert.equal(store.users.u1.cash, 1000);
  assert.equal(person.tx.note, 'equipment reimbursement');
  assert.equal(person.creditTx.amount, 1000);
  const userRows = recentTransactions(store, { userId: 'u1', limit: 10 });
  assert.equal(userRows.some((tx) => tx.amount === 1000 && tx.note === 'equipment reimbursement'), true);
  assert.equal(userRows.some((tx) => tx.amount < 0), false);
  const serverPay = spendDepartmentFunds(store, 'pcso', 2500, {
    toServer: true,
    note: 'city event support',
  });
  assert.equal(store.departments.pcso.balance, 247_500);
  assert.equal(store.server.balance, 2500);
  assert.equal(serverPay.tx.toServer, true);
  const serverRows = recentTransactions(store, { server: true, limit: 5 });
  assert.equal(serverRows[0].note, 'city event support');
});

test('robberies wait for confirmation, then a payout hold, and pay once', () => {
  const store = emptyEconomyStore();
  const blocked = robberyStatus(store, { leoCount: 3 });
  assert.equal(blocked.reasons.bank, 'NOT ENOUGH LEO');
  reserveRobbery(store, 'house', 'u1', { leoCount: 12 });
  assert.equal(economyBlocksPriority(store), true);
  beginRobbery(store, 'u1', { x: 0, z: 0 });
  assert.equal(store.robbery.status, 'reserved');
  assert.equal(store.robbery.preparing, true);
  const t0 = 1_000_000;
  const confirmed = confirmRobbery(store, 'u1', { now: t0 });
  assert.equal(confirmed.confirmed, true);
  assert.equal(store.robbery.status, 'active');
  store.robbery.sceneComplete = true;
  assert.equal(completeRobberyIfReady(store, 'u1', { now: t0 }).paid, false);
  const held = completeRobberyIfReady(store, 'u1', { now: t0 + 8 * 60_000 });
  assert.equal(held.held, true);
  assert.equal(held.paid, false);
  assert.equal(store.robbery.status, 'holding');
  assert.equal(completeRobberyIfReady(store, 'u1', { now: t0 + 8 * 60_000 + 60_000 }).paid, false);
  const first = completeRobberyIfReady(store, 'u1', { now: t0 + 8 * 60_000 + 5 * 60_000, payout: 2000 });
  const second = completeRobberyIfReady(store, 'u1', { now: t0 + 8 * 60_000 + 5 * 60_000, payout: 2000 });
  assert.equal(first.paid, true);
  assert.equal(second.paid, false);
  assert.equal(store.users.u1.cash, 2000);
  failRobbery(store, 'cancelled');
});

test('dying during the payout hold cancels the money', () => {
  const store = emptyEconomyStore();
  reserveRobbery(store, 'atm', 'u1', { leoCount: 12 });
  const t0 = 5_000_000;
  confirmRobbery(store, 'u1', { now: t0 });
  store.robbery.sceneComplete = true;
  completeRobberyIfReady(store, 'u1', { now: t0 + 8 * 60_000 });
  assert.equal(store.robbery.status, 'holding');
  failRobbery(store, 'died', { now: t0 + 8 * 60_000 + 30_000 });
  assert.equal(store.robbery.status, 'idle');
  assert.equal(store.users.u1, undefined);
});

test('in-game call text maps to robbery kinds', () => {
  assert.equal(matchRobberyKindFromText('Bank Robbery'), 'bank');
  assert.equal(matchRobberyKindFromText('bank heist in progress'), 'bank');
  assert.equal(matchRobberyKindFromText('Jewelry Store Robbery'), 'jewelry');
  assert.equal(matchRobberyKindFromText('ATM robbery'), 'atm');
  assert.equal(matchRobberyKindFromText('Cash Register Robbery'), 'register');
  assert.equal(matchRobberyKindFromText('House robbery'), 'house');
  assert.equal(matchRobberyKindFromText('Civilian'), '');
  assert.equal(matchRobberyKindFromText('Bank teller'), '');
});

test('all Civilian players are pay eligible regardless of an unavailable job title', () => {
  assert.equal(isPaidCivilianJob('Civilian'), true);
  assert.equal(isPaidCivilianJob('Civilian', ''), true);
  assert.equal(isPaidCivilianJob('Civilian', 'Civilian'), true);
  assert.equal(isPaidCivilianJob('Civilian', 'Bank'), true);
  assert.equal(isPaidCivilianJob('Civilian', 'Delivery Driver'), true);
  assert.equal(isPaidCivilianJob('Bank'), false);
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
  const structured = parseErlcPlayer({ Player: 'Alex:1', Team: 'Civilian', CurrentJob: { Name: 'Delivery Driver' } });
  assert.equal(structured.job, 'Delivery Driver');
});

test('leaving the live roster stops a civilian job timer', () => {
  const store = emptyEconomyStore();
  payJobInterval(store, 'working', { team: 'Civilian', job: 'Bank' });
  payJobInterval(store, 'present', { team: 'Civilian', job: 'Delivery' });
  assert.equal(stopMissingJobSessions(store, new Set(['present'])), 1);
  assert.equal(store.jobs.working, undefined);
  assert.equal(store.jobs.present.team, 'Civilian');
});

test('robberies use the exact configured payouts', () => {
  assert.deepEqual(Object.fromEntries(ECONOMY_ROBBERIES.map((entry) => [entry.id, entry.payout])), {
    bank: 6500,
    jewelry: 3000,
    house: 1500,
    atm: 700,
    register: 300,
  });
  assert.equal(ECONOMY_ROBBERIES.some((entry) => 'min' in entry || 'max' in entry), false);
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
