import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import {
  computeNextSalaryPayoutAt,
  enabledSalaryDepartments,
  getDepartmentSalaryConfig,
  hasSalaryReceipt,
  isSalaryPayoutDue,
  publicSalaryDepartments,
  publicSalarySchedule,
  rememberSalaryReceipt,
  salaryWeekKey,
  saveDepartmentSalaryConfig,
} from './departmentSalaryStore.js';
import {
  addInternetLog,
  readInternetStore,
  saveInternetStore,
  upsertInternetUser,
} from './internetStore.js';
import { sendSalaryPaidDm } from './salaryPaidDm.js';

function creditBalance(user) {
  return Math.trunc(Number(user?.credits) || 0);
}

function addSalaryTransaction(user, { amount, departmentName }) {
  user.creditTransactions = Array.isArray(user.creditTransactions) ? user.creditTransactions : [];
  user.creditTransactions.unshift({
    id: randomUUID(),
    amount: Math.trunc(Number(amount) || 0),
    type: 'salary',
    note: `Weekly salary · ${String(departmentName || 'Department').slice(0, 80)}`,
    actorName: 'Clearwater',
    createdAt: new Date().toISOString(),
    balanceAfter: creditBalance(user),
  });
  user.creditTransactions = user.creditTransactions.slice(0, 100);
}

async function memberHasEmployeeRole(client, department, discordId) {
  if (!department?.guildId || !department?.employeeRoleId || !/^\d{16,22}$/.test(String(discordId || ''))) {
    return { eligible: false, reason: 'missing-config' };
  }
  const guild = client.guilds.cache.get(department.guildId)
    || await client.guilds.fetch(department.guildId).catch(() => null);
  if (!guild) return { eligible: false, reason: 'guild-missing', botInGuild: false };
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { eligible: false, reason: 'not-in-guild', botInGuild: true };
  if (member.user?.bot) return { eligible: false, reason: 'bot', botInGuild: true };
  return {
    eligible: member.roles.cache.has(department.employeeRoleId),
    reason: member.roles.cache.has(department.employeeRoleId) ? 'eligible' : 'missing-role',
    botInGuild: true,
  };
}

export async function buildSalaryWalletView(client, actorId, config = null) {
  const salaryConfig = config || await getDepartmentSalaryConfig();
  const schedule = publicSalarySchedule(salaryConfig);
  const departments = enabledSalaryDepartments(salaryConfig);
  const rows = [];
  let weeklyTotal = 0;

  for (const department of departments) {
    const check = client
      ? await memberHasEmployeeRole(client, department, actorId)
      : { eligible: false, reason: 'offline', botInGuild: false };
    const eligible = check.eligible === true;
    if (eligible) weeklyTotal += department.weeklyAmount;
    rows.push({
      id: department.id,
      name: department.name,
      weeklyAmount: department.weeklyAmount,
      eligible,
      payMode: department.payMode,
      botInGuild: check.botInGuild !== false,
      status: check.reason,
    });
  }

  return {
    weeklyTotal,
    nextPayoutAt: schedule.nextPayoutAt,
    lastPayoutAt: schedule.lastPayoutAt,
    timezone: schedule.timezone,
    weekday: schedule.weekday,
    time: schedule.time,
    paidThisWeek: salaryConfig.lastPayoutWeekKey === salaryWeekKey(new Date(), salaryConfig),
    departments: rows,
  };
}

export async function buildOwnerSalaryStatus(client, config = null) {
  const salaryConfig = config || await getDepartmentSalaryConfig();
  const schedule = publicSalarySchedule(salaryConfig);
  const departments = await Promise.all((salaryConfig.departments || []).map(async (department) => {
    const guild = department.guildId
      ? (client.guilds.cache.get(department.guildId) || await client.guilds.fetch(department.guildId).catch(() => null))
      : null;
    return {
      ...department,
      botInGuild: Boolean(guild),
      guildName: guild?.name || null,
    };
  }));
  return {
    schedule,
    departments,
  };
}

