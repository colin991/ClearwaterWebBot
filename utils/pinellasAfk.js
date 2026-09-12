import { logger } from './logger.js';

export const PINELLAS_AFK_CHANNEL_ID = '1548356647347429404';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MOVEMENT_THRESHOLD = 5;
const states = new Map();

function positionForDeputy(deputy) {
  const position = deputy?.erlcPosition;
  const x = Number(position?.x);
  const z = Number(position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function moved(previous, current) {
  if (!previous) return false;
  return Math.hypot(current.x - previous.x, current.z - previous.z) >= MOVEMENT_THRESHOLD;
}

async function deleteMessage(channel, messageId) {
  if (!messageId) return;
  await channel.messages.delete(messageId).catch((error) => {
    if (error?.code !== 10008) logger.warn(`Pinellas AFK message cleanup failed: ${error?.message || error}`);
  });
}

async function clearState(channel, state) {
  await Promise.all([
    deleteMessage(channel, state.warningMessageId),
    deleteMessage(channel, state.escalationMessageId),
  ]);
}

async function sendWarning(channel, discordId, minutes, name) {
  const label = name ? ` (${name})` : '';
  const content = minutes === 10
    ? `⚠️ <@${discordId}>${label} has been stationary in ER:LC for more than **10 minutes** while on shift.`
    : `🚨 <@${discordId}>${label} has been stationary in ER:LC for more than **15 minutes** while on shift.`;
  return channel.send({ content, allowedMentions: { users: [discordId] } });
}

export async function syncPinellasAfkWarnings(client, snapshot) {
  const deputies = Array.isArray(snapshot?.deputies) ? snapshot.deputies : [];
  const channel = client.channels.cache.get(PINELLAS_AFK_CHANNEL_ID)
    || await client.channels.fetch(PINELLAS_AFK_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Pinellas AFK check skipped: channel ${PINELLAS_AFK_CHANNEL_ID} is unavailable.`);
    return;
  }

  const seen = new Set();
  const now = Date.now();
  for (const deputy of deputies) {
    const discordId = String(deputy?.discordId || '');
    const position = positionForDeputy(deputy);
    if (!discordId || !position) continue;
    seen.add(discordId);

    let state = states.get(discordId);
    if (!state) {
      state = { lastPosition: position, afkSince: now, warningMessageId: null, escalationMessageId: null };
      states.set(discordId, state);
      continue;
    }

    if (moved(state.lastPosition, position)) {
      await clearState(channel, state);
      state.lastPosition = position;
      state.afkSince = now;
      state.warningMessageId = null;
      state.escalationMessageId = null;
      continue;
    }

    const inactiveFor = now - state.afkSince;
    if (inactiveFor >= TEN_MINUTES_MS && !state.warningMessageId) {
      const message = await sendWarning(channel, discordId, 10, deputy.roleplayName || deputy.callsign).catch((error) => {
        logger.warn(`Pinellas 10-minute AFK warning failed: ${error?.message || error}`);
        return null;
      });
      state.warningMessageId = message?.id || null;
    }
    if (inactiveFor >= FIFTEEN_MINUTES_MS && !state.escalationMessageId) {
      const message = await sendWarning(channel, discordId, 15, deputy.roleplayName || deputy.callsign).catch((error) => {
        logger.warn(`Pinellas 15-minute AFK warning failed: ${error?.message || error}`);
        return null;
      });
      state.escalationMessageId = message?.id || null;
    }
  }

  for (const [discordId, state] of states) {
    if (seen.has(discordId)) continue;
    await clearState(channel, state);
    states.delete(discordId);
  }
}
