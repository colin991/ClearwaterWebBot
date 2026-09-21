import { requireOwnership } from '../utils/prefixHelpers.js';
import {
  fetchRobloxGroupFunds,
  groupFundsCard,
  looksLikeRobloxCookie,
} from '../utils/robloxGroupFunds.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  name: 'funds',
  aliases: ['robux', 'groupfunds'],
  description: 'Ownership-only: show this Roblox group’s funds.',
  async execute(message, args, client) {
    requireOwnership(message);
    if (looksLikeRobloxCookie(args.join(' ')) || looksLikeRobloxCookie(message.content)) {
      throw new Error('Do not paste your Roblox cookie in Discord. Put it in ROBLOX_COOKIE on the bot host .env and restart.');
    }

    const config = client?.config || message.client?.config || {};
    const info = await fetchRobloxGroupFunds({
      groupId: config.robloxGroupId,
      cookie: config.robloxCookie,
    });
    await message.reply(v2Card(groupFundsCard(info)));
  },
};
