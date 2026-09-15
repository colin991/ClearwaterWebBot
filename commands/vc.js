import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { postProximityLog } from '../utils/vcActionLog.js';

export default {
  data: new SlashCommandBuilder().setName('vc').setDescription('Manage in-game voice channel checks.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false)
    .addSubcommand(sub => sub.setName('checks').setDescription('Turn automatic voice checks on or off.')
      .addStringOption(option => option.setName('state').setDescription('Enable or disable checks').setRequired(true)
        .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }))),
  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId ||
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You must have Administrator permission in the Clearwater server to use this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    const service = interaction.client.vcChecks;
    if (!service) {
      await interaction.reply({ content: 'VC checks are still starting. Try again shortly.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const enabled = interaction.options.getString('state', true) === 'on';
    const result = await service.setEnabled(enabled);
    void postProximityLog(interaction.client, {
      tag: 'VcCheck',
      body: `${interaction.user.username} (${interaction.user.id}): Received \`/vc checks ${enabled ? 'on' : 'off'}\``,
    });
    await interaction.editReply('VC checks are now **' + (enabled ? 'on' : 'off') + '**. Checks default to on after a bot restart.' +
      (!enabled && result.pendingReleases ? ' Some releases are pending; the bot will retry automatically.' : ''));
  },
};
