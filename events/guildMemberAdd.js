import { Events } from 'discord.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank, getInternetBadges } from '../utils/staffRanks.js';
import { readInternetStore, saveInternetStore, setInternetBan, upsertInternetUser } from '../utils/internetStore.js';
import { handleSecondaryGateJoin } from '../utils/secondaryServerGate.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      const gated = await handleSecondaryGateJoin(member, client || member.client);
      if (gated) return;
    } catch (error) {
      logger.error('Secondary server gate join check failed', error);
    }

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
      badges: getInternetBadges(member),
    });

    if (existingUser?.banned === true) {
      setInternetBan(user, { enabled: false });
      logger.info('Unbanned a Clearwater Internet account after they joined the Clearwater Discord server.');
    }

    await saveInternetStore(store);
  },
};
