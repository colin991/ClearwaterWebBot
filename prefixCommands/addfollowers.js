import { addInternetFollowers, ensureDefaultInternetAccount } from '../utils/internetStore.js';
import { mutateDiscordInternetStore } from '../utils/discordInternetStore.js';

export default {
  name: 'addfollowers',
  async execute(message, args) {
    if (message.author.id !== '1074411240757137589') return;
    const mentionId = args[0]?.match(/^<@!?(\d{16,22})>$/)?.[1];
    if (args.length !== 2 || (!mentionId && !args[0].startsWith('@')) || !/^\d+$/.test(args[1])) {
      await message.reply('Usage: -addfollowers @user-or-handle amount');
      return;
    }
    const amount = Number(args[1]);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be a positive whole number.');
    const target = mentionId ? (message.mentions?.users?.get(mentionId) || await message.client.users.fetch(mentionId)) : null;
    const result = await mutateDiscordInternetStore(store => {
      if (target) ensureDefaultInternetAccount(store, {
        id: target.id, username: target.username,
        displayName: target.globalName || target.username,
        avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
      });
      return addInternetFollowers(store, {
        actorId: message.author.id, handle: args[0], accountId: target?.id, amount,
      });
    });
    await message.reply({ content: `@${result.username} now has ${result.followerCount} followers.`, allowedMentions: { parse: [] } });
  },
};
