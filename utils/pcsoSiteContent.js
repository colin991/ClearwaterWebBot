import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-site-content.json');

export const EMPTY_PCSO_SITE_CONTENT = Object.freeze({
  news: [],
  events: [],
  updatedAt: null,
});

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

export function normalizePcsoSiteContent(input = {}) {
  const news = Array.isArray(input.news) ? input.news : [];
  const events = Array.isArray(input.events) ? input.events : [];
  return {
    news: news.map((item) => ({
      id: cleanText(item?.id, 64) || newId('news'),
      title: cleanText(item?.title, 160) || 'Untitled news',
      summary: cleanText(item?.summary || item?.excerpt, 400),
      body: cleanText(item?.body, 4000),
      imageUrl: cleanText(item?.imageUrl, 500),
      linkUrl: cleanText(item?.linkUrl, 500),
      publishedAt: cleanText(item?.publishedAt, 40) || new Date().toISOString(),
    })).slice(0, 100),
    events: events.map((item) => ({
      id: cleanText(item?.id, 64) || newId('event'),
      title: cleanText(item?.title, 160) || 'Untitled event',
      whenLabel: cleanText(item?.whenLabel, 160),
      startsAt: cleanText(item?.startsAt, 40),
      endsAt: cleanText(item?.endsAt, 40),
      location: cleanText(item?.location, 240),
      description: cleanText(item?.description, 1000),
    })).slice(0, 100),
    updatedAt: cleanText(input.updatedAt, 40) || null,
  };
}

export async function getPcsoSiteContent() {
  const stored = await readJsonFile(STORE_PATH, EMPTY_PCSO_SITE_CONTENT);
  return normalizePcsoSiteContent(stored);
}

export async function savePcsoSiteContent(input) {
  const next = normalizePcsoSiteContent({
    ...input,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(STORE_PATH, next);
  return next;
}

export async function addPcsoNewsItem(item) {
  const content = await getPcsoSiteContent();
  const entry = normalizePcsoSiteContent({
    news: [{ ...item, id: newId('news') }],
    events: [],
  }).news[0];
  content.news = [entry, ...content.news].slice(0, 100);
  return savePcsoSiteContent(content);
}

export async function addPcsoEventItem(item) {
  const content = await getPcsoSiteContent();
  const entry = normalizePcsoSiteContent({
    news: [],
    events: [{ ...item, id: newId('event') }],
  }).events[0];
  content.events = [entry, ...content.events].slice(0, 100);
  return savePcsoSiteContent(content);
}

export async function deletePcsoContentItem(kind, id) {
  const content = await getPcsoSiteContent();
  const key = kind === 'event' ? 'events' : 'news';
  content[key] = content[key].filter((item) => item.id !== String(id));
  return savePcsoSiteContent(content);
}
