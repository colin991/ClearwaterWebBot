import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { requireOwnership } from '../utils/prefixHelpers.js';
import {
  HOLD_VC_PHRASE,
  holdVoiceChat,
} from '../utils/holdVoiceChat.js';
import { logVcAction } from '../utils/vcActionLog.js';
import { v2Card } from '../utils/v2Message.js';

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

    await logVcAction(interaction.client, interaction.client.config, {
      title: '/holdvc used',
      actor: interaction.user,
      voiceChannel: result.voiceChannel,
      details: [
        { name: 'Announcement', value: `“${HOLD_VC_PHRASE}”` },
        {
          name: 'Muted',
          value: `${result.mutedNow} member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped)`,
          inline: true,
        },
      ],
    });

    await interaction.editReply(v2Card({
      title: 'Hold VC',
      description: [
        `Joined ${result.voiceChannel} and played for everyone:`,
        `“${HOLD_VC_PHRASE}”`,
        `Server-muted **${result.mutedNow}** member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped).`,
        'Use `/unholdvc` to unmute and make the bot leave.',
      ].join('\n'),
      replace: true,
    }));
  },
};
