import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildRadioStaffPanel, isRadioAdmin } from '../utils/radioStaff.js';

export default {
  data: new SlashCommandBuilder()
    .setName('radio-staff')
    .setDescription('Admins: see who is on the radio, force-mute someone or kick them off the radio.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isRadioAdmin(interaction)) {
      await interaction.reply({ content: 'Only admins can use the radio staff panel.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...buildRadioStaffPanel(), flags: MessageFlags.Ephemeral });
  },
};
