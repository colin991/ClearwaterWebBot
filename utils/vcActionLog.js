import { EmbedBuilder } from 'discord.js';
import { logger } from './logger.js';

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
export async function logVcAction(client, config, {
  title,
  actor,
  voiceChannel = null,
  details = [],
  color = 0x4f8ff7,
} = {}) {
  const channelId = String(
    config?.vcActionLogChannelId
    || process.env.VC_ACTION_LOG_CHANNEL_ID
    || '1538021552120135731',
  ).trim();
  const channel = await fetchLogChannel(client, channelId);
  if (!channel) return false;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title || 'VC action')
    .addFields(
      {
        name: 'Who',
        value: actor
          ? `<@${actor.id}> (\`${actor.id}\` · ${actor.tag || 'unknown'})`
          : 'Unknown',
        inline: false,
      },
    )
    .setTimestamp(new Date());

  if (voiceChannel) {
    embed.addFields({
      name: 'Voice channel',
      value: `${voiceChannel} (\`${voiceChannel.id}\`)`,
      inline: false,
    });
  }

  for (const detail of details) {
    if (!detail?.name || !detail?.value) continue;
    embed.addFields({
      name: String(detail.name).slice(0, 256),
      value: String(detail.value).slice(0, 1024),
      inline: Boolean(detail.inline),
    });
  }

  await channel.send({ embeds: [embed] }).catch((error) => {
    logger.error('Failed to post VC action log', error);
  });
  return true;
}
