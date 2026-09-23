import { Events } from 'discord.js';
import { startModCallVoice } from '../utils/modCallVoice.js';
import { startCommandAbuse } from '../utils/commandAbuse.js';
import { startVehiclePresetCheck } from '../utils/vehiclePreset.js';
import { startPoliceCarCheck } from '../utils/policeCars.js';
import { startServerWeather } from '../utils/serverWeather.js';
import { startSheriffBalance } from '../utils/sheriffBalance.js';
import { startPriorityRequest } from '../utils/priorityRequest.js';
import { startLeoBriefing } from '../utils/leoBriefing.js';
import { startVcChecks } from '../utils/vcChecks.js';
import { logger } from '../utils/logger.js';
import { ensureNoticeChannel } from '../utils/noticeChannel.js';
import { ensureInternetPanel } from '../utils/discordInternetPanel.js';
import { ensureInternetAutomodQueue } from '../utils/discordInternetModeration.js';
import { startSecondaryServerGate } from '../utils/secondaryServerGate.js';
import { startErlcZoneVoice } from '../utils/erlcZoneVoice.js';
import { startDispatchChannelStatus } from '../utils/dispatchChannelStatus.js';
import { startCorrectionsChannelStatus } from '../utils/correctionsChannelStatus.js';
import { startFrequencyChangeGreeting } from '../utils/frequencyChangeGreeting.js';
import { startSoundboardAccess } from '../utils/soundboardAccess.js';
import { ensurePinellasServerProfile } from '../utils/pinellasServer.js';
import { clearFloridaServerProfile } from '../utils/floridaServer.js';
import { startBotApiServer } from '../utils/botApiServer.js';
import { startErlcSceneCommands } from '../utils/erlcSceneCommands.js';
import { startErlcCallRadio } from '../utils/erlcCallRadio.js';
import { fetchErlcServer } from '../utils/erlc.js';
import { startOpenTicketPermissionSync } from '../utils/pinellasSupport.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    // No global Watching activity — keep the profile status clear.
    try {
      client.user.setPresence({ activities: [], status: 'online' });
    } catch (error) {
      logger.warn('Could not clear bot presence; continuing startup.', error);
    }
    logger.info(`Logged in as ${client.user.tag}.`);
    startOpenTicketPermissionSync(client);

    setTimeout(() => {
      void ensurePinellasServerProfile(client).catch((error) => {
        logger.error('Pinellas server profile setup failed', error);
      });
    }, 1200);

    setTimeout(() => {
      void clearFloridaServerProfile(client).catch((error) => {
        logger.error('Florida server profile clear failed', error);
      });
    }, 2800);

    const startGameServices = async () => {
      let warmed = false;
      if (client.config.erlcServerKey) {
        try {
          await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 20_000 });
          warmed = true;
        } catch (error) {
          logger.warn(`Could not warm the ER:LC player list: ${error?.message || error}`);
        }
      }
      if (!client.leoBriefing && client.config.erlcServerKey) startLeoBriefing(client);
      if (!warmed && client.config.erlcServerKey) {
        logger.warn('Skipping ER:LC background loops until a snapshot succeeds. Prefix commands can still retry.');
        return;
      }
      if (!client.stopPriorityRequest) client.stopPriorityRequest = startPriorityRequest(client);
      if (!client.stopVcChecks) client.stopVcChecks = startVcChecks(client, client.config);
      if (!client.stopSheriffBalance) client.stopSheriffBalance = startSheriffBalance(client);
      if (!client.stopCommandAbuse) client.stopCommandAbuse = startCommandAbuse(client);
      if (!client.stopVehiclePresetCheck) client.stopVehiclePresetCheck = startVehiclePresetCheck(client);
      if (!client.stopPoliceCarCheck) client.stopPoliceCarCheck = startPoliceCarCheck(client);
      if (!client.stopServerWeather) client.stopServerWeather = startServerWeather(client);
      if (!client.stopModCallVoice) client.stopModCallVoice = startModCallVoice(client);
      if (!client.stopErlcZoneVoice) {
        client.stopErlcZoneVoice = startErlcZoneVoice(client, client.config);
      }
    };
    void startGameServices();

    // Start the secondary-server role gate as soon as the gateway is ready.
    if (!client.stopSecondaryGate) {
      client.stopSecondaryGate = startSecondaryServerGate(client);
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

    if (!client.stopSoundboardAccess) {
      client.stopSoundboardAccess = startSoundboardAccess(client);
    }

    if (!client.stopBotApiServer) {
      client.stopBotApiServer = startBotApiServer(client);
    }

    if (!client.stopErlcSceneCommands) {
      client.stopErlcSceneCommands = startErlcSceneCommands(client);
    }

    if (!client.stopErlcCallRadio) {
      client.stopErlcCallRadio = startErlcCallRadio(client);
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
