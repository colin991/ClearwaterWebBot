import { randomBytes, randomInt } from 'node:crypto';
import {
  ECONOMY_DEATH_FEE,
  ECONOMY_DEPARTMENTS,
  ECONOMY_JOB_PAY,
  ECONOMY_PAY_INTERVAL_MS,
  ECONOMY_ROBBERIES,
  ECONOMY_ROBBERY_RESERVE_MS,
  ECONOMY_SCENE_RADIUS,
  ECONOMY_STARTER_GRANT,
  ECONOMY_STEAL_COOLDOWN_MS,
  ECONOMY_STEAL_DISTANCE,
  ECONOMY_STEAL_SUCCESS_CHANCE,
  ECONOMY_TRANSFER_COOLDOWN_MS,
  ECONOMY_TX,
  ECONOMY_TX_KEEP,
  isPaidCivilianJob,
  departmentById,
  economyWeekKey,
  robberyById,
  transferTaxAmount,
} from './economyConfig.js';

export function emptyEconomyStore() {
  const departments = {};
  for (const dept of ECONOMY_DEPARTMENTS) {
    departments[dept.id] = {
      id: dept.id,
      balance: 0,
      weeklyGrantWeekKey: '',
      spentThisWeek: 0,
      payrollThisWeek: 0,
      spendWeekKey: '',
    };
  }
  return {
    version: 2,
    users: {},
    transactions: {},
    transactionOrder: [],
    departments,
    robbery: { status: 'idle' },
    robberyCooldowns: {},
    jobs: {},
    payroll: {},
    steals: {},
    deaths: {},
    audit: [],
    starterSweepAt: null,
    server: { balance: 0 },
  };
}

export function ensureServerTreasury(store) {
  if (!store.server || typeof store.server !== 'object') store.server = { balance: 0 };
  store.server.balance = money(store.server.balance);
  return store.server;
}

export function newTxId() {
  return `e${randomBytes(5).toString('hex')}`;
}

function nowIso(now) {
  return new Date(now).toISOString();
}

export function money(value) {
  const amount = Math.trunc(Number(value) || 0);
  return Number.isSafeInteger(amount) ? amount : 0;
}

export function ensureEconomyUser(store, discordId, extras = {}) {
  const id = String(discordId || '').trim();
  if (!id) throw new Error('A Discord user is required.');
  if (!store.users[id]) {
    store.users[id] = {
      discordId: id,
      robloxId: String(extras.robloxId || ''),
      cash: 0,
      bank: 0,
      totalEarned: 0,
      totalSpent: 0,
      starterGrantClaimed: false,
      frozen: false,
      createdAt: nowIso(extras.now || Date.now()),
      updatedAt: nowIso(extras.now || Date.now()),
    };
  }
  const user = store.users[id];
  if (extras.robloxId) user.robloxId = String(extras.robloxId);
  return user;
}

export function findUserByRobloxId(store, robloxId) {
  const id = String(robloxId || '').trim();
  if (!id) return null;
  return Object.values(store.users).find((user) => String(user.robloxId || '') === id) || null;
}

function pushTx(store, tx, now) {
  const id = tx.id || newTxId();
  const record = {
    id,
    type: tx.type,
    amount: money(tx.amount),
    fromId: String(tx.fromId || ''),
    toId: String(tx.toId || ''),
    fromDept: String(tx.fromDept || ''),
    toDept: String(tx.toDept || ''),
    note: String(tx.note || '').slice(0, 200),
    referenceId: String(tx.referenceId || id),
    authorizedBy: String(tx.authorizedBy || ''),
    cashAfter: tx.cashAfter ?? null,
    bankAfter: tx.bankAfter ?? null,
    deptAfter: tx.deptAfter ?? null,
    serverAfter: tx.serverAfter ?? null,
    toServer: Boolean(tx.toServer),
    createdAt: nowIso(now),
  };
  store.transactions[id] = record;
  store.transactionOrder.unshift(id);
  if (store.transactionOrder.length > ECONOMY_TX_KEEP) {
    const drop = store.transactionOrder.splice(ECONOMY_TX_KEEP);
    for (const old of drop) delete store.transactions[old];
  }
  return record;
}

function touch(user, now) {
  user.updatedAt = nowIso(now);
}

