import { Events } from 'discord.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank } from '../utils/staffRanks.js';
import { readInternetStore, saveInternetStore, upsertInternetUser } from '../utils/internetStore.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(_previousMember, member) {
    if (member.guild.id !== CLEARWATER_GUILD_ID) return;

    const store = await readInternetStore();
    if (!store.users[member.id]) return;

    const rank = getHighestStaffRank(member);
    upsertInternetUser(store, {
      id: member.id,
      username: member.user.username,
      displayName: member.user.globalName || member.user.username,
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 64 }),
      staffRank: rank?.name || null,
    });
    await saveInternetStore(store);
  },
};
