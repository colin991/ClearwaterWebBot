import { logger } from './logger.js';

export const DISPATCH_ACTIVITY_LOG_CHANNEL_ID = '1514547037537046688';
const LISTENER_TTL_MS = 30_000;
const listeners = new Map();
const talkers = new Map();

function actorLabel(actor = {}) {
  const name = String(actor.displayName || actor.username || 'Unknown admin').slice(0, 80);
  const id = String(actor.id || '').trim();
  return id ? `**${name}** (<@${id}>)` : `**${name}**`;
}

async function sendActivity(client, content) {
  const channel = await client?.channels?.fetch(DISPATCH_ACTIVITY_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel.send({ content, allowedMentions: { parse: [] } }).catch((error) => {
    logger.warn(`Dispatch activity log failed: ${error?.message || error}`);
  });
}

export function noteWebListener(client, actor) {
  const id = String(actor?.id || '').trim();
  if (!id) return;
  const now = Date.now();
  if (now - (listeners.get(id) || 0) < LISTENER_TTL_MS) {
    listeners.set(id, now);
    return;
  }
  listeners.set(id, now);
  void sendActivity(client, `🎧 Dispatch radio listener started: ${actorLabel(actor)}`);
}

export function noteWebTalk(client, actor, action = 'audio') {
  const id = String(actor?.id || '').trim();
  if (!id) return;
  const now = Date.now();
  if (action === 'stop') {
    if (talkers.delete(id)) void sendActivity(client, `🎙️ Dispatch radio talk ended: ${actorLabel(actor)}`);
    return;
  }
  if (!talkers.has(id)) {
    void sendActivity(client, `🎙️ Dispatch radio talk started: ${actorLabel(actor)}`);
  }
  talkers.set(id, now);
}
