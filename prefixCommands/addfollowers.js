import { addInternetFollowers } from '../utils/internetStore.js';
import { mutateDiscordInternetStore } from '../utils/discordInternetStore.js';

export default {
  name: 'addfollowers',
  async execute(message, args) {
    if (message.author.id !== '1074411240757137589') return;
    if (args.length !== 2 || !args[0].startsWith('@') || !/^\d+$/.test(args[1])) {
      await message.reply('Usage: -addfollowers @handle amount');
      return;
    }
    const result = await mutateDiscordInternetStore(store => addInternetFollowers(store, {
      actorId: message.author.id, handle: args[0], amount: Number(args[1]),
    }));
    await message.reply({ content: `@${result.username} now has ${result.followerCount} followers.`, allowedMentions: { parse: [] } });
  },
};
