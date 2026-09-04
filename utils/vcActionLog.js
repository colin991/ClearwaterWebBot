import { logger } from './logger.js';
import { v2Card } from './v2Message.js';

/** Hardcoded so a stale host `.env` cannot keep sending hold/say logs to an old channel. */
export const VC_ACTION_LOG_CHANNEL_ID = '1514547037537046688';

async function fetchLogChannel(client, channelId) {
  const id = String(channelId || '').trim();
  if (!id || !client?.isReady?.()) return null;
  const channel = await client.channels.fetch(id).catch((error) => {
    logger.error(`VC action log channel fetch failed (${id})`, error);
    return null;
  });
  if (!channel?.isTextBased?.()) {
    logger.error(`VC action log channel is not text-based (${id})`);
    return null;
  }
  return channel;
}

/**
 * Post an Ownership VC action (say / hold / etc.) to the configured log channel.
 */
export async function logVcAction(client, _config, {
  title,
  actor,
  voiceChannel = null,
  details = [],
} = {}) {
  const channel = await fetchLogChannel(client, VC_ACTION_LOG_CHANNEL_ID);
  if (!channel) return false;

  const fields = [
    {
      name: 'Who',
      value: actor
        ? `<@${actor.id}> (\`${actor.id}\` · ${actor.tag || 'unknown'})`
        : 'Unknown',
    },
  ];

  if (voiceChannel) {
    fields.push({
      name: 'Voice channel',
      value: `${voiceChannel} (\`${voiceChannel.id}\`)`,
    });
  }

  for (const detail of details) {
    if (!detail?.name || !detail?.value) continue;
    fields.push({
      name: String(detail.name).slice(0, 256),
      value: String(detail.value).slice(0, 1024),
    });
  }

  await channel.send(v2Card({
    title: title || 'VC action',
    fields,
  })).catch((error) => {
    logger.error('Failed to post VC action log', error);
  });
  return true;
}
