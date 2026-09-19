import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { requireOwnership } from '../utils/prefixHelpers.js';
import { getActiveHold } from '../utils/holdVoiceChat.js';
import { logVcAction } from '../utils/vcActionLog.js';
import { SAY_MAX_CHARS, sayInVoiceChannel } from '../utils/vcSpeak.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Ownership: join a voice channel and speak the given text for everyone.')
    .addStringOption((option) => option
      .setName('text')
      .setDescription('What the bot should say in voice chat')
      .setRequired(true)
      .setMaxLength(SAY_MAX_CHARS))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Voice channel to speak in (defaults to the one you are in)')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setRequired(false)),

  async execute(interaction) {
    requireOwnership(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const text = interaction.options.getString('text', true);
    const channel = interaction.options.getChannel('channel', false);
    const target = channel || interaction.member?.voice?.channel || null;
    const hold = getActiveHold(interaction.guildId);
    const leaveAfter = !(hold && target && hold.channelId === target.id);

    const result = await sayInVoiceChannel(interaction, text, {
      explicitChannel: channel,
      leaveAfter,
    });

    await logVcAction(interaction.client, interaction.client.config, {
      tag: 'HoldVC',
      action: 'SAY',
      received: '/say',
      actor: interaction.user,
      voiceChannel: result.voiceChannel,
      context: `“${result.text}”; ${result.leftAfter ? 'left after' : 'stayed (hold active)'}`,
    });

    await interaction.editReply(v2Card({
      title: 'Say',
      description: [
        `Spoke in ${result.voiceChannel}:`,
        `“${result.text}”`,
        result.leftAfter ? 'Left the voice channel afterward.' : 'Stayed in the channel (hold VC is active).',
      ].join('\n'),
      replace: true,
    }));
  },
};
