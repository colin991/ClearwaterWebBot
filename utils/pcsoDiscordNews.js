import { addPcsoNewsItem, deletePcsoNewsByDiscordMessage, updatePcsoNewsImageUrls } from './pcsoSiteContent.js';
import { logger } from './logger.js';

export const PCSO_NEWS_IMAGE_CHANNEL_ID = '1515824931252994089';
export const PCSO_PRESS_RELEASE_TITLE = 'Press Release';
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 60 * 1000;
const REFRESH_RETRY_MS = 5 * 60 * 1000;
let lastRefreshAttempt = 0;

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
  await addPcsoNewsItem({
    title: PCSO_PRESS_RELEASE_TITLE,
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

/** Discord attachment links are signed and stop loading once their `ex` time passes. */
export function discordAttachmentNeedsRefresh(url, now = Date.now()) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    return false;
  }
  if (!/^(cdn\.discordapp\.com|media\.discordapp\.net)$/i.test(parsed.hostname)) return false;
  if (!parsed.pathname.startsWith('/attachments/')) return false;
  const expires = Number.parseInt(parsed.searchParams.get('ex') || '', 16) * 1000;
  return !Number.isFinite(expires) || expires - now < REFRESH_BEFORE_EXPIRY_MS;
}

/**
 * Swap expired Discord image links on PCSO news for freshly signed ones so
 * website cards keep showing the photo. Failures leave the content unchanged.
 */
export async function refreshPcsoNewsImages(client, content, { now = Date.now } = {}) {
  const stale = [...new Set((content?.news || [])
    .map((item) => item.imageUrl)
    .filter((url) => discordAttachmentNeedsRefresh(url, now())))];
  if (!stale.length || !client?.rest?.post) return content;
  if (now() - lastRefreshAttempt < REFRESH_RETRY_MS) return content;
  lastRefreshAttempt = now();
  try {
    const result = await client.rest.post('/attachments/refresh-urls', {
      body: { attachment_urls: stale.slice(0, 50) },
    });
    const replacements = new Map((result?.refreshed_urls || [])
      .filter((entry) => entry?.original && entry?.refreshed)
      .map((entry) => [entry.original, entry.refreshed]));
    if (!replacements.size) return content;
    lastRefreshAttempt = 0;
    return await updatePcsoNewsImageUrls(replacements);
  } catch (error) {
    logger.warn('Could not refresh PCSO news image links', error);
    return content;
  }
}

export function resetPcsoNewsImageRefreshForTests() {
  lastRefreshAttempt = 0;
}
