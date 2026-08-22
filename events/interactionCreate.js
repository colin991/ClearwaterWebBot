import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleDiscordInternetInteraction } from '../utils/discordInternetPanel.js';
import { handleDiscordInternetModerationInteraction } from '../utils/discordInternetModeration.js';
import { DISCORD_INTERNET_UNSUB_CUSTOM_ID } from '../utils/discordInternetNotify.js';
import { readInternetStore, saveInternetStore, updateInternetPreference } from '../utils/internetStore.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (await handleDiscordInternetModerationInteraction(interaction)) return;
    if (await handleDiscordInternetInteraction(interaction, client)) return;

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
