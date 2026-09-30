import { addPcsoNewsItem, deletePcsoNewsByDiscordMessage } from './pcsoSiteContent.js';

export const PCSO_NEWS_IMAGE_CHANNEL_ID = '1515824931252994089';
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

function firstImage(message) {
  return [...(message.attachments?.values?.() || [])].find((attachment) => (
    String(attachment.contentType || '').startsWith('image/')
    || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(attachment.url || ''))
  ));
}

export async function syncPcsoNewsImageMessage(message) {
  if (String(message?.channelId || '') !== PCSO_NEWS_IMAGE_CHANNEL_ID) return false;
  const image = firstImage(message);
  if (!image?.url) return false;
  const content = String(message.content || '').trim();
  const firstLine = content.split(/\r?\n/).find(Boolean) || '';
  await addPcsoNewsItem({
    title: firstLine.slice(0, 160) || 'PCSO Photo Update',
    summary: content.slice(0, 400) || `Photo shared by ${message.member?.displayName || message.author?.username || 'PCSO'}.`,
    imageUrl: image.url,
    linkUrl: message.url || '',
    publishedAt: new Date(message.createdTimestamp || Date.now()).toISOString(),
    expiresAt: new Date((message.createdTimestamp || Date.now()) + FOUR_DAYS_MS).toISOString(),
    discordMessageId: String(message.id || ''),
  });
  return true;
}

export async function removePcsoNewsImageMessage(message) {
  if (String(message?.channelId || '') !== PCSO_NEWS_IMAGE_CHANNEL_ID) return false;
  const result = await deletePcsoNewsByDiscordMessage(message.id);
  return result.removed;
}