function requireUnfrozen(user) {
  if (user.frozen) throw new Error('That economy account is frozen.');
}

export function grantStarter(store, discordId, { now = Date.now(), robloxId = '' } = {}) {
  const user = ensureEconomyUser(store, discordId, { robloxId, now });
  if (user.starterGrantClaimed) return { granted: false, user };
  user.starterGrantClaimed = true;
  user.cash += ECONOMY_STARTER_GRANT;
  user.totalEarned += ECONOMY_STARTER_GRANT;
  touch(user, now);
  const tx = pushTx(store, {
    type: ECONOMY_TX.STARTER_GRANT,
    amount: ECONOMY_STARTER_GRANT,
    toId: user.discordId,
    note: 'Clearwater Economy launch grant',
    cashAfter: user.cash,
    bankAfter: user.bank,
  }, now);
  return { granted: true, user, tx };
}

export function depositCash(store, discordId, amount, { now = Date.now() } = {}) {
  const user = ensureEconomyUser(store, discordId, { now });
  requireUnfrozen(user);
  const value = money(amount);
  if (value <= 0) throw new Error('Enter an amount greater than $0.');
  if (user.cash < value) throw new Error('You do not have that much cash.');
  user.cash -= value;
  user.bank += value;
  touch(user, now);
  return {
    user,
    tx: pushTx(store, {
      type: ECONOMY_TX.BANK_DEPOSIT,
      amount: value,
      fromId: user.discordId,
      toId: user.discordId,
      note: 'Deposit to bank',
      cashAfter: user.cash,
      bankAfter: user.bank,
    }, now),
  };
}

export function withdrawBank(store, discordId, amount, { now = Date.now() } = {}) {
  const user = ensureEconomyUser(store, discordId, { now });
  requireUnfrozen(user);
  const value = money(amount);
  if (value <= 0) throw new Error('Enter an amount greater than $0.');
  if (user.bank < value) throw new Error('You do not have that much in the bank.');
  user.bank -= value;
  user.cash += value;
  touch(user, now);
  return {
    user,
    tx: pushTx(store, {
      type: ECONOMY_TX.BANK_WITHDRAWAL,
      amount: value,
      fromId: user.discordId,
      toId: user.discordId,
      note: 'Withdrawal to cash',
      cashAfter: user.cash,
      bankAfter: user.bank,
    }, now),
  };
}

export function transferCash(store, fromId, toId, amount, {
  now = Date.now(),
  note = '',
  fingerprint = '',
} = {}) {
  if (String(fromId) === String(toId)) throw new Error('You cannot send money to yourself.');
  const value = money(amount);
  if (value <= 0) throw new Error('Enter an amount greater than $0.');
  const sender = ensureEconomyUser(store, fromId, { now });
  const recipient = ensureEconomyUser(store, toId, { now });
  requireUnfrozen(sender);
  requireUnfrozen(recipient);
  if (sender.cash < value) throw new Error('You do not have that much cash.');
  const last = sender.lastTransferAt || 0;
  if (now - last < ECONOMY_TRANSFER_COOLDOWN_MS) throw new Error('Wait a few seconds before sending again.');
  if (fingerprint && sender.lastTransferFingerprint === fingerprint && now - last < 30_000) {
    throw new Error('That transfer was already submitted.');
  }
  sender.cash -= value;
  sender.totalSpent += value;
  sender.lastTransferAt = now;
  sender.lastTransferFingerprint = fingerprint || '';
  const tax = transferTaxAmount(value);
  const received = value - tax;
  recipient.cash += received;
  recipient.totalEarned += received;
  const server = ensureServerTreasury(store);
  if (tax > 0) server.balance += tax;
  touch(sender, now);
  touch(recipient, now);
  const referenceId = newTxId();
  const out = pushTx(store, {
    type: ECONOMY_TX.TRANSFER,
    amount: -value,
    fromId: sender.discordId,
    toId: recipient.discordId,
    note,
    referenceId,
    cashAfter: sender.cash,
    bankAfter: sender.bank,
  }, now);
  const incoming = pushTx(store, {
    type: ECONOMY_TX.TRANSFER,
    amount: received,
    fromId: sender.discordId,
    toId: recipient.discordId,
    note,
    referenceId,
    cashAfter: recipient.cash,
    bankAfter: recipient.bank,
  }, now);
  const taxTx = tax > 0
    ? pushTx(store, {
      type: ECONOMY_TX.TRANSFER_TAX,
      amount: tax,
      fromId: sender.discordId,
      toId: recipient.discordId,
      note: `${tax} send tax (5%)`,
      referenceId,
      serverAfter: server.balance,
    }, now)
    : null;
  return { sender, recipient, outgoing: out, incoming, tax: taxTx, taxAmount: tax, received, referenceId };
}

