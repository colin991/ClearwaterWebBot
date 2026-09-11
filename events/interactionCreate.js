import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleDiscordInternetInteraction } from '../utils/discordInternetPanel.js';
import { handleDiscordInternetModerationInteraction } from '../utils/discordInternetModeration.js';
import { DISCORD_INTERNET_UNSUB_CUSTOM_ID } from '../utils/discordInternetNotify.js';
import { readInternetStore, saveInternetStore, updateInternetPreference } from '../utils/internetStore.js';
import { handlePinellasApplyInteraction } from '../utils/pinellasApply.js';
import { handlePinellasInfractInteraction } from '../utils/pinellasInfract.js';
import { handlePinellasMassShiftInteraction } from '../utils/pinellasMassShift.js';
import { handlePinellasCallsignInteraction } from '../utils/pinellasRoster.js';
import { handlePinellasShiftPanelInteraction } from '../utils/pinellasShiftPanel.js';
import { handlePinellasSupportInteraction } from '../utils/pinellasSupport.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (await handleDiscordInternetModerationInteraction(interaction)) return;
    if (await handleDiscordInternetInteraction(interaction, client)) return;

    try {
      if (await handlePinellasApplyInteraction(interaction)) return;
    } catch (error) {
      logger.error('Pinellas apply interaction failed', error);
    }

    try {
      if (await handlePinellasInfractInteraction(interaction)) return;
    } catch (error) {
      logger.error('Pinellas infract interaction failed', error);
    }

    try {
      if (await handlePinellasMassShiftInteraction(interaction)) return;
    } catch (error) {
      logger.error('Pinellas mass shift interaction failed', error);
    }

    try {
      if (await handlePinellasCallsignInteraction(interaction, client)) return;
    } catch (error) {
      logger.error('Pinellas callsign interaction failed', error);
      const reply = {
        content: String(error?.message || 'The callsign could not be assigned.').slice(0, 1800),
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.deferred) {
        await interaction.editReply({ content: reply.content });
      } else if (interaction.replied) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
      return;
    }

    try {
      if (await handlePinellasSupportInteraction(interaction)) return;
    } catch (error) {
      logger.error('Pinellas support interaction failed', error);
    }

    try {
      if (await handlePinellasShiftPanelInteraction(interaction)) return;
    } catch (error) {
      logger.error('Pinellas shift panel interaction failed', error);
    }

    if (interaction.isButton()) {
      if (interaction.customId !== DISCORD_INTERNET_UNSUB_CUSTOM_ID) return;

      try {
        const store = await readInternetStore();
        updateInternetPreference(store, {
          actor: { id: interaction.user.id },
          key: 'discordDmNotifications',
          enabled: false,
        });
        await saveInternetStore(store);
        await interaction.reply({
          content: 'Discord DM notifications for Clearwater Internet are now off. You can turn them back on from the Internet Panel settings.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        logger.error('Failed to unsubscribe Clearwater Internet Discord DMs', error);
        const reply = {
          content: 'Could not update your notification preference. Try again from the Internet Panel settings.',
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Command failed: /${interaction.commandName}`, error);
      const reply = {
        content: String(error?.message || 'That command could not be completed. Please try again.').slice(0, 1800),
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    }
  },
};
