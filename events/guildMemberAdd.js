import { Events } from 'discord.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank } from '../utils/staffRanks.js';
import { readInternetStore, saveInternetStore, setInternetBan, upsertInternetUser } from '../utils/internetStore.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.guild.id !== CLEARWATER_GUILD_ID) return;

    const store = await readInternetStore();
    const existingUser = store.users[member.id];
    const staffRank = getHighestStaffRank(member);
    const user = upsertInternetUser(store, {
      id: member.id,
      username: member.user.username,
      displayName: member.user.globalName || member.user.username,
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 64 }),
      staffRank: staffRank?.name || null,
    });

    if (existingUser?.banned === true) {
      setInternetBan(user, { enabled: false });
      logger.info('Unbanned a Clearwater Internet account after they joined the Clearwater Discord server.');
    }

    await saveInternetStore(store);
  },
};