export function applyDeathFee(store, discordId, fingerprint, { now = Date.now(), robloxId = '' } = {}) {
  const key = String(fingerprint || '').trim();
  if (key && store.deaths[key]) return { charged: false };
  if (key) store.deaths[key] = now;
  const user = ensureEconomyUser(store, discordId, { robloxId, now });
  user.cash -= ECONOMY_DEATH_FEE;
  user.totalSpent += ECONOMY_DEATH_FEE;
  touch(user, now);
  return {
    charged: true,
    user,
    tx: pushTx(store, {
      type: ECONOMY_TX.DEATH_FEE,
      amount: -ECONOMY_DEATH_FEE,
      fromId: user.discordId,
      note: 'Death fee',
      cashAfter: user.cash,
      bankAfter: user.bank,
    }, now),
  };
}

export function trySteal(store, thiefId, victimId, {
  now = Date.now(),
  distance = 0,
  thiefTeam = '',
  victimTeam = '',
  roll = null,
} = {}) {
  const thief = ensureEconomyUser(store, thiefId, { now });
  const victim = ensureEconomyUser(store, victimId, { now });
  requireUnfrozen(thief);
  requireUnfrozen(victim);
  if (!/civilian/i.test(thiefTeam) || !/civilian/i.test(victimTeam)) {
    throw new Error('Both players must be on Civilian.');
  }
  if (distance > ECONOMY_STEAL_DISTANCE) throw new Error('No civilian is close enough to steal from.');
  const last = store.steals[thief.discordId] || 0;
  if (now - last < ECONOMY_STEAL_COOLDOWN_MS) throw new Error('Wait before using ;steal again.');
  store.steals[thief.discordId] = now;
  if (victim.cash <= 0) {
    return { success: false, reason: 'empty', thief, victim };
  }
  const chance = roll == null ? randomInt(1, 101) : Number(roll);
  if (chance > ECONOMY_STEAL_SUCCESS_CHANCE) {
    return { success: false, reason: 'failed', thief, victim, chance };
  }
  const amount = Math.max(1, Math.min(victim.cash, Math.ceil(victim.cash * (25 + randomInt(0, 26)) / 100)));
  victim.cash -= amount;
  victim.totalSpent += amount;
  thief.cash += amount;
  thief.totalEarned += amount;
  touch(thief, now);
  touch(victim, now);
  const referenceId = newTxId();
  pushTx(store, {
    type: ECONOMY_TX.STEAL,
    amount: -amount,
    fromId: victim.discordId,
    toId: thief.discordId,
    note: 'Stolen cash',
    referenceId,
    cashAfter: victim.cash,
    bankAfter: victim.bank,
  }, now);
  const loot = pushTx(store, {
    type: ECONOMY_TX.STEAL,
    amount,
    fromId: victim.discordId,
    toId: thief.discordId,
    note: 'Stolen cash',
    referenceId,
    cashAfter: thief.cash,
    bankAfter: thief.bank,
  }, now);
  return { success: true, amount, thief, victim, tx: loot, referenceId };
}

