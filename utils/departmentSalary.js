import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import {
  computeNextSalaryPayoutAt,
  enabledSalaryDepartments,
  getDepartmentSalaryConfig,
  hasSalaryReceipt,
  highestPayRoleForMember,
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

function addSalaryTransaction(user, { amount, departmentName, roleLabel = '' }) {
  user.creditTransactions = Array.isArray(user.creditTransactions) ? user.creditTransactions : [];
  const roleNote = roleLabel ? ` · ${String(roleLabel).slice(0, 80)}` : '';
  user.creditTransactions.unshift({
    id: randomUUID(),
    amount: Math.trunc(Number(amount) || 0),
    type: 'salary',
    note: `Weekly salary · ${String(departmentName || 'Department').slice(0, 80)}${roleNote}`,
    actorName: 'Clearwater',
    createdAt: new Date().toISOString(),
    balanceAfter: creditBalance(user),
  });
  user.creditTransactions = user.creditTransactions.slice(0, 100);
}

async function memberPayMatch(client, department, discordId) {
  if (!department?.guildId || !/^\d{16,22}$/.test(String(discordId || ''))) {
    return { eligible: false, reason: 'missing-config', botInGuild: false, amount: 0, role: null };
  }
  const guild = client.guilds.cache.get(department.guildId)
    || await client.guilds.fetch(department.guildId).catch(() => null);
  if (!guild) return { eligible: false, reason: 'guild-missing', botInGuild: false, amount: 0, role: null };
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { eligible: false, reason: 'not-in-guild', botInGuild: true, amount: 0, role: null };
  if (member.user?.bot) return { eligible: false, reason: 'bot', botInGuild: true, amount: 0, role: null };
  const role = highestPayRoleForMember(department, [...member.roles.cache.keys()]);
  if (!role) return { eligible: false, reason: 'missing-role', botInGuild: true, amount: 0, role: null };
  return {
    eligible: true,
    reason: 'eligible',
    botInGuild: true,
    amount: role.amount,
    role,
  };
}

export async function buildSalaryWalletView(client, actorId, config = null) {
  const salaryConfig = config || await getDepartmentSalaryConfig();
  const schedule = publicSalarySchedule(salaryConfig);
  const configured = (salaryConfig.departments || []).length > 0;
  const departments = (salaryConfig.departments || []).filter((department) => department.guildId || department.name);
  const rows = [];
  let weeklyTotal = 0;

  for (const department of departments) {
    const payable = department.enabled && (department.roles || []).some((role) => role.roleId && role.amount > 0);
    const check = client && payable
      ? await memberPayMatch(client, department, actorId)
      : { eligible: false, reason: payable ? 'offline' : 'disabled', botInGuild: true, amount: 0, role: null };
    const eligible = check.eligible === true;
    const weeklyAmount = eligible
      ? check.amount
      : Math.max(0, ...((department.roles || []).map((role) => role.amount || 0)));
    if (eligible) weeklyTotal += check.amount;
    rows.push({
      id: department.id,
      name: department.name,
      weeklyAmount,
      roleLabel: check.role?.label || '',
      eligible,
      payMode: department.payMode,
      botInGuild: check.botInGuild !== false,
      status: check.reason,
    });
  }

  return {
    configured,
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

async function payMemberSalary(client, store, { discordId, department, weekKey, config, amount, roleLabel = '' }) {
  if (hasSalaryReceipt(config, weekKey, department.id, discordId)) {
    return { paid: false, skipped: true, reason: 'already-paid' };
  }
  const payAmount = Math.trunc(Number(amount) || 0);
  if (payAmount <= 0) return { paid: false, skipped: true, reason: 'zero-amount' };
  const storeUser = upsertInternetUser(store, { id: discordId });
  storeUser.credits = creditBalance(storeUser) + payAmount;
  addSalaryTransaction(storeUser, {
    amount: payAmount,
    departmentName: department.name,
    roleLabel,
  });
  rememberSalaryReceipt(config, weekKey, department.id, discordId);
  addInternetLog(
    store,
    `${department.name}: paid C$${payAmount} weekly salary to ${storeUser.displayName || 'a member'}.`,
  );
  void sendSalaryPaidDm(client, discordId, {
    amount: payAmount,
    departmentName: department.name,
    balance: creditBalance(storeUser),
  });
  return { paid: true, amount: payAmount };
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
      const match = highestPayRoleForMember(department, [...member.roles.cache.keys()]);
      if (!match) continue;
      try {
        const result = await payMemberSalary(client, store, {
          discordId: member.id,
          department,
          weekKey,
          config,
          amount: match.amount,
          roleLabel: match.label,
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
