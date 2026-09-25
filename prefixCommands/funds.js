import { requireAdministrator, snowflakeFrom } from '../utils/prefixHelpers.js';
import {
  fetchRobloxGroupFunds,
  groupFundsCard,
  looksLikeRobloxCookie,
  resolveFundsGroupId,
} from '../utils/robloxGroupFunds.js';
import { v2Card, v2Sections } from '../utils/v2Message.js';
import {
  ECONOMY_PAY_INTERVAL_MS,
  departmentByGuildId,
  formatMoney,
} from '../utils/economyConfig.js';
import {
  canManageDepartmentFunds,
  departmentSpend,
  getDepartmentView,
  postEconomyLog,
} from '../utils/economyService.js';

function fundsCard(dept, view) {
  const row = view.row || {};
  const lines = (view.transactions || []).slice(0, 6).map((tx) => (
    `\`${tx.id}\` **${tx.type}** ${formatMoney(tx.amount)}${tx.note ? ` — ${tx.note}` : ''}`
  ));
  const fail = row.lastPayrollFail && Date.now() - Number(row.lastPayrollFail.at || 0) < 6 * 60 * 60 * 1000
    ? `\n**INSUFFICIENT DEPARTMENT FUNDS** — could not pay ${formatMoney(row.lastPayrollFail.needed)}`
    : '';
  return {
    title: dept.name.toUpperCase(),
    description: [
      `**Available Funds:** ${formatMoney(row.balance || 0)}`,
      `**Weekly Funding:** ${formatMoney(dept.weeklyGrant)}`,
      `**Employee Payroll:** ${formatMoney(dept.shiftPay)} / ${Math.round(ECONOMY_PAY_INTERVAL_MS / 60000)} minutes`,
      fail,
      '',
      '## Recent Transactions',
      lines.length ? lines.join('\n') : 'No transactions yet.',
    ].join('\n'),
  };
}

export default {
  name: 'funds',
  aliases: ['robux', 'groupfunds'],
  description: 'Department treasury in department Discords, or Roblox group funds in Clearwater (Administrator).',
  async execute(message, args, client) {
    const dept = departmentByGuildId(message.guildId);
    if (dept) {
      const sub = String(args[0] || '').toLowerCase();
      if (sub === 'spend' || sub === 'send') {
        if (!canManageDepartmentFunds(message.member, message.guildId)) {
          throw new Error('Only department administrators can spend department funds.');
        }
        const toId = snowflakeFrom(args[1]);
        const amount = Number(String(args[2] || '').replace(/[$,]/g, ''));
        const note = args.slice(3).join(' ').trim();
        if (!toId || !Number.isFinite(amount) || amount <= 0 || !note) {
          throw new Error('Usage: `-funds spend @user <amount> <reason>`');
        }
        const tx = await departmentSpend(dept.id, amount, {
          toId,
          note,
          authorizedBy: message.author.id,
        });
        await postEconomyLog(client || message.client, 'Department spending', `${dept.short} ${formatMoney(amount)} → <@${toId}> · ${note} · \`${tx.id}\``);
        await message.reply(v2Card({
          title: `${dept.short} funds sent`,
          description: [
            `**Amount:** ${formatMoney(-tx.amount)}`,
            `**Recipient:** <@${toId}>`,
            `**Reason:** ${note}`,
            `**Authorized By:** <@${message.author.id}>`,
            `**Transaction:** \`${tx.id}\``,
          ].join('\n'),
        }));
        return;
      }
      const view = await getDepartmentView(dept.id);
      const card = fundsCard(dept, view);
      await message.reply(v2Card(card));
      return;
    }

    requireAdministrator(message);
    if (looksLikeRobloxCookie(args.join(' ')) || looksLikeRobloxCookie(message.content)) {
      throw new Error('Do not paste your Roblox cookie in Discord. Put it in ROBLOX_COOKIE on the bot host .env and restart.');
    }

    const config = client?.config || message.client?.config || {};
    const info = await fetchRobloxGroupFunds({
      groupId: resolveFundsGroupId(config),
      cookie: config.robloxCookie,
    });
    const card = groupFundsCard(info);
    await message.reply(v2Sections(card.sections));
  },
};
