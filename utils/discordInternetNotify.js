import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';

export const DISCORD_INTERNET_UNSUB_CUSTOM_ID = 'cw-internet-unsub-dm';

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

function viewNotificationUrl(site, { type, postId }) {
  if (postId) return `${site}/internet/post/${encodeURIComponent(postId)}`;
  if (type === 'message') return `${site}/internet/messages`;
  return `${site}/internet/notifications`;
}

export function createDiscordInternetNotifier(client, { websiteUrl = 'https://cwrpvc.lol' } = {}) {
  const site = String(websiteUrl || 'https://cwrpvc.lol').replace(/\/$/, '');

  return async function notifyInternetDiscordDm({
    recipientId,
    actorName,
    type,
    postContent = '',
    postId = null,
  }) {
    const discordId = String(recipientId || '');
    if (!/^\d{16,22}$/.test(discordId) || !client?.isReady?.()) return;

    const now = Date.now();
    const previous = lastNotifyAt.get(discordId) || 0;
    if (now - previous < MIN_GAP_MS) return;
    lastNotifyAt.set(discordId, now);

    const snippet = String(postContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const text = [
      notificationLine(type, actorName),
      snippet ? `“${snippet}${String(postContent || '').trim().length > 120 ? '…' : ''}”` : '',
    ].filter(Boolean).join('\n').slice(0, 4000);

    const viewUrl = viewNotificationUrl(site, { type, postId });
    const container = new ContainerBuilder()
      .clearAccentColor()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('View notification')
            .setStyle(ButtonStyle.Link)
            .setURL(viewUrl),
          new ButtonBuilder()
            .setCustomId(DISCORD_INTERNET_UNSUB_CUSTOM_ID)
            .setLabel('Unsubscribe')
            .setStyle(ButtonStyle.Secondary),
        ),
      );

    try {
      const user = await client.users.fetch(discordId);
      await user.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {
      // User may have DMs closed or the bot blocked — ignore quietly.
    }
  };
}
