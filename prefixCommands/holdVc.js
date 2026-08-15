import { EmbedBuilder } from 'discord.js';
import { requireOwnership } from '../utils/prefixHelpers.js';
import {
  HOLD_VC_PHRASE,
  holdVoiceChat,
  releaseVoiceChat,
} from '../utils/holdVoiceChat.js';

export const holdvc = {
  name: 'holdvc',
  description: 'Ownership-only: join a voice channel, speak the hold line with Onyx for everyone, then mute non-Ownership.',
  async execute(message) {
    requireOwnership(message);
    const result = await holdVoiceChat(message, message.client.config);

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Hold VC')
          .setDescription([
            `Joined ${result.voiceChannel} and played **Onyx** for everyone:`,
            `“${HOLD_VC_PHRASE}”`,
            `Server-muted **${result.mutedNow}** member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped).`,
            'Use `-unholdvc` to unmute and make the bot leave.',
          ].join('\n')),
      ],
    });
  },
};

export const unholdvc = {
  name: 'unholdvc',
  description: 'Ownership-only: release a hold VC, unmute members, and leave the voice channel.',
  async execute(message) {
    requireOwnership(message);
    const result = await releaseVoiceChat(message);
    await message.reply({
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

export default [holdvc, unholdvc];
