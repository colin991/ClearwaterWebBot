import { Events } from 'discord.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank, getInternetBadges } from '../utils/staffRanks.js';
import { readInternetStore, saveInternetStore, upsertInternetUser } from '../utils/internetStore.js';
import { handleSecondaryGateMainRoleUpdate } from '../utils/secondaryServerGate.js';
import { handleDispatchMemberUpdate } from '../utils/dispatchChannelStatus.js';
import { handleCorrectionsMemberUpdate } from '../utils/correctionsChannelStatus.js';
import { handlePinellasEmployeeRoleWelcome } from '../utils/pinellasServer.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(previousMember, member, client) {
    try {
      await handleSecondaryGateMainRoleUpdate(previousMember, member, client || member.client);
    } catch (error) {
      logger.error('Secondary server gate role update check failed', error);
    }

    try {
      await handleDispatchMemberUpdate(previousMember, member, client || member.client);
    } catch (error) {
      logger.warn(`Dispatch status member update failed: ${error?.message || error}`);
    }

    try {
      await handleCorrectionsMemberUpdate(previousMember, member, client || member.client);
    } catch (error) {
      logger.warn(`Corrections status member update failed: ${error?.message || error}`);
    }

    try {
      await handlePinellasEmployeeRoleWelcome(previousMember, member);
    } catch (error) {
      logger.warn(`Pinellas employee welcome failed: ${error?.message || error}`);
    }

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
      badges: getInternetBadges(member),
    });
    await saveInternetStore(store);
  },
};
