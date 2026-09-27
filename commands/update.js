import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasDiscordAdministrator } from '../utils/leoBriefing.js';
import { parseEasternUpdateTime } from '../utils/updateCountdown.js';

export default {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('Start an update countdown on your current voice channel (Administrator only).')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName('time')
      .setDescription('Eastern time, for example 9:00pm')
      .setRequired(true)),

  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId) {
      await interaction.reply({ content: 'Use `/update` in the Clearwater Discord server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!await hasDiscordAdministrator(interaction)) {
      await interaction.reply({ content: 'You must have the Discord Administrator permission to use `/update`.', flags: MessageFlags.Ephemeral });
      return;
    }
    const member = interaction.member?.voice?.channel
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    const channel = member.voice?.channel;
    if (!channel?.isVoiceBased?.()) {
      await interaction.reply({ content: 'Join the voice channel whose status you want to update, then run the command again.', flags: MessageFlags.Ephemeral });
      return;
    }
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions?.has(PermissionFlagsBits.SetVoiceChannelStatus)
      && !permissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: 'I need **Set Voice Channel Status** or **Manage Channels** in that voice channel.', flags: MessageFlags.Ephemeral });
      return;
    }
    const service = interaction.client.updateCountdown;
    if (!service) {
      await interaction.reply({ content: 'The update countdown service is still starting. Try again shortly.', flags: MessageFlags.Ephemeral });
      return;
    }
    const endsAt = parseEasternUpdateTime(interaction.options.getString('time', true));
    await service.setCountdown({ guildId: interaction.guildId, channelId: channel.id, endsAt, createdBy: interaction.user.id });
    await interaction.reply({
      content: `Update countdown started in ${channel}. It ends <t:${Math.floor(endsAt / 1000)}:F> (<t:${Math.floor(endsAt / 1000)}:R>).`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
