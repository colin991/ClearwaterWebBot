import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { ensureNoticeChannel } from '../utils/noticeChannel.js';
import { ensureInternetPanel } from '../utils/discordInternetPanel.js';
import { ensureInternetAutomodQueue } from '../utils/discordInternetModeration.js';
import { startSecondaryServerGate } from '../utils/secondaryServerGate.js';
import { startErlcZoneVoice } from '../utils/erlcZoneVoice.js';
import { startDispatchChannelStatus } from '../utils/dispatchChannelStatus.js';
import { startCorrectionsChannelStatus } from '../utils/correctionsChannelStatus.js';
import { startFrequencyChangeGreeting } from '../utils/frequencyChangeGreeting.js';
import { ensurePinellasServerProfile } from '../utils/pinellasServer.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    // No global Watching activity — keep the profile status clear.
    await client.user.setPresence({ activities: [], status: 'online' }).catch(() => null);
    logger.info(`Logged in as ${client.user.tag}.`);

    setTimeout(() => {
      void ensurePinellasServerProfile(client).catch((error) => {
        logger.error('Pinellas server profile setup failed', error);
      });
    }, 1200);

    // Start the secondary-server role gate as soon as the gateway is ready.
    if (!client.stopSecondaryGate) {
      client.stopSecondaryGate = startSecondaryServerGate(client);
    }

    if (!client.stopErlcZoneVoice) {
      client.stopErlcZoneVoice = startErlcZoneVoice(client, client.config);
    }

    if (!client.stopDispatchChannelStatus) {
      client.stopDispatchChannelStatus = startDispatchChannelStatus(client);
    }

    if (!client.stopCorrectionsChannelStatus) {
      client.stopCorrectionsChannelStatus = startCorrectionsChannelStatus(client);
    }

    if (!client.stopFrequencyChangeGreeting) {
      client.stopFrequencyChangeGreeting = startFrequencyChangeGreeting(client);
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
