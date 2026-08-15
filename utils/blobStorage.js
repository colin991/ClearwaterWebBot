import { del } from '@vercel/blob';
import { logger } from './logger.js';

const BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/i;

export function isVercelBlobUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && BLOB_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

export function blobUrlsFromValues(...values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(isVercelBlobUrl))];
}

/**
 * Best-effort delete for Vercel Blob URLs. No-ops when the token is missing
 * or the URL is not a Blob object we manage.
 */
export async function deleteVercelBlobUrls(urls = []) {
  const targets = blobUrlsFromValues(...(Array.isArray(urls) ? urls : [urls]));
  if (!targets.length) return { deleted: 0, skipped: true };
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    logger.warn('Skipping Blob logo cleanup — BLOB_READ_WRITE_TOKEN is not set.');
    return { deleted: 0, skipped: true };
  }
  try {
    await del(targets);
    return { deleted: targets.length, skipped: false };
  } catch (error) {
    logger.warn(`Could not delete ${targets.length} Blob object(s)`, error);
    return { deleted: 0, skipped: false, error: String(error?.message || error || 'delete failed') };
  }
}
