import { Events } from 'discord.js';
import { handleHoldVoiceStateUpdate } from '../utils/holdVoiceChat.js';
import { handleDispatchVoiceStateUpdate } from '../utils/dispatchChannelStatus.js';
import { handleCorrectionsVoiceStateUpdate } from '../utils/correctionsChannelStatus.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    try {
      await handleHoldVoiceStateUpdate(oldState, newState, client.config);
    } catch (error) {
      logger.warn(`Hold VC voice state update failed: ${error?.message || error}`);
    }

    try {
      await handleDispatchVoiceStateUpdate(oldState, newState, client);
    } catch (error) {
      logger.warn(`Dispatch VC status update failed: ${error?.message || error}`);
    }

    try {
      await handleCorrectionsVoiceStateUpdate(oldState, newState, client);
    } catch (error) {
      logger.warn(`Corrections VC status update failed: ${error?.message || error}`);
    }
  },
};
