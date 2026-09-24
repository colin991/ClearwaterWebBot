import { logger } from './logger.js';

/** Hardcoded so a stale host `.env` cannot keep sending hold/say logs to an old channel. */
export const VC_ACTION_LOG_CHANNEL_ID = '1514547037537046688';

/**
 * Discord `css` code fences color a leading `[Tag]` teal — same look as ProximityVC ops logs.
 * @param {string} tag
 * @param {string} body
 */
export function proximityStyleContent(tag, body) {
  const cleanTag = String(tag || 'Clearwater').replace(/[\[\]]/g, '');
  const cleanBody = String(body || '').replace(/```/g, '`\u200b``');
  return `\`\`\`css\n[${cleanTag}] ${cleanBody}\n\`\`\``;
}

function actorLabel(actor) {
  if (!actor) return 'unknown (0)';
  const name = actor.username || actor.tag?.split('#')[0] || actor.displayName || 'unknown';
  return `${name} (${actor.id})`;
}

function channelLabel(voiceChannel) {
  if (!voiceChannel) return '#unknown';
  const name = voiceChannel.name || 'unknown';
  return `#${name}`;
}

export function enforcementLogBody({ action, player, reason = '', message = '' } = {}) {
  const name = String(player?.username || 'unknown').replace(/\s+/g, ' ').trim() || 'unknown';
  const id = String(player?.robloxId || 'unknown').replace(/\s+/g, ' ').trim() || 'unknown';
  const extra = [reason, message].map((part) => String(part || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const suffix = extra.length ? ` · ${extra.join(' · ')}` : '';
  return `${String(action || 'ACTION').toUpperCase()} — ${name} (${id})${suffix}`;
}

async function fetchLogChannel(client, channelId) {
  const id = String(channelId || '').trim();
  if (!id || !client) return null;
  if (typeof client.isReady === 'function' && client.isReady() === false && !client.user) return null;
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
 * Post a single ProximityVC-style line to a log channel.
 */
export async function postProximityLog(client, {
  channelId = VC_ACTION_LOG_CHANNEL_ID,
  tag = 'Clearwater',
  body,
} = {}) {
  const channel = await fetchLogChannel(client, channelId);
  if (!channel || !body) return false;
  await channel.send({ content: proximityStyleContent(tag, body) }).catch((error) => {
    logger.error('Failed to post proximity-style VC log', error);
  });
  return true;
}

/**
 * Post an Ownership VC action (say / hold / etc.) in ProximityVC-style ops logs.
 *
 * Preferred shape:
 *   action: 'HOLD' | 'UNHOLD' | 'SAY' | 'MOVE'
 *   received: optional command string → also posts a "Received" line first
 *
 * Legacy title/details still work and are folded into the context suffix.
 */
export async function logVcAction(client, _config, {
  tag = 'HoldVC',
  action = null,
  title = null,
  actor = null,
  voiceChannel = null,
  context = '',
  received = null,
  details = [],
} = {}) {
  const channel = await fetchLogChannel(client, VC_ACTION_LOG_CHANNEL_ID);
  if (!channel) return false;

  const detailParts = details
    .filter((detail) => detail?.name && detail?.value)
    .map((detail) => `${detail.name}=${String(detail.value).replace(/\s+/g, ' ').trim()}`);
  const contextParts = [context, ...detailParts].filter(Boolean);
  const contextText = contextParts.length ? ` (${contextParts.join('; ')})` : '';

  const resolvedAction = String(
    action
    || (title && /unhold/i.test(title) ? 'UNHOLD'
      : title && /hold/i.test(title) ? 'HOLD'
        : title && /say/i.test(title) ? 'SAY'
          : title && /move/i.test(title) ? 'MOVE'
            : 'ACTION'),
  ).toUpperCase();

  const lines = [];
  if (received) {
    lines.push(`${actorLabel(actor)}: Received \`${received}\``);
  }
  lines.push(
    `${resolvedAction} — ${actorLabel(actor)} -> ${channelLabel(voiceChannel)}${contextText}`,
  );

  try {
    for (const line of lines) {
      await channel.send({ content: proximityStyleContent(tag, line) });
    }
    return true;
  } catch (error) {
    logger.error('Failed to post VC action log', error);
    return false;
  }
}