export function payJobInterval(store, discordId, { now = Date.now(), team = '', job = '', robloxId = '' } = {}) {
  const user = ensureEconomyUser(store, discordId, { robloxId, now });
  if (user.frozen) return { paid: false, reason: 'frozen' };
  if (!isPaidCivilianJob(team, job)) {
    delete store.jobs[discordId];
    return { paid: false, reason: 'left-job' };
  }
  const jobKey = String(job || team);
  let session = store.jobs[discordId];
  if (!session || session.team !== jobKey) {
    store.jobs[discordId] = {
      team: jobKey,
      startedAt: now,
      paidIntervals: 0,
      sessionEarned: 0,
    };
    return { paid: false, reason: 'started', session: store.jobs[discordId] };
  }
  const elapsed = now - session.startedAt;
  const due = Math.floor(elapsed / ECONOMY_PAY_INTERVAL_MS);
  if (due <= session.paidIntervals) return { paid: false, reason: 'waiting', session };
  const intervals = due - session.paidIntervals;
  const amount = intervals * ECONOMY_JOB_PAY;
  session.paidIntervals = due;
  session.sessionEarned += amount;
  user.cash += amount;
  user.totalEarned += amount;
  touch(user, now);
  return {
    paid: true,
    amount,
    intervals,
    user,
    session,
    tx: pushTx(store, {
      type: ECONOMY_TX.JOB_PAYCHECK,
      amount,
      toId: user.discordId,
      note: `Job paycheck × ${intervals}`,
      cashAfter: user.cash,
      bankAfter: user.bank,
    }, now),
  };
}

export function robberyStatus(store, { now = Date.now(), leoCount = 0, priorityBlocked = false } = {}) {
  const session = store.robbery || { status: 'idle' };
  if (session.status === 'reserved' && now >= Number(session.reservedUntil || 0)) {
    store.robbery = { status: 'idle' };
  }
  if (session.status === 'active' && session.endsAt && now >= session.endsAt && !session.paid) {
    // tick handles payout/fail
  }
  const live = store.robbery || { status: 'idle' };
  const reasons = {};
  for (const robbery of ECONOMY_ROBBERIES) {
    const cooldownUntil = Number(store.robberyCooldowns[robbery.id] || 0);
    let reason = '';
    if (priorityBlocked) reason = 'ACTIVE PRIORITY';
    else if (live.status === 'reserved') reason = 'ROBBERY PENDING';
    else if (live.status === 'active') reason = 'ROBBERY ACTIVE';
    else if (cooldownUntil > now) reason = 'COOLDOWN';
    else if (leoCount < (robbery.minLeo || ECONOMY_MIN_LEO)) reason = 'NOT ENOUGH LEO';
    reasons[robbery.id] = reason;
  }
  return { session: live, reasons };
}

export function reserveRobbery(store, robberyId, discordId, { now = Date.now(), leoCount = 0, priorityBlocked = false } = {}) {
  const robbery = robberyById(robberyId);
  if (!robbery) throw new Error('Unknown robbery.');
  const status = robberyStatus(store, { now, leoCount, priorityBlocked });
  const blocked = status.reasons[robbery.id];
  if (blocked) throw new Error(blocked);
  store.robbery = {
    status: 'reserved',
    kind: robbery.id,
    reservedBy: String(discordId),
    reservedUntil: now + ECONOMY_ROBBERY_RESERVE_MS,
    startedAt: 0,
    paid: false,
  };
  return store.robbery;
}

export function beginRobbery(store, discordId, origin, { now = Date.now() } = {}) {
  const session = store.robbery;
  if (session?.status !== 'reserved') throw new Error('No robbery is reserved.');
  if (String(session.reservedBy) !== String(discordId)) throw new Error('Someone else reserved this robbery.');
  if (now >= Number(session.reservedUntil || 0)) {
    store.robbery = { status: 'idle' };
    throw new Error('The robbery reservation expired.');
  }
  const robbery = robberyById(session.kind);
  session.status = 'active';
  session.startedAt = now;
  session.sceneUntil = now + (robbery.sceneMs || 0);
  session.endsAt = now + (robbery.survivalMs || 0);
  session.origin = origin || null;
  session.sceneComplete = !robbery.sceneMs;
  session.paid = false;
  return session;
}

export function failRobbery(store, reason, { now = Date.now() } = {}) {
  const session = store.robbery;
  if (!session || (session.status !== 'active' && session.status !== 'reserved')) return session;
  const kind = session.kind;
  store.robbery = { status: 'idle', lastFail: { kind, reason, at: now } };
  const robbery = robberyById(kind);
  if (robbery) store.robberyCooldowns[kind] = now + robbery.cooldownMs;
  return store.robbery;
}

