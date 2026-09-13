import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { melonlyFetch } from './melonly.js';
import { logger } from './logger.js';
import { PINELLAS_SHIFT_REPORT_CHANNELS } from './pinellasShiftPanel.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-melonly-reports.json');
const POLL_MS = 60_000;
const PAGE_SIZE = 100;
const MAX_SEEN = 2_000;

const reportTypeAliases = [
  ['ois', ['ois', 'officer involved shooting', 'officer-involved shooting', 'shooting']],
  ['mva', ['mva', 'motor vehicle accident', 'motor vehicle collision', 'traffic collision', 'crash', 'collision']],
  ['arrest', ['arrest']],
  ['citation', ['citation', 'ticket']],
  ['warrant', ['warrant']],
];

let timer = null;
let inFlight = null;

async function readStore() {
  try {
    const value = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return {
      seen: Array.isArray(value?.seen) ? value.seen.map(String).slice(-MAX_SEEN) : [],
      initialized: value?.initialized === true,
    };
  } catch {
    return { seen: [], initialized: false };
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify({ initialized: store.initialized === true, seen: store.seen.slice(-MAX_SEEN) }, null, 2)}\n`, 'utf8');
}

function parseObject(value) {
  if (!value || typeof value !== 'string') return value && typeof value === 'object' ? value : null;
  try { return JSON.parse(value); } catch { return null; }
}

function recordText(record) {
  return [record?.label, record?.agency, record?.type, record?.templateId, record?.data, record?.meta, record?.objects]
    .map((value) => typeof value === 'string' ? value : JSON.stringify(value || ''))
    .join(' ')
    .toLowerCase();
}

function reportTypeFor(record) {
  const text = recordText(record);
  return reportTypeAliases.find(([, aliases]) => aliases.some((alias) => text.includes(alias)))?.[0] || null;
}

function isPinellasRecord(record) {
  const text = recordText(record);
  return /pinellas|pcso|sheriff/.test(text);
}

function flatten(value, prefix = '', output = []) {
  if (value == null || value === '') return output;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flatten(entry, `${prefix}[${index + 1}]`, output));
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) flatten(entry, prefix ? `${prefix} / ${key}` : key, output);
    return output;
  }
  output.push([prefix || 'Details', String(value)]);
  return output;
}

function recordFields(record) {
  const sources = [record?.previewData, record?.data, record?.objects, record?.meta]
    .map(parseObject)
    .filter(Boolean);
  const fields = sources.flatMap((source) => flatten(source));
  if (!fields.length && record?.data) fields.push(['Details', String(record.data)]);
  return fields.slice(0, 25);
}

function safe(value, max = 1024) {
  const text = String(value ?? 'N/A').replace(/[<>`]/g, '').trim() || 'N/A';
  return text.length > max ? `${text.slice(0, max - 1)}â€¦` : text;
}

const PCSO_REPORT_BANNER_URL = 'https://media.discordapp.net/attachments/1546222659824787596/1548460178737995816/pcso_banner_2.png?format=webp&quality=lossless&width=1536&height=478';
const PCSO_REPORT_FOOTER_URL = 'https://cdn.discordapp.com/attachments/1514443793607295058/1546271578147524618/pcso-application-footer.png';

function displayFieldName(value) {
  return String(value || 'Details')
    .replace(/^\[\d+\]\s*\/\s*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s*\/\s*/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildReportPayload(record, type) {
  const creator = record.createdByUserId ? `Melonly user ${record.createdByUserId}` : 'Melonly';
  const fields = recordFields(record);
  const details = fields.length
    ? fields.map(([name, value]) => `**${displayFieldName(name)}:** ${safe(value, 700)}`).join('\n')
    : 'No report details were supplied by Melonly.';
  const text = `# <:info:1517217516706074634> PCSO ${type.toUpperCase()} Report\n\n> **Case ID:** ${safe(record.id, 80)}\n> **Report:** ${safe(record.label || type, 180)}\n> **Submitted by:** ${creator}\n\n${details}\n\n-# Automatically imported from Melonly CAD`;
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PCSO_REPORT_BANNER_URL)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.slice(0, 3900)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PCSO_REPORT_FOOTER_URL)));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export async function fetchMelonlyCadRecords(apiKey) {
  const result = await melonlyFetch(apiKey, '/server/cad/records', {
    query: { page: 1, pageSize: PAGE_SIZE, limit: PAGE_SIZE, orderBy: 'createdAt', sort: 'desc' },
    cacheTtlMs: 0,
  });
  return Array.isArray(result?.data) ? result.data : [];
}

async function importRecord(client, record, type) {
  const channelId = PINELLAS_SHIFT_REPORT_CHANNELS[type];
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`Report channel ${channelId} is unavailable.`);
  await channel.send(buildReportPayload(record, type));
}

export async function syncPinellasMelonlyReports(client) {
  if (!config.melonlyApiKey) return { imported: 0, skipped: 0 };
  const store = await readStore();
  const seen = new Set(store.seen);
  const records = await fetchMelonlyCadRecords(config.melonlyApiKey);
  if (!store.initialized) {
    store.initialized = true;
    store.seen = records.map((record) => String(record?.id || '').trim()).filter(Boolean).slice(-MAX_SEEN);
    await writeStore(store);
    logger.info(`Melonly CAD report sync initialized with ${store.seen.length} existing record(s).`);
    return { imported: 0, skipped: records.length };
  }
  let imported = 0;
  let skipped = 0;
  for (const record of records.reverse()) {
    const id = String(record?.id || '').trim();
    const type = reportTypeFor(record);
    if (!id || seen.has(id) || !type || !isPinellasRecord(record)) {
      skipped += 1;
      continue;
    }
    try {
      await importRecord(client, record, type);
      seen.add(id);
      imported += 1;
    } catch (error) {
      logger.error(`Could not import Melonly CAD record ${id}`, error);
    }
  }
  store.seen = [...seen].slice(-MAX_SEEN);
  await writeStore(store);
  if (imported) logger.info(`Imported ${imported} new Pinellas CAD report(s) from Melonly.`);
  return { imported, skipped };
}

export function startPinellasMelonlyReports(client) {
  if (timer) return () => {};
  const tick = () => {
    if (inFlight) return;
    inFlight = syncPinellasMelonlyReports(client)
      .catch((error) => logger.warn(`Melonly CAD report sync failed: ${error?.message || error}`))
      .finally(() => { inFlight = null; });
  };
  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  setTimeout(tick, 10_000).unref?.();
  logger.info(`Pinellas Melonly CAD report sync armed (every ${POLL_MS / 1000}s).`);
  return () => { clearInterval(timer); timer = null; };
}
