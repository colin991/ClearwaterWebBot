import { requireAdministrator } from '../utils/prefixHelpers.js';
import {
  fetchRobloxGroupFunds,
  groupFundsCard,
  looksLikeRobloxCookie,
  resolveFundsGroupId,
} from '../utils/robloxGroupFunds.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  name: 'funds',
  aliases: ['robux', 'groupfunds'],
  description: 'Administrator: show this Roblox group’s funds, last 7 payouts, and last 7 sales.',
  async execute(message, args, client) {
    requireAdministrator(message);
    if (looksLikeRobloxCookie(args.join(' ')) || looksLikeRobloxCookie(message.content)) {
      throw new Error('Do not paste your Roblox cookie in Discord. Put it in ROBLOX_COOKIE on the bot host .env and restart.');
    }

    const config = client?.config || message.client?.config || {};
    const info = await fetchRobloxGroupFunds({
      groupId: resolveFundsGroupId(config),
      cookie: config.robloxCookie,
    });
    await message.reply(v2Card(groupFundsCard(info)));
  },
};