export function completeRobberyIfReady(store, discordId, { now = Date.now(), payout = null } = {}) {
  const session = store.robbery;
  if (session?.status !== 'active' || session.paid) return { paid: false };
  if (String(session.reservedBy) !== String(discordId)) return { paid: false };
  if (!session.sceneComplete) return { paid: false, reason: 'scene' };
  if (now < Number(session.endsAt || 0)) return { paid: false, reason: 'survival' };
  const robbery = robberyById(session.kind);
  const amount = payout == null ? randomInt(robbery.min, robbery.max + 1) : money(payout);
  const user = ensureEconomyUser(store, discordId, { now });
  user.cash += amount;
  user.totalEarned += amount;
  touch(user, now);
  session.paid = true;
  session.status = 'idle';
  store.robberyCooldowns[robbery.id] = now + robbery.cooldownMs;
  store.robbery = { status: 'idle', lastSuccess: { kind: robbery.id, amount, at: now } };
  return {
    paid: true,
    amount,
    user,
    tx: pushTx(store, {
      type: ECONOMY_TX.ROBBERY_PAYOUT,
      amount,
      toId: user.discordId,
      note: robbery.name,
      cashAfter: user.cash,
      bankAfter: user.bank,
    }, now),
  };
}

export function updateRobberyScene(store, position, { now = Date.now() } = {}) {
  const session = store.robbery;
  if (session?.status !== 'active' || session.sceneComplete) return session;
  const origin = session.origin;
  if (origin && position) {
    const dist = Math.hypot(Number(position.x) - Number(origin.x), Number(position.z) - Number(origin.z));
    if (Number.isFinite(dist) && dist > ECONOMY_SCENE_RADIUS) {
      failRobbery(store, 'left-scene', { now });
      return store.robbery;
    }
  }
  if (now >= Number(session.sceneUntil || 0)) session.sceneComplete = true;
  return session;
}

export function economyBlocksPriority(store, now = Date.now()) {
  const session = store?.robbery;
  if (!session) return false;
  if (session.status === 'reserved' && now < Number(session.reservedUntil || 0)) return true;
  return session.status === 'active';
}

export function grantWeeklyDepartmentFunds(store, { now = Date.now() } = {}) {
  const week = economyWeekKey(new Date(now));
  const granted = [];
  for (const dept of ECONOMY_DEPARTMENTS) {
    const row = store.departments[dept.id];
    if (row.weeklyGrantWeekKey === week) continue;
    row.weeklyGrantWeekKey = week;
    row.balance += dept.weeklyGrant;
    if (row.spendWeekKey !== week) {
      row.spendWeekKey = week;
      row.spentThisWeek = 0;
      row.payrollThisWeek = 0;
    }
    granted.push(pushTx(store, {
      type: ECONOMY_TX.DEPARTMENT_WEEKLY_GRANT,
      amount: dept.weeklyGrant,
      toDept: dept.id,
      note: `${dept.short} weekly funding`,
      deptAfter: row.balance,
    }, now));
  }
  return granted;
}

