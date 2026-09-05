import { ActivityType, Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { ensureNoticeChannel } from '../utils/noticeChannel.js';
import { ensureInternetPanel } from '../utils/discordInternetPanel.js';
import { ensureInternetAutomodQueue } from '../utils/discordInternetModeration.js';
import { startSecondaryServerGate } from '../utils/secondaryServerGate.js';
import { startErlcZoneVoice } from '../utils/erlcZoneVoice.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.user.setActivity('Clearwater Roleplay', { type: ActivityType.Watching });
    logger.info(`Logged in as ${client.user.tag}.`);

    // Start the secondary-server role gate as soon as the gateway is ready.
    if (!client.stopSecondaryGate) {
      client.stopSecondaryGate = startSecondaryServerGate(client);
    }

    if (!client.stopErlcZoneVoice) {
      client.stopErlcZoneVoice = startErlcZoneVoice(client, client.config);
    }

    // Guild/channel cache can still be settling right after ready.
    const postNotice = async (attempt) => {
      try {
        await ensureNoticeChannel(client);
      } catch (error) {
        logger.error(`Could not prepare notice channel (attempt ${attempt})`, error);
        if (attempt < 3) {
          setTimeout(() => {
            void postNotice(attempt + 1);
          }, attempt * 2500);
        }
      }
    };
    setTimeout(() => {
      void postNotice(1);
    }, 1500);

    const postInternetPanel = async (attempt) => {
      try {
        await ensureInternetPanel(client);
      } catch (error) {
        logger.error(`Could not prepare Internet Panel (attempt ${attempt})`, error);
        if (attempt < 3) {
          setTimeout(() => {
            void postInternetPanel(attempt + 1);
          }, attempt * 2500);
        }
      }
    };
    setTimeout(() => {
      void postInternetPanel(1);
    }, 2000);

    setTimeout(() => {
      void ensureInternetAutomodQueue(client).catch((error) => {
        logger.error('Could not prepare the Internet automod review queue', error);
      });
    }, 2500);
  },
};
