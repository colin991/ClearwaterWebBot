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
  description: 'Ownership-only: join a voice channel, play the hold announcement, mute non-Ownership, and auto-mute anyone who joins while held.',
  async execute(message) {
    requireOwnership(message);
    const result = await holdVoiceChat(message, message.client.config);

    await logVcAction(message.client, message.client.config, {
      tag: 'HoldVC',
      action: 'HOLD',
      received: '-holdvc',
      actor: message.author,
      voiceChannel: result.voiceChannel,
      context: `muted ${result.mutedNow}; Ownership skipped; “${HOLD_VC_PHRASE}”`,
    });

    await message.reply(v2Card({
      title: 'Hold VC',
      description: [
        `Joined ${result.voiceChannel} and played for everyone:`,
        `“${HOLD_VC_PHRASE}”`,
        `Server-muted **${result.mutedNow}** member${result.mutedNow === 1 ? '' : 's'} (Ownership skipped).`,
        'Anyone who joins this channel while it is on hold is server-muted; leaving unmutes them.',
        'Use `-unholdvc` to unmute everyone and make the bot leave.',
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
      tag: 'HoldVC',
      action: 'UNHOLD',
      received: '-unholdvc',
      actor: message.author,
      voiceChannel: result.voiceChannel,
      context: `unmuted ${result.unmuted}`,
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