export function payDepartmentShift(store, deptId, discordId, {
  now = Date.now(),
  shiftKey = '',
  elapsedMs = 0,
} = {}) {
  const dept = departmentById(deptId);
  if (!dept) throw new Error('Unknown department.');
  const row = store.departments[dept.id];
  const week = economyWeekKey(new Date(now));
  if (row.spendWeekKey !== week) {
    row.spendWeekKey = week;
    row.spentThisWeek = 0;
    row.payrollThisWeek = 0;
  }
  const personKey = `${dept.id}:${discordId}`;
  const legacyKey = shiftKey ? `${personKey}:${shiftKey}` : '';
  let track = store.payroll[personKey] || (legacyKey ? store.payroll[legacyKey] : null);
  if (legacyKey && store.payroll[legacyKey] && store.payroll[personKey] !== track) {
    store.payroll[personKey] = track;
    delete store.payroll[legacyKey];
  }
  const due = Math.floor(Math.max(0, elapsedMs) / ECONOMY_PAY_INTERVAL_MS);
  if (!track) {
    store.payroll[personKey] = {
      paidIntervals: due,
      startedAt: now,
      shiftKey: String(shiftKey || ''),
      lastElapsed: elapsedMs,
    };
    return { paid: false, reason: 'armed' };
  }
  if (
    shiftKey
    && track.shiftKey
    && String(track.shiftKey) !== String(shiftKey)
    && elapsedMs + ECONOMY_PAY_INTERVAL_MS < Number(track.lastElapsed || 0)
  ) {
    track.shiftKey = String(shiftKey);
    track.paidIntervals = due;
    track.lastElapsed = elapsedMs;
    track.startedAt = now;
    return { paid: false, reason: 'new-shift' };
  }
  track.shiftKey = String(shiftKey || track.shiftKey || '');
  track.lastElapsed = elapsedMs;
  if (due <= track.paidIntervals) return { paid: false, reason: 'waiting' };
  const intervals = 1;
  const amount = intervals * dept.shiftPay;
  if (row.balance < amount) {
    row.lastPayrollFail = {
      at: now,
      needed: amount,
      discordId,
      balance: row.balance,
    };
    return { paid: false, reason: 'insufficient', needed: amount, balance: row.balance, dept };
  }
  track.paidIntervals += intervals;
  row.balance -= amount;
  row.payrollThisWeek += amount;
  row.spentThisWeek += amount;
  const user = ensureEconomyUser(store, discordId, { now });
  user.cash += amount;
  user.totalEarned += amount;
  touch(user, now);
  const referenceId = newTxId();
  const employeeTx = pushTx(store, {
    type: ECONOMY_TX.DEPARTMENT_SHIFT_PAY,
    amount,
    toId: user.discordId,
    fromDept: dept.id,
    note: `${dept.short} shift pay`,
    referenceId,
    cashAfter: user.cash,
    bankAfter: user.bank,
  }, now);
  const deptTx = pushTx(store, {
    type: ECONOMY_TX.DEPARTMENT_PAYROLL,
    amount: -amount,
    toId: user.discordId,
    fromDept: dept.id,
    note: `${dept.short} payroll`,
    referenceId,
    deptAfter: row.balance,
  }, now);
  return {
    paid: true, amount, intervals, user, dept, row, employeeTx, deptTx, referenceId,
  };
}

export function spendDepartmentFunds(store, deptId, amount, {
  now = Date.now(),
  toId = '',
  toDept = '',
  toServer = false,
  note = '',
  authorizedBy = '',
  type = ECONOMY_TX.DEPARTMENT_TRANSFER,
} = {}) {
  const dept = departmentById(deptId);
  if (!dept) throw new Error('Unknown department.');
  const reason = String(note || '').trim();
  if (!reason) throw new Error('Add a note for this send.');
  const value = money(amount);
  if (value <= 0) throw new Error('Enter an amount greater than $0.');
  const recipientId = String(toId || '').trim();
  const otherDept = String(toDept || '').trim();
  if (!recipientId && !otherDept && !toServer) {
    throw new Error('Send department funds to a person or the server.');
  }
  if (otherDept && otherDept !== dept.id && !store.departments[otherDept]) {
    throw new Error('Unknown department.');
  }
  const row = store.departments[dept.id];
  if (row.balance < value) throw new Error('The department does not have enough funds.');
  const week = economyWeekKey(new Date(now));
  if (row.spendWeekKey !== week) {
    row.spendWeekKey = week;
    row.spentThisWeek = 0;
    row.payrollThisWeek = 0;
  }
  row.balance -= value;
  row.spentThisWeek += value;
  let user = null;
  if (recipientId) {
    user = ensureEconomyUser(store, recipientId, { now });
    requireUnfrozen(user);
    user.cash += value;
    user.totalEarned += value;
    touch(user, now);
  }
  if (otherDept && otherDept !== dept.id) {
    store.departments[otherDept].balance += value;
  }
  const server = ensureServerTreasury(store);
  if (toServer) server.balance += value;
  const referenceId = newTxId();
  const tx = pushTx(store, {
    type,
    amount: -value,
    fromDept: dept.id,
    toId: recipientId,
    toDept: otherDept,
    toServer: Boolean(toServer),
    note: reason,
    authorizedBy,
    referenceId,
    deptAfter: row.balance,
    serverAfter: toServer ? server.balance : null,
  }, now);
  const creditTx = recipientId
    ? pushTx(store, {
      type,
      amount: value,
      fromDept: dept.id,
      toId: recipientId,
      note: reason,
      authorizedBy,
      referenceId,
      cashAfter: user.cash,
      bankAfter: user.bank,
    }, now)
    : null;
  return { tx, creditTx, value, toServer: Boolean(toServer), toId: recipientId, user };
}

