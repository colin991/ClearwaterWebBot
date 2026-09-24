import { Events } from 'discord.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank, getInternetBadges } from '../utils/staffRanks.js';
import { readInternetStore, saveInternetStore, setInternetBan, upsertInternetUser } from '../utils/internetStore.js';
import { handleSecondaryGateJoin } from '../utils/secondaryServerGate.js';
import { sendPinellasWelcome } from '../utils/pinellasServer.js';
import { sendBelleairWelcome } from '../utils/belleairServer.js';
import { handleSoundboardMemberAdd } from '../utils/soundboardAccess.js';
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

    try {
      const welcomed = await sendPinellasWelcome(member);
      if (welcomed) return;
    } catch (error) {
      logger.error('Pinellas welcome message failed', error);
    }

    try {
      const welcomed = await sendBelleairWelcome(member);
      if (welcomed) return;
    } catch (error) {
      logger.error('Belleair welcome message failed', error);
    }

    try {
      await handleSoundboardMemberAdd(member, client || member.client);
    } catch (error) {
      logger.warn(`Soundboard access join failed: ${error?.message || error}`);
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
