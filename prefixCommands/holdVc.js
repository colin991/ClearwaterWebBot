import { EmbedBuilder } from 'discord.js';
import {
  RANK_FLOOR,
  requireMinRank,
} from '../utils/prefixHelpers.js';
import {
  HOLD_VC_PHRASE,
  holdVoiceChat,
  releaseVoiceChat,
} from '../utils/holdVoiceChat.js';

export const holdvc = {
  name: 'holdvc',
  aliases: ['hold', 'vchold'],
  description: 'Server-mute everyone in a voice channel except Ownership and announce a hold with Onyx voice.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    const result = await holdVoiceChat(message, message.client.config);

    const lines = [
      `Holding ${result.voiceChannel}.`,
      `Server-muted **${result.mutedNow}** member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped).`,
      `Announcement: **${HOLD_VC_PHRASE}**`,
    ];
    if (result.voicePlayed) {
      lines.push('Played with OpenAI voice **onyx** in the voice channel.');
    } else if (!result.hasApiKey) {
      lines.push('Set `OPENAI_API_KEY` on the bot host to play the Onyx voice announcement in VC.');
    } else if (result.voiceError) {
      lines.push(`Could not play Onyx audio: ${result.voiceError}`);
    }

    await message.reply({
      content: HOLD_VC_PHRASE,
      tts: !result.voicePlayed,
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Hold VC')
          .setDescription(lines.join('\n')),
      ],
    });
  },
};

export const unholdvc = {
  name: 'unholdvc',
  aliases: ['releasevc', 'unhold'],
  description: 'Release a hold VC and unmute members muted by -holdvc.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    const result = await releaseVoiceChat(message);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Hold VC released')
          .setDescription(
            `Unmuted **${result.unmuted}** member${result.unmuted === 1 ? '' : 's'}`
            + (result.voiceChannel ? ` in ${result.voiceChannel}.` : '.'),
          ),
      ],
    });
  },
};

export default [holdvc, unholdvc];