async function payMemberSalary(client, store, { discordId, department, weekKey, config, walletUrl }) {
  if (hasSalaryReceipt(config, weekKey, department.id, discordId)) {
    return { paid: false, skipped: true, reason: 'already-paid' };
  }
  const storeUser = upsertInternetUser(store, { id: discordId });
  storeUser.credits = creditBalance(storeUser) + department.weeklyAmount;
  addSalaryTransaction(storeUser, {
    amount: department.weeklyAmount,
    departmentName: department.name,
  });
  rememberSalaryReceipt(config, weekKey, department.id, discordId);
  addInternetLog(
    store,
    `${department.name}: paid C$${department.weeklyAmount} weekly salary to ${storeUser.displayName || 'a member'}.`,
  );
  void sendSalaryPaidDm(client, discordId, {
    amount: department.weeklyAmount,
    departmentName: department.name,
    balance: creditBalance(storeUser),
    walletUrl,
  });
  return { paid: true, amount: department.weeklyAmount };
}

export async function runDepartmentSalaryPayout(client, { force = false } = {}) {
  const config = await getDepartmentSalaryConfig();
  const weekKey = salaryWeekKey(new Date(), config);
  const due = force || isSalaryPayoutDue(config, new Date());
  if (!due) {
    return {
      ok: true,
      ran: false,
      reason: force ? 'forced-no-op' : 'not-due',
      weekKey,
      nextPayoutAt: computeNextSalaryPayoutAt(config),
    };
  }

  if (!force && config.lastPayoutWeekKey === weekKey) {
    return {
      ok: true,
      ran: false,
      reason: 'already-paid-week',
      weekKey,
      nextPayoutAt: computeNextSalaryPayoutAt(config),
    };
  }

  const departments = enabledSalaryDepartments(config);
  if (!departments.length) {
    config.lastPayoutWeekKey = weekKey;
    config.lastPayoutAt = new Date().toISOString();
    await saveDepartmentSalaryConfig(config);
    return {
      ok: true,
      ran: true,
      weekKey,
      paidMembers: 0,
      paidDepartments: 0,
      totalCredits: 0,
      skippedGuilds: 0,
      errors: [],
      nextPayoutAt: computeNextSalaryPayoutAt(config),
    };
  }

  config.lastPayoutWeekKey = weekKey;
  config.lastPayoutAt = new Date().toISOString();
  await saveDepartmentSalaryConfig(config);

  const store = await readInternetStore();
  const walletUrl = `${String(client.config?.websiteUrl || 'https://cwrpvc.lol').replace(/\/$/, '')}/internet/wallet`;
  let paidMembers = 0;
  let paidDepartments = 0;
  let totalCredits = 0;
  let skippedGuilds = 0;
  const errors = [];

  for (const department of departments) {
    const guild = client.guilds.cache.get(department.guildId)
      || await client.guilds.fetch(department.guildId).catch(() => null);
    if (!guild) {
      skippedGuilds += 1;
      errors.push(`${department.name}: bot is not in that Discord server`);
      continue;
    }
    try {
      await guild.members.fetch();
    } catch (error) {
      skippedGuilds += 1;
      errors.push(`${department.name}: could not load members (${error.message || 'error'})`);
      continue;
    }

    let departmentPaid = 0;
    for (const member of guild.members.cache.values()) {
      if (member.user?.bot) continue;
      if (!member.roles.cache.has(department.employeeRoleId)) continue;
      try {
        const result = await payMemberSalary(client, store, {
          discordId: member.id,
          department,
          weekKey,
          config,
          walletUrl,
        });
        if (result.paid) {
          paidMembers += 1;
          departmentPaid += 1;
          totalCredits += result.amount;
        }
      } catch (error) {
        errors.push(`${department.name}: failed for ${member.id} (${error.message || 'error'})`);
      }
    }
    if (departmentPaid > 0) paidDepartments += 1;
  }

  await saveInternetStore(store);
  await saveDepartmentSalaryConfig(config);

  logger.info(
    `Department salary payout finished for ${weekKey}: ${paidMembers} payment(s), C$${totalCredits}, ${skippedGuilds} guild(s) skipped.`,
  );

  return {
    ok: true,
    ran: true,
    weekKey,
    paidMembers,
    paidDepartments,
    totalCredits,
    skippedGuilds,
    errors,
    nextPayoutAt: computeNextSalaryPayoutAt(config),
  };
}

export function startDepartmentSalaryJob(client) {
  let stopped = false;
  let timer;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runDepartmentSalaryPayout(client);
    } catch (error) {
      logger.error('Department salary payout failed', error);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(tick, 60_000);
    }
  };

  timer = setTimeout(tick, 15_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export {
  getDepartmentSalaryConfig,
  saveDepartmentSalaryConfig,
  publicSalaryDepartments,
  publicSalarySchedule,
};
