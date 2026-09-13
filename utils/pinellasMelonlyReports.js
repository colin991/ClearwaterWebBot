import {
  AttachmentBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import PDFDocument from 'pdfkit';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { melonlyFetch } from './melonly.js';
import { logger } from './logger.js';
import {
  PINELLAS_SHIFT_REPORT_CHANNELS,
  resolvePinellasMelonlyMemberDiscordId,
} from './pinellasShiftPanel.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-melonly-reports.json');
const PCSO_STAR_LOGO_PATH = path.join(ROOT, 'assets', 'pcso-sheriff-star.png');
const POLL_MS = 60_000;
const PAGE_SIZE = 100;
const MAX_SEEN = 2_000;

const REPORT_DOC = Object.freeze({
  titleBlue: '#5b6470',
  barDark: '#4a4a4a',
  barOlive: '#b0b5bc',
  barSubject: '#3d3d3d',
  rowAlt: '#f3f4f6',
  border: '#c5c9d0',
  label: '#1f2937',
  value: '#111827',
  muted: '#6b7280',
});

const REPORT_TYPE_TITLES = Object.freeze({
  ois: 'OIS Report',
  mva: 'MVA Report',
  arrest: 'Arrest Report',
  citation: 'Citation Report',
  warrant: 'Warrant Arrest Log',
});

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

function objectKey(value, ...names) {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(value);
  for (const name of names) {
    const match = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (match) return match[0];
  }
  return null;
}

function objectValue(value, ...names) {
  const key = objectKey(value, ...names);
  return key == null ? undefined : value[key];
}

function humanizeLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMelonlyFieldObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = new Set(Object.keys(value).map((key) => key.toLowerCase()));
  const hasAnswer = keys.has('value');
  const hasLabel = keys.has('name') || keys.has('mappingid') || keys.has('mapping_id');
  return hasAnswer && hasLabel;
}

function melonlyFieldLabel(value) {
  return humanizeLabel(
    objectValue(value, 'name')
    ?? objectValue(value, 'mappingId', 'mapping_id')
    ?? 'Details',
  );
}

function isChargeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = new Set(Object.keys(value).map((key) => key.toLowerCase()));
  return keys.has('code')
    || keys.has('charge')
    || ((keys.has('class') || keys.has('act')) && (keys.has('counts') || keys.has('count') || keys.has('fine') || keys.has('jail')));
}

function formatCharge(charge, index) {
  const code = objectValue(charge, 'code', 'charge');
  const cls = objectValue(charge, 'class', 'act');
  const counts = objectValue(charge, 'counts', 'count');
  const fine = objectValue(charge, 'fine');
  const jail = objectValue(charge, 'jail');
  const parts = [
    code != null && code !== '' ? String(code) : null,
    cls != null && cls !== '' ? String(cls) : null,
    counts != null && counts !== '' ? `${counts} count${Number(counts) === 1 ? '' : 's'}` : null,
    fine != null && fine !== '' && Number(fine) !== 0 ? `Fine $${fine}` : null,
    jail != null && jail !== '' && Number(jail) !== 0 ? `Jail ${jail}` : null,
  ].filter(Boolean);
  return `${index}. ${parts.join(' · ') || 'Charge'}`;
}

function looksLikeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  // Melonly often stores DOB / dates as unix ms.
  return numeric > 1e11 && numeric < 4e12;
}