export function adminAdjustUser(store, discordId, { cashDelta = 0, bankDelta = 0, setCash, setBank, reason, adminId, now = Date.now() } = {}) {
  const user = ensureEconomyUser(store, discordId, { now });
  const before = { cash: user.cash, bank: user.bank };
  if (setCash != null) user.cash = money(setCash);
  if (setBank != null) user.bank = money(setBank);
  user.cash += money(cashDelta);
  user.bank += money(bankDelta);
  const delta = (user.cash + user.bank) - (before.cash + before.bank);
  if (delta > 0) user.totalEarned += delta;
  if (delta < 0) user.totalSpent += -delta;
  touch(user, now);
  const tx = pushTx(store, {
    type: ECONOMY_TX.ADMIN_ADJUSTMENT,
    amount: delta,
    toId: user.discordId,
    note: reason || 'Admin adjustment',
    authorizedBy: adminId,
    cashAfter: user.cash,
    bankAfter: user.bank,
  }, now);
  store.audit.unshift({
    id: tx.id,
    adminId,
    action: 'adjust-user',
    targetId: user.discordId,
    oldValue: before,
    newValue: { cash: user.cash, bank: user.bank },
    amount: delta,
    reason: reason || '',
    createdAt: nowIso(now),
    transactionId: tx.id,
  });
  store.audit = store.audit.slice(0, 2_000);
  return { user, tx, before };
}

export function adminAdjustDepartment(store, deptId, amount, { adminId = '', reason = '', now = Date.now() } = {}) {
  const dept = departmentById(deptId);
  if (!dept) throw new Error('Unknown department.');
  const value = money(amount);
  if (!value) throw new Error('Enter a non-zero amount.');
  const row = store.departments[dept.id];
  const before = row.balance;
  if (value < 0 && row.balance < -value) throw new Error('The department does not have enough funds.');
  row.balance += value;
  const tx = pushTx(store, {
    type: ECONOMY_TX.ADMIN_ADJUSTMENT,
    amount: value,
    fromDept: value < 0 ? dept.id : '',
    toDept: value > 0 ? dept.id : '',
    note: reason || 'Admin department adjustment',
    authorizedBy: adminId,
    deptAfter: row.balance,
  }, now);
  store.audit.unshift({
    id: tx.id,
    adminId,
    action: 'adjust-department',
    targetId: dept.id,
    oldValue: before,
    newValue: row.balance,
    amount: value,
    reason: reason || '',
    createdAt: nowIso(now),
    transactionId: tx.id,
  });
  return { row, tx, before };
}

export function setFrozen(store, discordId, frozen, { adminId, reason, now = Date.now() } = {}) {
  const user = ensureEconomyUser(store, discordId, { now });
  user.frozen = Boolean(frozen);
  touch(user, now);
  store.audit.unshift({
    id: newTxId(),
    adminId,
    action: frozen ? 'freeze' : 'unfreeze',
    targetId: user.discordId,
    reason: reason || '',
    createdAt: nowIso(now),
  });
  return user;
}

export function recentTransactions(store, { userId = '', deptId = '', server = false, limit = 12 } = {}) {
  const ids = store.transactionOrder || [];
  const out = [];
  for (const id of ids) {
    const tx = store.transactions[id];
    if (!tx) continue;
    if (userId && tx.fromId !== userId && tx.toId !== userId) continue;
    if (userId && tx.type === ECONOMY_TX.DEPARTMENT_PAYROLL) continue;
    if (userId && tx.type === ECONOMY_TX.TRANSFER_TAX) continue;
    if (userId && tx.fromDept && tx.amount < 0) continue;
    if (server && tx.type !== ECONOMY_TX.TRANSFER_TAX && !tx.toServer) continue;
    if (deptId && tx.fromDept !== deptId && tx.toDept !== deptId) continue;
    if (deptId && tx.type === ECONOMY_TX.DEPARTMENT_SHIFT_PAY) continue;
    out.push(tx);
    if (out.length >= limit) break;
  }
  return out;
}

export function totalBalance(user) {
  return money(user?.cash) + money(user?.bank);
}

