import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { requireOwnership } from '../utils/prefixHelpers.js';
import {
  HOLD_VC_PHRASE,
  holdVoiceChat,
} from '../utils/holdVoiceChat.js';

export default {
  data: new SlashCommandBuilder()
    .setName('holdvc')
    .setDescription('Ownership: join a VC, play the hold announcement, and mute everyone else.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Voice channel to hold (defaults to the one you are in)')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setRequired(false)),

  async execute(interaction) {
    requireOwnership(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.options.getChannel('channel', false);
    const result = await holdVoiceChat(interaction, interaction.client.config, channel);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Hold VC')
          .setDescription([
            `Joined ${result.voiceChannel} and played for everyone:`,
            `“${HOLD_VC_PHRASE}”`,
            `Server-muted **${result.mutedNow}** member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped).`,
            'Use `/unholdvc` to unmute and make the bot leave.',
          ].join('\n')),
      ],
    });
  },
};