function formatTimestamp(value) {
  const numeric = Number(value);
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatScalar(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (looksLikeTimestamp(value)) return formatTimestamp(value);
  return String(value);
}

function flatten(value, prefix = '', output = []) {
  if (value == null || value === '') return output;
  if (Array.isArray(value)) {
    if (value.length && value.every(isChargeObject)) {
      output.push([prefix || 'Charges', value.map((entry, index) => formatCharge(entry, index + 1)).join('\n')]);
      return output;
    }
    value.forEach((entry, index) => flatten(entry, `${prefix}[${index + 1}]`, output));
    return output;
  }
  if (typeof value === 'object') {
    // Melonly form answers are objects with presentation metadata plus the
    // actual answer. Keep the readable field name and answer only.
    if (isMelonlyFieldObject(value)) {
      const label = melonlyFieldLabel(value);
      const answer = objectValue(value, 'value');
      if (label) flatten(answer, label, output);
      return output;
    }
    if (isChargeObject(value)) {
      output.push([prefix || 'Charge', formatCharge(value, 1).replace(/^1\.\s*/, '')]);
      return output;
    }
    for (const [key, entry] of Object.entries(value)) flatten(entry, prefix ? `${prefix} / ${key}` : key, output);
    return output;
  }
  output.push([prefix || 'Details', formatScalar(value)]);
  return output;
}

/** @param {object} record Melonly CAD record */
export function recordFields(record) {
  const sources = [record?.previewData, record?.data, record?.objects, record?.meta]
    .map(parseObject)
    .filter(Boolean);
  // Prefer the first source that yields fields so previewData + data don't duplicate.
  for (const source of sources) {
    const fields = flatten(source);
    if (fields.length) return fields.slice(0, 40);
  }
  if (record?.data) return [['Details', String(record.data)]];
  return [];
}

function safe(value, max = 1024) {
  const text = String(value ?? 'N/A').replace(/[<>`]/g, '').trim() || 'N/A';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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

function recordCreatorId(record) {
  return String(
    record?.createdByUserId
    || record?.createdBy
    || record?.authorId
    || record?.userId
    || record?.memberId
    || '',
  ).trim();
}

/** Resolve Melonly CAD creator → Discord mention text + snowflake (when linked). */
export async function resolveReportSubmitter(apiKey, record) {
  const melonlyId = recordCreatorId(record);
  if (!melonlyId) {
    return { label: 'Melonly', discordId: null };
  }
  if (!apiKey) {
    return { label: `Melonly user ${melonlyId}`, discordId: null };
  }
  try {
    const discordId = await resolvePinellasMelonlyMemberDiscordId(apiKey, melonlyId);
    if (discordId) {
      return { label: `<@${discordId}>`, discordId };
    }
  } catch (error) {
    logger.warn(`Could not resolve Melonly reporter ${melonlyId} to Discord: ${error?.message || error}`);
  }
  return { label: `Melonly user ${melonlyId}`, discordId: null };
}

function reportTitle(type, record) {
  return REPORT_TYPE_TITLES[type] || record?.label || `${String(type || 'CAD').toUpperCase()} Report`;
}

async function loadStarLogo() {
  try {
    return await readFile(PCSO_STAR_LOGO_PATH);
  } catch {
    return null;
  }
}

/** Build the official-record PDF attached to Melonly CAD imports. */
export async function buildMelonlyReportPdf(record, type, submitterLabel = 'Melonly') {
  const title = reportTitle(type, record);
  const fields = recordFields(record);
  const caseId = String(record?.id || 'N/A');
  const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const submitterPlain = String(submitterLabel || 'Melonly').replace(/<@!?(\d+)>/g, 'Discord:$1');
  const logoPng = await loadStarLogo();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, left: 36, right: 36, bottom: 36 },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const left = 36;
    const contentW = pageW - 72;
    let y = 36;

    if (logoPng) {
      try {
        doc.image(logoPng, left, y, { width: 52, height: 52 });
      } catch {
        // continue without logo
      }
    }

    const textLeft = logoPng ? left + 64 : left;
    doc.fillColor(REPORT_DOC.titleBlue).font('Helvetica-Bold').fontSize(16)
      .text("PINELLAS COUNTY SHERIFF'S OFFICE", textLeft, y + 4, { width: contentW - 70 });
    doc.fillColor('#111827').fontSize(12)
      .text(`${title} — Official Record`, textLeft, y + 26, { width: contentW - 70 });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
      .text('CLEARWATER ROLEPLAY', left, y + 8, { width: contentW, align: 'right' });
    doc.fillColor(REPORT_DOC.muted).font('Helvetica').fontSize(7)
      .text('ONE COUNTY • ONE STANDARD', left, y + 22, { width: contentW, align: 'right' });

    y = 100;
    doc.rect(0, y, pageW, 22).fill(REPORT_DOC.barDark);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('Search Results', left, y + 6);
    doc.font('Helvetica').fontSize(7).text(`Case ${caseId}`.slice(0, 95), left, y + 7, { width: contentW, align: 'right' });

    y += 22;
    doc.rect(0, y, pageW, 22).fill(REPORT_DOC.barOlive);
    doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(8)
      .text(`Official ${title} imported from Melonly CAD.`, left, y + 7);
    doc.fillColor('#374151').font('Helvetica').fontSize(7).text(generatedAt, left, y + 7, { width: contentW, align: 'right' });

    y += 22;
    doc.rect(0, y, pageW, 44).fill(REPORT_DOC.barSubject);
    doc.fillColor('#d1d5db').font('Helvetica-Bold').fontSize(7);
    doc.text('CASE #', left, y + 8);
    doc.text('REPORT', left + 180, y + 8);
    doc.text('SUBMITTED BY', left + 340, y + 8);
    doc.fillColor('#ffffff').fontSize(10);
    doc.text(caseId.slice(0, 24).toUpperCase(), left, y + 24);
    doc.text(String(title).slice(0, 28).toUpperCase(), left + 180, y + 24);
    doc.text(submitterPlain.slice(0, 28).toUpperCase(), left + 340, y + 24);

    y += 52;
    const rows = fields.length
      ? fields.map(([name, value]) => ({
        label: displayFieldName(name),
        value: String(value ?? 'N/A'),
      }))
      : [{ label: 'Details', value: 'No report details were supplied by Melonly.' }];

    const labelW = 150;
    const valueW = contentW - labelW - 12;
    const textOpts = { lineGap: 2 };

    for (let i = 0; i < rows.length; i += 1) {
      const entry = rows[i];
      const label = String(entry.label || '').toUpperCase();
      const value = String(entry.value || '').toUpperCase();
      doc.font('Helvetica-Bold').fontSize(7);
      const labelH = doc.heightOfString(label, { width: labelW, ...textOpts });
      doc.font('Helvetica').fontSize(7);
      const valueH = doc.heightOfString(value, { width: valueW, ...textOpts });
      const rowH = Math.ceil(Math.max(labelH, valueH, 9) + 16);

      if (y + rowH > doc.page.height - 90) {
        doc.addPage();
        y = 36;
      }

      const fill = i % 2 === 0 ? '#ffffff' : REPORT_DOC.rowAlt;
      doc.rect(left, y, contentW, rowH).fill(fill).strokeColor(REPORT_DOC.border).lineWidth(0.4).stroke();
      doc.fillColor(REPORT_DOC.label).font('Helvetica-Bold').fontSize(7)
        .text(label, left + 4, y + 8, { width: labelW, height: rowH - 10, ellipsis: true, ...textOpts });
      doc.fillColor(REPORT_DOC.value).font('Helvetica').fontSize(7)
        .text(value, left + labelW + 4, y + 8, { width: valueW, height: rowH - 10, ellipsis: true, ...textOpts });
      y += rowH;
    }

    if (y + 80 > doc.page.height - 36) {
      doc.addPage();
      y = 36;
    } else {
      y += 14;
    }

    const footerH = 64;
    doc.rect(left, y, contentW, footerH).fill('#fafafa').strokeColor(REPORT_DOC.border).lineWidth(0.6).stroke();
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
      .text('IMPORTANT NOTE AND DISCLAIMER', left + 8, y + 8, { width: contentW - 16, lineBreak: false });
    doc.fillColor('#374151').font('Helvetica').fontSize(7)
      .text(
        "This document is an official Pinellas County Sheriff's Office operations record for Clearwater Roleplay. "
        + `Automatically imported from Melonly CAD as reported by ${submitterPlain}. `
        + 'Verify against CAD before any enforcement action. '
        + `Generated ${generatedAt}.`,
        left + 8,
        y + 22,
        { width: contentW - 16, height: footerH - 28, ellipsis: true },
      );

    doc.fillColor(REPORT_DOC.muted).fontSize(8)
      .text('— End Report —', left, y + footerH + 8, { width: contentW, align: 'center', lineBreak: false });

    doc.end();
  });
}

async function buildReportPayload(record, type, submitter) {
  const fields = recordFields(record);
  const details = fields.length
    ? fields.map(([name, value]) => `**${displayFieldName(name)}:** ${safe(value, 700)}`).join('\n')
    : 'No report details were supplied by Melonly.';
  const text = `# <:info:1517217516706074634> PCSO ${type.toUpperCase()} Report\n\n> **Case ID:** ${safe(record.id, 80)}\n> **Report:** ${safe(record.label || type, 180)}\n> **Submitted by:** ${submitter.label}\n\n${details}\n\n-# Automatically imported from Melonly CAD`;
  const pdf = await buildMelonlyReportPdf(record, type, submitter.label);
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PCSO_REPORT_BANNER_URL)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.slice(0, 3900)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addFileComponents(new FileBuilder().setURL('attachment://pcso-report.pdf'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(PCSO_REPORT_FOOTER_URL)));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: submitter.discordId
      ? { parse: [], users: [submitter.discordId] }
      : { parse: [] },
    files: [
      new AttachmentBuilder(pdf, { name: 'pcso-report.pdf' }),
    ],
  };
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
  const submitter = await resolveReportSubmitter(config.melonlyApiKey, record);
  await channel.send(await buildReportPayload(record, type, submitter));
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
