import { requireAdministrator } from '../utils/prefixHelpers.js';
import { formatErlcRateLimitReport, getErlcRateLimitStatus } from '../utils/erlc.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  name: 'ratelimit',
  aliases: ['ratelimits', 'erlc-limit'],
  description: 'Show the current ER:LC API cooldown and queue (Administrator only).',
  async execute(message) {
    requireAdministrator(message);
    const status = getErlcRateLimitStatus();
    await message.reply(v2Card({
      title: 'ER:LC Rate Limit',
      description: formatErlcRateLimitReport(status),
      footer: 'PRC limits this host by IP. POST /command is 1 per 5s. Other bots on another IP can still work.',
    }));
  },
};
