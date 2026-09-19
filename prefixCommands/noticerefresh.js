import { ensureNoticeChannel } from '../utils/noticeChannel.js';
import { requireOwnership } from '../utils/prefixHelpers.js';

export default {
  name: 'noticerefresh',
  description: 'Force-send or refresh the no-message notice channel post (Ownership).',
  async execute(message, _args, client) {
    requireOwnership(message);
    const notice = await ensureNoticeChannel(client, { forceNew: true });
    await message.reply(`Notice refreshed in <#${notice.channelId}> (\`${notice.id}\`).`).catch(() => {});
  },
};
