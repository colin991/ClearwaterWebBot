import { requireOwnership } from '../utils/prefixHelpers.js';
import {
  HOLD_VC_PHRASE,
  holdVoiceChat,
  releaseVoiceChat,
} from '../utils/holdVoiceChat.js';
import { logVcAction } from '../utils/vcActionLog.js';
import { v2Card } from '../utils/v2Message.js';

export const holdvc = {
  name: 'holdvc',
  description: 'Ownership-only: join a voice channel, play the hold announcement for everyone, then mute non-Ownership.',
  async execute(message) {
    requireOwnership(message);
    const result = await holdVoiceChat(message, message.client.config);

    await logVcAction(message.client, message.client.config, {
      title: '-holdvc used',
      actor: message.author,
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

    await message.reply(v2Card({
      title: 'Hold VC',
      description: [
        `Joined ${result.voiceChannel} and played for everyone:`,
        `“${HOLD_VC_PHRASE}”`,
        `Server-muted **${result.mutedNow}** member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped).`,
        'Use `-unholdvc` to unmute and make the bot leave.',
      ].join('\n'),
    }));
  },
};

export const unholdvc = {
  name: 'unholdvc',
  description: 'Ownership-only: release a hold VC, unmute members, and leave the voice channel.',
  async execute(message) {
    requireOwnership(message);
    const result = await releaseVoiceChat(message);

    await logVcAction(message.client, message.client.config, {
      title: '-unholdvc used',
      actor: message.author,
      voiceChannel: result.voiceChannel,
      details: [
        {
          name: 'Unmuted',
          value: `${result.unmuted} member${result.unmuted === 1 ? '' : 's'}`,
          inline: true,
        },
      ],
    });

    await message.reply(v2Card({
      title: 'Hold VC released',
      description: (
        `Unmuted **${result.unmuted}** member${result.unmuted === 1 ? '' : 's'}`
        + (result.voiceChannel ? ` in ${result.voiceChannel}` : '')
        + ' and left the voice channel.'
      ),
    }));
  },
};

export default [holdvc, unholdvc];
