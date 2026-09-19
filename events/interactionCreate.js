import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handlePinellasSupportInteraction } from '../utils/pinellasSupport.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (await handlePinellasSupportInteraction(interaction)) return;
    } catch (error) {
      logger.error('Pinellas support interaction failed', error);
      const reply = {
        content: String(error?.message || 'That ticket action failed.').slice(0, 1800),
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  },
};