export function findTransaction(store, id) {
  const key = String(id || '').trim();
  if (!key) return null;
  if (store.transactions[key]) return store.transactions[key];
  return Object.values(store.transactions).find((tx) => tx.id === key || tx.referenceId === key) || null;
}

export function refundTransaction(store, txId, { adminId = '', reason = '', now = Date.now() } = {}) {
  const tx = findTransaction(store, txId);
  if (!tx) throw new Error('Unknown transaction.');
  const group = Object.values(store.transactions).filter((entry) => entry.referenceId === tx.referenceId);
  if (group.some((entry) => entry.refunded)) throw new Error('That transaction was already refunded.');
  const outgoing = group.find((entry) => entry.type === ECONOMY_TX.TRANSFER && entry.amount < 0);
  const incoming = group.find((entry) => entry.type === ECONOMY_TX.TRANSFER && entry.amount > 0);
  const taxTx = group.find((entry) => entry.type === ECONOMY_TX.TRANSFER_TAX);
  if (outgoing && incoming) {
    const sent = Math.abs(money(outgoing.amount));
    const received = money(incoming.amount);
    const tax = taxTx ? money(taxTx.amount) : Math.max(0, sent - received);
    const recipient = ensureEconomyUser(store, incoming.toId, { now });
    requireUnfrozen(recipient);
    if (recipient.cash >= received) recipient.cash -= received;
    else {
      const rest = received - recipient.cash;
      recipient.cash = 0;
      recipient.bank -= rest;
    }
    recipient.totalSpent += received;
    const sender = ensureEconomyUser(store, outgoing.fromId, { now });
    sender.cash += sent;
    sender.totalEarned += sent;
    const server = ensureServerTreasury(store);
    if (tax > 0) server.balance -= tax;
    touch(sender, now);
    touch(recipient, now);
    for (const entry of group) entry.refunded = true;
    const refund = pushTx(store, {
      type: ECONOMY_TX.REFUND,
      amount: sent,
      fromId: incoming.toId,
      toId: outgoing.fromId,
      note: reason || `Refund of ${tx.id}`,
      authorizedBy: adminId,
      referenceId: tx.referenceId,
      serverAfter: server.balance,
    }, now);
    store.audit.unshift({
      id: refund.id,
      adminId,
      action: 'refund',
      targetId: outgoing.fromId,
      amount: sent,
      reason: reason || '',
      createdAt: nowIso(now),
      transactionId: refund.id,
    });
    return { tx: refund, original: tx };
  }
  const positive = group.find((entry) => entry.amount > 0) || tx;
  const amount = Math.abs(money(positive.amount));
  if (amount <= 0) throw new Error('That transaction has no amount to refund.');
  if (positive.toId) {
    const recipient = ensureEconomyUser(store, positive.toId, { now });
    requireUnfrozen(recipient);
    if (recipient.cash >= amount) recipient.cash -= amount;
    else {
      const rest = amount - recipient.cash;
      recipient.cash = 0;
      recipient.bank -= rest;
    }
    recipient.totalSpent += amount;
    touch(recipient, now);
  }
  if (positive.fromId && positive.fromId !== positive.toId) {
    const sender = ensureEconomyUser(store, positive.fromId, { now });
    sender.cash += amount;
    sender.totalEarned += amount;
    touch(sender, now);
  }
  if (positive.fromDept) {
    const row = store.departments[positive.fromDept];
    if (row) row.balance += amount;
  }
  if (positive.toDept && positive.toDept !== positive.fromDept) {
    const row = store.departments[positive.toDept];
    if (row) row.balance -= amount;
  }
  for (const entry of group) entry.refunded = true;
  const refund = pushTx(store, {
    type: ECONOMY_TX.REFUND,
    amount,
    fromId: positive.toId,
    toId: positive.fromId,
    fromDept: positive.toDept,
    toDept: positive.fromDept,
    note: reason || `Refund of ${tx.id}`,
    authorizedBy: adminId,
    referenceId: tx.referenceId,
  }, now);
  store.audit.unshift({
    id: refund.id,
    adminId,
    action: 'refund',
    targetId: positive.toId || positive.fromId,
    amount,
    reason: reason || '',
    createdAt: nowIso(now),
    transactionId: refund.id,
  });
  return { tx: refund, original: tx };
}
