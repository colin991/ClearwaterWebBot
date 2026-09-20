import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasDiscordAdministrator } from '../utils/leoBriefing.js';

export default {
  data: new SlashCommandBuilder()
    .setName('briefing')
    .setDescription('Start a server-wide LEO briefing (Administrator only).')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId) {
      await interaction.reply({
        content: 'Use `/briefing` in the Clearwater Discord server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!await hasDiscordAdministrator(interaction)) {
      await interaction.reply({
        content: 'You must have the Discord Administrator permission to run `/briefing`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const service = interaction.client.leoBriefing;
    if (!service) {
      await interaction.reply({
        content: 'LEO briefing is still starting. Try again shortly.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!interaction.client.config.erlcServerKey) {
      await interaction.reply({
        content: 'The ER:LC server key is not set on the bot host.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.member?.voice?.channel
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: 'Join a voice channel first. Police and Sheriff players in voice will be dragged there.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await service.start({
      user: interaction.user,
      voiceChannelId: voiceChannel.id,
    });
    const moved = result.moved?.moved?.length || 0;
    const skipped = result.moved?.skipped?.length || 0;
    await interaction.editReply([
      'LEO briefing started.',
      `Dragged **${moved}** Police/Sheriff member(s) into ${voiceChannel}. Skipped **${skipped}** (not in voice or not linked).`,
      'In-game: start message, **20 minute** peace timer, and **BRIEFING WALLS** loaded.',
      'Check your DMs for the panel to load/unload **BRIEFING ROAD BLOCKS** or end the briefing.',
    ].join('\n'));
  },
};
