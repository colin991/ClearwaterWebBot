import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { requireOwnership } from '../utils/prefixHelpers.js';
import { releaseVoiceChat } from '../utils/holdVoiceChat.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unholdvc')
    .setDescription('Ownership: release a hold VC, unmute members, and leave the channel.'),

  async execute(interaction) {
    requireOwnership(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await releaseVoiceChat(interaction);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Hold VC released')
          .setDescription(
            `Unmuted **${result.unmuted}** member${result.unmuted === 1 ? '' : 's'}`
            + (result.voiceChannel ? ` in ${result.voiceChannel}` : '')
            + ' and left the voice channel.',
          ),
      ],
    });
  },
};
