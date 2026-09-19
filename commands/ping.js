import { MessageFlags, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the Clearwater bot is responding.'),

  async execute(interaction) {
    const roundTrip = Date.now() - interaction.createdTimestamp;
    const gateway = Math.max(0, Math.round(interaction.client.ws.ping || 0));
    await interaction.reply({
      content: `Pong! Response: ${roundTrip}ms · Discord: ${gateway}ms`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
