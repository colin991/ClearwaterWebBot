import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { requireOwnership } from '../utils/prefixHelpers.js';
import { releaseVoiceChat } from '../utils/holdVoiceChat.js';
import { logVcAction } from '../utils/vcActionLog.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unholdvc')
    .setDescription('Ownership: release a hold VC, unmute members, and leave the channel.'),

  async execute(interaction) {
    requireOwnership(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await releaseVoiceChat(interaction);

    await logVcAction(interaction.client, interaction.client.config, {
      title: '/unholdvc used',
      actor: interaction.user,
      voiceChannel: result.voiceChannel,
      details: [
        {
          name: 'Unmuted',
          value: `${result.unmuted} member${result.unmuted === 1 ? '' : 's'}`,
          inline: true,
        },
      ],
    });

    await interaction.editReply(v2Card({
      title: 'Hold VC released',
      description: (
        `Unmuted **${result.unmuted}** member${result.unmuted === 1 ? '' : 's'}`
        + (result.voiceChannel ? ` in ${result.voiceChannel}` : '')
        + ' and left the voice channel.'
      ),
      replace: true,
    }));
  },
};
