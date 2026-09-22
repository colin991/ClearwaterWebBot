import { addInternetFollowers } from '../utils/internetStore.js';
import { mutateDiscordInternetStore } from '../utils/discordInternetStore.js';
import { snowflakeFrom } from '../utils/prefixHelpers.js';

function pingedUserId(message, args) {
  const fromArg = snowflakeFrom(args[0] || '');
  if (fromArg) return fromArg;
  const mention = message.mentions?.users?.filter((user) => !user.bot && user.id !== message.author.id)?.first()
    || message.mentions?.users?.filter((user) => !user.bot)?.first();
  return mention?.id || null;
}

function followerAmount(args) {
  const token = [...args].reverse().find((arg) => /^\d{1,7}$/.test(arg));
  return Number(token);
}

export default {
  name: 'addfollowers',
  async execute(message, args) {
    if (message.author.id !== '1074411240757137589') return;
    const amount = followerAmount(args);
    const discordId = pingedUserId(message, args);
    const handle = !discordId && args[0] ? args[0] : '';
    if (!Number.isSafeInteger(amount) || amount <= 0 || (!discordId && !handle)) {
      await message.reply('Usage: `-addfollowers @user amount`');
      return;
    }

    const mentioned = discordId
      ? await message.client.users.fetch(discordId).catch(() => null)
      : null;
    const result = await mutateDiscordInternetStore((store) => addInternetFollowers(store, {
      actorId: message.author.id,
      discordId: discordId || undefined,
      handle: discordId ? undefined : handle,
      amount,
      actor: mentioned
        ? {
          id: mentioned.id,
          username: mentioned.username,
          displayName: mentioned.globalName || mentioned.displayName || mentioned.username,
          avatarUrl: typeof mentioned.displayAvatarURL === 'function'
            ? mentioned.displayAvatarURL({ extension: 'png', size: 256 })
            : '',
        }
        : undefined,
    }));
    await message.react('✅').catch(() => {});
    await message.reply({
      content: `@${result.username} now has ${result.followerCount} followers.`,
      allowedMentions: { parse: [] },
    });
  },
};
