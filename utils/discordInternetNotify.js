const lastNotifyAt = new Map();
const MIN_GAP_MS = 8_000;

function notificationLine(type, actorName) {
  const who = actorName || 'Someone';
  switch (type) {
    case 'like':
      return `${who} liked your post on Clearwater Internet.`;
    case 'reply':
      return `${who} replied to you on Clearwater Internet.`;
    case 'repost':
      return `${who} reposted you on Clearwater Internet.`;
    case 'quote':
      return `${who} quoted you on Clearwater Internet.`;
    case 'mention':
      return `${who} mentioned you on Clearwater Internet.`;
    case 'follow':
      return `${who} followed you on Clearwater Internet.`;
    case 'message':
      return `${who} sent you a message on Clearwater Internet.`;
    default:
      return `${who} sent you a notification on Clearwater Internet.`;
  }
}

export function createDiscordInternetNotifier(client, { websiteUrl = 'https://cwrpvc.lol' } = {}) {
  const site = String(websiteUrl || 'https://cwrpvc.lol').replace(/\/$/, '');
  const notificationsUrl = `${site}/internet/notifications`;

  return async function notifyInternetDiscordDm({ recipientId, actorName, type, postContent = '' }) {
    const discordId = String(recipientId || '');
    if (!/^\d{16,22}$/.test(discordId) || !client?.isReady?.()) return;

    const now = Date.now();
    const previous = lastNotifyAt.get(discordId) || 0;
    if (now - previous < MIN_GAP_MS) return;
    lastNotifyAt.set(discordId, now);

    const snippet = String(postContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const lines = [
      notificationLine(type, actorName),
      snippet ? `“${snippet}${String(postContent || '').trim().length > 120 ? '…' : ''}”` : '',
      notificationsUrl,
    ].filter(Boolean);

    try {
      const user = await client.users.fetch(discordId);
      await user.send({ content: lines.join('\n') });
    } catch {
      // User may have DMs closed or the bot blocked — ignore quietly.
    }
  };
}
