import { logger } from './logger.js';
import {
  clearExpiredInternetBans,
  clearExpiredInternetIpBans,
  notifyActiveBusinessesLogoUrlUpdate,
  purgeIdleBusinessAccounts,
  readInternetStore,
  saveInternetStore,
  setDiscordInternetNotify,
} from './internetStore.js';
import { createDiscordInternetNotifier } from './discordInternetNotify.js';
import { startPinellasInfractionExpiry } from './pinellasInfract.js';

/**
 * Discord-only background services formerly started inside the website HTTP bridge.
 * @returns {() => void} stop function
 */
export function startBotServices(client, config) {
  setDiscordInternetNotify(createDiscordInternetNotifier(client, {
    guildId: config.guildId,
    internetFeedChannelId: config.internetFeedChannelId,
  }));

  const cleanUpInternetData = async () => {
    try {
      const store = await readInternetStore();
      const clearedBans = clearExpiredInternetBans(store);
      const clearedIpBans = clearExpiredInternetIpBans(store);
      const idleBusinesses = purgeIdleBusinessAccounts(store);
      const logoNotices = notifyActiveBusinessesLogoUrlUpdate(store);
      if (clearedBans || clearedIpBans || idleBusinesses.length || logoNotices) {
        await saveInternetStore(store);
        if (clearedBans) logger.info(`Automatically unbanned ${clearedBans} Clearwater Internet account(s).`);
        if (clearedIpBans) logger.info(`Removed ${clearedIpBans} expired Clearwater Internet network ban(s).`);
        if (idleBusinesses.length) {
          logger.info(`Removed ${idleBusinesses.length} idle Clearwater business account(s).`);
        }
        if (logoNotices) logger.info(`Notified ${logoNotices} business handler(s) to update logos via URL.`);
      }
    } catch (error) {
      logger.error('Could not clean up expired Clearwater Internet data', error);
    }
  };

  const dataCleanup = setInterval(() => { void cleanUpInternetData(); }, 60 * 1000);
  dataCleanup.unref();
  void cleanUpInternetData();

  const stopInfractionExpiry = startPinellasInfractionExpiry(client);

  return () => {
    clearInterval(dataCleanup);
    stopInfractionExpiry();
  };
}
