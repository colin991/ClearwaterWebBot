import { requireAdministrator, snowflakeFrom } from '../utils/prefixHelpers.js';
import { v2Card } from '../utils/v2Message.js';
import { departmentById, formatMoney, parseMoney } from '../utils/economyConfig.js';
import {
  adminDepartmentAdjust,
  adminEconomyAdjust,
  adminFreeze,
  adminRefund,
  cancelRobbery,
  getWalletView,
  listUserTransactions,
  lookupTransaction,
  postEconomyLog,
} from '../utils/economyService.js';

function usage() {
  return [
    '`-ecoadmin view @user`',
    '`-ecoadmin give @user <amount> <reason>`',
    '`-ecoadmin take @user <amount> <reason>`',
    '`-ecoadmin set @user cash|bank <amount> <reason>`',
    '`-ecoadmin freeze @user <reason>`',
    '`-ecoadmin unfreeze @user <reason>`',
    '`-ecoadmin tx <id>`',
    '`-ecoadmin refund <id> <reason>`',
    '`-ecoadmin dept <id> +|-amount <reason>`',
    '`-ecoadmin cancel-robbery <reason>`',
  ].join('\n');
}

export default {
  name: 'ecoadmin',
  aliases: ['economyadmin', 'eco-admin'],
  description: 'Administrator economy tools.',
  async execute(message, args, client) {
    requireAdministrator(message);
    const sub = String(args[0] || '').toLowerCase();
    if (!sub) throw new Error(usage());
    const adminId = message.author.id;
    const bot = client || message.client;

    if (sub === 'view') {
      const userId = snowflakeFrom(args[1]) || args[1];
      if (!userId) throw new Error('Usage: `-ecoadmin view @user`');
      const wallet = await getWalletView(userId);
      const txs = await listUserTransactions(userId, 10);
      await message.reply(v2Card({
        title: 'Economy account',
        description: [
          `**User:** <@${userId}>`,
          `**Cash:** ${formatMoney(wallet.user.cash)}`,
          `**Bank:** ${formatMoney(wallet.user.bank)}`,
          `**Frozen:** ${wallet.user.frozen ? 'yes' : 'no'}`,
          `**Starter claimed:** ${wallet.user.starterGrantClaimed ? 'yes' : 'no'}`,
          '',
          ...txs.map((tx) => `\`${tx.id}\` ${tx.type} ${formatMoney(tx.amount)}`),
        ].join('\n'),
      }));
      return;
    }

    if (sub === 'give' || sub === 'take') {
      const userId = snowflakeFrom(args[1]);
      const amount = parseMoney(args[2]);
      const reason = args.slice(3).join(' ').trim();
      if (!userId || !Number.isFinite(amount) || amount <= 0 || !reason) {
        throw new Error(`Usage: \`-ecoadmin ${sub} @user <amount> <reason>\``);
      }
      const delta = sub === 'give' ? amount : -amount;
      const result = await adminEconomyAdjust(userId, { cashDelta: delta, reason, adminId });
      await postEconomyLog(bot, 'Admin adjustment', `<@${adminId}> ${sub} ${formatMoney(amount)} on <@${userId}> · ${reason} · \`${result.tx.id}\``);
      await message.reply(v2Card({
        title: 'Balance updated',
        description: `Cash ${formatMoney(result.before.cash)} → ${formatMoney(result.user.cash)}\n\`${result.tx.id}\``,
      }));
      return;
    }

    if (sub === 'set') {
      const userId = snowflakeFrom(args[1]);
      const which = String(args[2] || '').toLowerCase();
      const amount = parseMoney(args[3]);
      const reason = args.slice(4).join(' ').trim();
      if (!userId || !['cash', 'bank'].includes(which) || !Number.isFinite(amount) || !reason) {
        throw new Error('Usage: `-ecoadmin set @user cash|bank <amount> <reason>`');
      }
      const result = await adminEconomyAdjust(userId, {
        setCash: which === 'cash' ? amount : undefined,
        setBank: which === 'bank' ? amount : undefined,
        reason,
        adminId,
      });
      await postEconomyLog(bot, 'Admin adjustment', `<@${adminId}> set ${which} on <@${userId}> to ${formatMoney(amount)} · ${reason} · \`${result.tx.id}\``);
      await message.reply(v2Card({
        title: 'Balance set',
        description: `Cash ${formatMoney(result.user.cash)} · Bank ${formatMoney(result.user.bank)}\n\`${result.tx.id}\``,
      }));
      return;
    }

    if (sub === 'freeze' || sub === 'unfreeze') {
      const userId = snowflakeFrom(args[1]);
      const reason = args.slice(2).join(' ').trim();
      if (!userId || !reason) throw new Error(`Usage: \`-ecoadmin ${sub} @user <reason>\``);
      await adminFreeze(userId, sub === 'freeze', { adminId, reason });
      await postEconomyLog(bot, 'Admin freeze', `<@${adminId}> ${sub} <@${userId}> · ${reason}`);
      await message.reply(v2Card({ title: `Account ${sub}d`, description: `<@${userId}> · ${reason}` }));
      return;
    }

    if (sub === 'tx') {
      const tx = await lookupTransaction(args[1]);
      if (!tx) throw new Error('Unknown transaction.');
      await message.reply(v2Card({
        title: tx.id,
        description: [
          `**Type:** ${tx.type}`,
          `**Amount:** ${formatMoney(tx.amount)}`,
          `**From:** ${tx.fromId || tx.fromDept || '—'}`,
          `**To:** ${tx.toId || tx.toDept || '—'}`,
          `**Note:** ${tx.note || '—'}`,
          `**Ref:** \`${tx.referenceId}\``,
          `**At:** ${tx.createdAt}`,
        ].join('\n'),
      }));
      return;
    }

    if (sub === 'refund') {
      const reason = args.slice(2).join(' ').trim();
      if (!args[1] || !reason) throw new Error('Usage: `-ecoadmin refund <id> <reason>`');
      const result = await adminRefund(args[1], { adminId, reason });
      await postEconomyLog(bot, 'Refund', `<@${adminId}> refunded \`${result.original.id}\` · ${reason} · \`${result.tx.id}\``);
      await message.reply(v2Card({
        title: 'Refunded',
        description: `Original \`${result.original.id}\` · Refund \`${result.tx.id}\``,
      }));
      return;
    }

    if (sub === 'dept') {
      const dept = departmentById(args[1]);
      const amount = parseMoney(args[2]);
      const reason = args.slice(3).join(' ').trim();
      if (!dept || !Number.isFinite(amount) || !amount || !reason) {
        throw new Error('Usage: `-ecoadmin dept fhp|pcso|dispatch|cfr|bpd +|-amount <reason>`');
      }
      const result = await adminDepartmentAdjust(dept.id, amount, { adminId, reason });
      await postEconomyLog(bot, 'Admin adjustment', `<@${adminId}> ${dept.short} ${formatMoney(amount)} · ${reason} · \`${result.tx.id}\``);
      await message.reply(v2Card({
        title: `${dept.short} funds updated`,
        description: `${formatMoney(result.before)} → ${formatMoney(result.row.balance)}\n\`${result.tx.id}\``,
      }));
      return;
    }

    if (sub === 'cancel-robbery' || sub === 'cancelrobbery') {
      const reason = args.slice(1).join(' ').trim() || 'admin-cancel';
      await cancelRobbery(bot, reason, adminId);
      await message.reply(v2Card({ title: 'Robbery cancelled', description: reason }));
      return;
    }

    throw new Error(usage());
  },
};
