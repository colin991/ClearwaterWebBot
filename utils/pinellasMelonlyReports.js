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
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import {
  fetchMelonlyMember,
  fetchMelonlyMemberByDiscordId,
  fetchMelonlyMembers,
  melonlyFetch,
  resolveMelonlyDiscordId,
} from './melonly.js';
import { getIdentityCache } from './identityStore.js';
import { PINELLAS_GUILD_ID } from './pinellasServer.js';
import { CLEARWATER_GUILD_ID } from './staffRanks.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import {
  PINELLAS_SHIFT_REPORT_CHANNELS,
  resolvePinellasMelonlyMemberDiscordId,
} from './pinellasShiftPanel.js';
import { formatMoney } from './economyConfig.js';
import { applyCitationFine } from './economyLedger.js';
import { withEconomy } from './economyStore.js';
import { dmEconomyUser, postEconomyLog } from './economyService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-melonly-reports.json');
const PCSO_STAR_LOGO_PATH = path.join(ROOT, 'assets', 'pcso-sheriff-star.png');
const POLL_MS = 60_000;
const PAGE_SIZE = 100;
const MAX_SEEN = 2_000;
const SUBJECT_DM_TYPES = new Set(['arrest', 'citation']);
const DISCORD_SNOWFLAKE_RE = /^\d{16,22}$/;
const SUBJECT_LABEL_RE = /subject|civilian|citizen|suspect|defendant|cited|violator|character|person|offender/;
const CREATOR_KEY_RE = /^(createdby|author|submitter|submittedby|creator|officer|deputy)$/i;
const CAD_CHARACTER_PATHS = Object.freeze([
  '/server/cad/characters',
  '/server/cad/civilians',
  '/server/cad/profiles',
  '/server/characters',
  '/server/civilians',
  '/server/cad/users',
  '/server/cad/players',
]);

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
  ['warrant', ['warrant arrest', 'arrest warrant', 'warrant log', 'warant', 'warrant']],
  ['citation', ['citation', 'ticket']],
  ['arrest', ['arrest']],
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

export function reportTypeFor(record) {
  const explicitText = [record?.label, record?.type, record?.templateId]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const explicitType = reportTypeAliases.find(([, aliases]) => (
    aliases.some((alias) => explicitText.includes(alias))
  ))?.[0];
  if (explicitType) return explicitType;
  const text = recordText(record);
  return reportTypeAliases.find(([, aliases]) => aliases.some((alias) => text.includes(alias)))?.[0] || null;
}

export function isPinellasRecord(record) {
  const text = recordText(record);
  return /pinellas|pcso|sheriff/.test(text);
}

/** Arrest, citation, MVA, OIS, and warrant only — not civilian CAD forms. */
export function isPcsoStaffCadRecord(record) {
  const type = reportTypeFor(record);
  if (!type) return false;
  return type === 'warrant' || isPinellasRecord(record);
}

export function reportTitle(type, record) {
  return REPORT_TYPE_TITLES[type] || record?.label || `${String(type || 'CAD').toUpperCase()} Report`;
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

function parseMoneyAmount(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

/** Sum Melonly CAD ticket/citation fines from charges and labeled fine fields. */
export function citationFineAmount(record) {
  const chargeFines = [];
  const labeledFines = [];
  const visit = (value) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    if (isChargeObject(value)) {
      const fine = parseMoneyAmount(objectValue(value, 'fine', 'amount', 'ticketAmount', 'penalty'));
      if (fine > 0) chargeFines.push(fine);
      return;
    }
    if (isMelonlyFieldObject(value)) {
      const label = melonlyFieldLabel(value);
      if (/\b(fine|ticket amount|amount due|total fine|citation amount|penalty)\b/i.test(label)
        && !/\b(jail|count|class|number|id)\b/i.test(label)) {
        const fine = parseMoneyAmount(objectValue(value, 'value'));
        if (fine > 0) labeledFines.push(fine);
        return;
      }
      visit(objectValue(value, 'value'));
      return;
    }
    for (const entry of Object.values(value)) visit(entry);
  };
  visit(record?.previewData);
  visit(record?.data);
  visit(record?.objects);
  visit(record?.meta);
  if (chargeFines.length) return chargeFines.reduce((sum, fine) => sum + fine, 0);
  if (labeledFines.length) return labeledFines.reduce((sum, fine) => sum + fine, 0);
  return parseMoneyAmount(record?.fine ?? record?.amount ?? record?.ticketAmount);
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

function creatorObjects(record) {
  return [
    record,
    record?.createdBy,
    record?.author,
    record?.user,
    record?.member,
    record?.creator,
    record?.submittedBy,
  ].filter((value) => value && typeof value === 'object');
}

export function recordCreatorDiscordId(record) {
  for (const source of creatorObjects(record)) {
    const discordId = resolveMelonlyDiscordId(source);
    if (discordId) return discordId;
  }
  return null;
}

export function recordCreatorId(record) {
  for (const source of creatorObjects(record)) {
    for (const key of ['memberId', 'userId', 'id', 'createdByUserId', 'authorId']) {
      const value = String(source?.[key] || '').trim();
      if (/^\d{10,22}$/.test(value)) return value;
    }
  }
  for (const key of ['createdByUserId', 'createdBy', 'authorId', 'userId', 'memberId']) {
    const raw = record?.[key];
    if (raw == null || typeof raw === 'object') continue;
    const value = String(raw).trim();
    if (/^\d{10,22}$/.test(value)) return value;
  }
  return '';
}

function mentionSubmitter(discordId) {
  return { label: `<@${discordId}>`, discordId: String(discordId) };
}

/** Resolve Melonly CAD creator → Discord mention text + snowflake (when linked). */
export async function resolveReportSubmitter(apiKey, record) {
  const directDiscordId = recordCreatorDiscordId(record);
  if (directDiscordId) return mentionSubmitter(directDiscordId);

  const melonlyId = recordCreatorId(record);
  if (!melonlyId) {
    return { label: 'Melonly', discordId: null };
  }
  if (!apiKey) {
    return { label: `Melonly user ${melonlyId}`, discordId: null };
  }

  try {
    const discordId = await resolvePinellasMelonlyMemberDiscordId(apiKey, melonlyId);
    if (discordId) return mentionSubmitter(discordId);
  } catch (error) {
    logger.warn(`Could not resolve Melonly reporter ${melonlyId} to Discord: ${error?.message || error}`);
  }

  try {
    const member = await fetchMelonlyMember(apiKey, melonlyId);
    const discordId = resolveMelonlyDiscordId(member);
    if (discordId) return mentionSubmitter(discordId);
  } catch (error) {
    if (error?.status !== 404) {
      logger.warn(`Melonly member fetch failed for reporter ${melonlyId}: ${error?.message || error}`);
    }
  }

  // CAD sometimes stores a Discord snowflake in createdByUserId.
  try {
    const member = await fetchMelonlyMemberByDiscordId(apiKey, melonlyId);
    if (member) {
      const discordId = resolveMelonlyDiscordId(member) || melonlyId;
      if (/^\d{16,22}$/.test(String(discordId))) return mentionSubmitter(discordId);
    }
  } catch (error) {
    if (error?.status !== 404) {
      logger.warn(`Melonly discord reverse lookup failed for ${melonlyId}: ${error?.message || error}`);
    }
  }

  return { label: `Melonly user ${melonlyId}`, discordId: null };
}

async function loadStarLogo() {
  try {
    const raw = await readFile(PCSO_STAR_LOGO_PATH);
    // Keep the PDF small — the source star asset is ~2MB at full resolution.
    return await sharp(raw)
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
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


function normalizePersonName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPersonName(value) {
  return normalizePersonName(value).replace(/\s+/g, '');
}

function asObjectList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'characters', 'civilians', 'profiles', 'results', 'items', 'members']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function pickText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function characterFullName(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const first = pickText(entry.firstName, entry.first_name, entry.givenName);
  const last = pickText(entry.lastName, entry.last_name, entry.surname, entry.familyName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return pickText(
    entry.roleplayName,
    entry.roleplay_name,
    entry.rpName,
    entry.rp_name,
    entry.characterName,
    entry.character_name,
    entry.cadName,
    entry.cad_name,
    entry.fullName,
    entry.full_name,
    entry.displayName,
    entry.display_name,
    combined,
    entry.name,
  );
}

/**
 * Match a candidate display/RP name to a report subject.
 * Supports full names, compacted names, first+last tokens, and PCSO-style "A. Miller".
 */
export function personNameMatches(candidate, subject) {
  const hay = normalizePersonName(candidate);
  if (!hay) return false;

  const subjectObj = subject && typeof subject === 'object'
    ? subject
    : { fullName: subject };
  const full = normalizePersonName(subjectObj.fullName);
  const first = normalizePersonName(subjectObj.firstName);
  const last = normalizePersonName(subjectObj.lastName);
  const tokens = hay.split(' ').filter(Boolean);

  if (full) {
    if (hay === full || hay.includes(full)) return true;
    if (compactPersonName(hay) === compactPersonName(full)) return true;
    // Multi-token shortenings only (avoid last-name-only false positives).
    if (tokens.length >= 2 && hay.length >= 6 && full.includes(hay)) return true;
  }

  if (first && last && last.length >= 2) {
    if (tokens.includes(first) && tokens.includes(last)) return true;
    // Initial + last ("a miller") used in many PCSO nicknames.
    const initial = first[0];
    if (
      tokens.includes(last)
      && tokens.some((token) => token === initial || token === `${initial}${last}`)
    ) {
      return true;
    }
  }

  return false;
}

/** Pull the civilian / subject name from a Melonly CAD report. */
export function extractReportSubject(record) {
  const fields = recordFields(record);
  const byLabel = new Map(
    fields.map(([name, value]) => [displayFieldName(name).toLowerCase(), String(value ?? '').trim()]),
  );
  const read = (...needles) => {
    for (const needle of needles) {
      for (const [label, value] of byLabel) {
        if (!value) continue;
        if (label === needle || label.includes(needle)) return value;
      }
    }
    return '';
  };
  const firstName = read('first name', 'firstname', 'given name');
  const lastName = read('last name', 'lastname', 'surname', 'family name');
  const fullFromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fullName = fullFromParts
    || read('suspect', 'subject', 'defendant', 'cited person', 'violator', 'full name', 'name');
  return {
    firstName: firstName || null,
    lastName: lastName || null,
    fullName: fullName || null,
  };
}

function discordFromCharacterRow(row) {
  if (!row || typeof row !== 'object') return null;
  return resolveMelonlyDiscordId(row)
    || resolveMelonlyDiscordId(row.owner)
    || resolveMelonlyDiscordId(row.user)
    || resolveMelonlyDiscordId(row.member)
    || resolveMelonlyDiscordId(row.account)
    || resolveMelonlyDiscordId(row.player)
    || null;
}

function pushDiscordCandidate(out, value, score = 1) {
  const discordId = String(value || '').trim();
  if (!DISCORD_SNOWFLAKE_RE.test(discordId)) return;
  const existing = out.get(discordId) || 0;
  if (score > existing) out.set(discordId, score);
}

/**
 * Deep-scan Melonly payload for subject Discord IDs before flatten loses object shape.
 * Scores candidates so subject/civilian branches beat incidental IDs; never uses creator keys.
 */
function collectSubjectDiscordCandidates(record, subject = null) {
  const scores = new Map();
  const visit = (value, pathKeys = []) => {
    if (value == null) return;
    if (typeof value === 'string') {
      const parsed = parseObject(value);
      if (parsed) visit(parsed, pathKeys);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...pathKeys, String(index)]));
      return;
    }
    if (typeof value !== 'object') return;

    const pathText = pathKeys.join(' ').toLowerCase();
    if (pathKeys.some((key) => CREATOR_KEY_RE.test(String(key).replace(/[^a-z]/gi, '')))) {
      return;
    }

    if (isMelonlyFieldObject(value)) {
      const label = melonlyFieldLabel(value);
      const answer = objectValue(value, 'value');
      visit(answer, [...pathKeys, label]);
      return;
    }

    const pathIsSubject = SUBJECT_LABEL_RE.test(pathText);
    const ownName = characterFullName(value);
    const nameMatches = subject?.fullName ? personNameMatches(ownName, subject) : false;
    const direct = discordFromCharacterRow(value);
    if (direct) {
      let score = 1;
      if (pathIsSubject) score = 5;
      if (nameMatches) score = Math.max(score, 6);
      if (pathIsSubject && nameMatches) score = 8;
      pushDiscordCandidate(scores, direct, score);
    }

    for (const [key, entry] of Object.entries(value)) {
      const keyNorm = String(key).toLowerCase();
      if (CREATOR_KEY_RE.test(keyNorm.replace(/[^a-z]/g, ''))) continue;
      if (
        /discord/.test(keyNorm)
        && typeof entry !== 'object'
        && DISCORD_SNOWFLAKE_RE.test(String(entry || '').trim())
      ) {
        let score = 2;
        if (pathIsSubject || SUBJECT_LABEL_RE.test(keyNorm)) score = 7;
        if (nameMatches) score = Math.max(score, 6);
        pushDiscordCandidate(scores, entry, score);
        continue;
      }
      visit(entry, [...pathKeys, key]);
    }
  };

  for (const root of [
    record?.subject,
    record?.civilian,
    record?.character,
    record?.suspect,
    record?.defendant,
    record?.person,
    record?.target,
    record?.cited,
    record?.citizen,
    ...(Array.isArray(record?.subjects) ? record.subjects : []),
    ...(Array.isArray(record?.civilians) ? record.civilians : []),
  ]) {
    visit(root, ['subject']);
  }

  for (const source of [record?.previewData, record?.data, record?.objects, record?.meta]) {
    visit(parseObject(source) || source, []);
  }

  for (const [name, value] of recordFields(record)) {
    const label = displayFieldName(name).toLowerCase();
    const text = String(value ?? '').trim();
    if (!DISCORD_SNOWFLAKE_RE.test(text)) continue;
    if (!/discord/.test(label)) continue;
    pushDiscordCandidate(scores, text, SUBJECT_LABEL_RE.test(label) ? 7 : 3);
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([discordId]) => discordId);
}

function subjectDiscordFromRecord(record, subject = null) {
  const resolvedSubject = subject || extractReportSubject(record);
  const creatorDiscord = recordCreatorDiscordId(record);
  const candidates = collectSubjectDiscordCandidates(record, resolvedSubject)
    .filter((discordId) => !creatorDiscord || discordId !== creatorDiscord);
  return candidates[0] || null;
}

async function resolveDiscordFromCadCharacters(apiKey, subject) {
  const fullName = subject?.fullName || subject;
  if (!apiKey || !normalizePersonName(fullName)) return null;
  const subjectObj = subject && typeof subject === 'object'
    ? subject
    : { fullName };

  const queries = [
    {},
    { search: fullName, name: fullName, q: fullName },
  ];

  for (const pathName of CAD_CHARACTER_PATHS) {
    for (const query of queries) {
      try {
        const payload = await melonlyFetch(apiKey, pathName, {
          query,
          cacheTtlMs: 60_000,
        });
        const rows = asObjectList(payload);
        if (!rows.length) continue;
        for (const row of rows) {
          if (!personNameMatches(characterFullName(row), subjectObj)) continue;
          const direct = discordFromCharacterRow(row);
          if (direct) return direct;
          const ownerId = pickText(
            row.ownerId,
            row.owner_id,
            row.userId,
            row.user_id,
            row.memberId,
            row.member_id,
            row.createdByUserId,
            row.created_by_user_id,
            row.playerId,
            row.player_id,
          );
          if (ownerId) {
            const mapped = await resolvePinellasMelonlyMemberDiscordId(apiKey, ownerId);
            if (mapped) return mapped;
          }
        }
        // Path returned rows; no need to hammer query variants forever.
        if (!Object.keys(query).length) break;
      } catch (error) {
        if (error?.status === 429) throw error;
      }
    }
  }
  return null;
}

async function resolveDiscordFromMelonlyMembers(apiKey, subject) {
  if (!apiKey || !subject?.fullName) return null;
  const members = await fetchMelonlyMembers(apiKey, { maxPages: 10, cacheTtlMs: 5 * 60_000 });
  for (const member of members || []) {
    const names = [
      characterFullName(member),
      characterFullName(member?.character),
      characterFullName(member?.civilian),
      characterFullName(member?.profile),
      characterFullName(member?.cad),
      member?.roleplayName,
      member?.roleplay_name,
      member?.rpName,
      member?.displayName,
      member?.display_name,
      member?.username,
      member?.name,
    ];
    if (!names.some((name) => personNameMatches(name, subject))) continue;

    const direct = discordFromCharacterRow(member);
    if (direct) return direct;

    const memberId = pickText(member?.id, member?.memberId, member?.member_id, member?.userId);
    if (memberId) {
      const mapped = await resolvePinellasMelonlyMemberDiscordId(apiKey, memberId);
      if (mapped) return mapped;
    }
  }
  return null;
}

async function resolveDiscordFromIdentityName(subject) {
  const fullName = subject?.fullName || subject;
  if (!normalizePersonName(fullName)) return null;
  const subjectObj = subject && typeof subject === 'object'
    ? subject
    : { fullName };
  try {
    const cache = await getIdentityCache();
    for (const entry of Object.values(cache?.byDiscord || {})) {
      const names = [
        entry?.robloxDisplayName,
        entry?.robloxUsername,
        entry?.nickname,
        entry?.displayName,
      ];
      if (!names.some((name) => personNameMatches(name, subjectObj))) continue;
      const discordId = String(entry?.discordId || '').trim();
      if (DISCORD_SNOWFLAKE_RE.test(discordId)) return discordId;
    }
  } catch {
    // optional
  }
  return null;
}

async function resolveDiscordFromGuildNicknames(client, subject) {
  const fullName = subject?.fullName || subject;
  if (!client || !normalizePersonName(fullName)) return null;
  const subjectObj = subject && typeof subject === 'object'
    ? subject
    : { fullName };

  for (const guildId of [PINELLAS_GUILD_ID, CLEARWATER_GUILD_ID]) {
    if (!guildId) continue;
    const guild = client.guilds.cache.get(guildId)
      || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;
    if (guild.members.cache.size < 25) {
      await ensureGuildMembers(guild, { allowStale: true }).catch(() => null);
    }
    for (const member of guild.members.cache.values()) {
      if (member.user?.bot) continue;
      const names = [
        member.displayName,
        member.nickname,
        member.user?.globalName,
        member.user?.username,
      ];
      if (names.some((name) => personNameMatches(name, subjectObj))) {
        return member.id;
      }
    }
  }
  return null;
}

/** Resolve arrest/citation subject → Discord snowflake when possible. */
export async function resolveReportSubjectDiscordId(apiKey, record, client = null) {
  const subject = extractReportSubject(record);
  const direct = subjectDiscordFromRecord(record, subject);
  if (direct) return direct;

  if (!subject.fullName) return null;

  const fromCad = await resolveDiscordFromCadCharacters(apiKey, subject).catch((error) => {
    logger.warn(`CAD character subject lookup failed: ${error?.message || error}`);
    return null;
  });
  if (fromCad) return fromCad;

  const fromMembers = await resolveDiscordFromMelonlyMembers(apiKey, subject).catch((error) => {
    logger.warn(`Melonly member subject lookup failed: ${error?.message || error}`);
    return null;
  });
  if (fromMembers) return fromMembers;

  const fromIdentity = await resolveDiscordFromIdentityName(subject);
  if (fromIdentity) return fromIdentity;

  const fromGuild = await resolveDiscordFromGuildNicknames(client, subject).catch((error) => {
    logger.warn(`Guild nickname subject lookup failed: ${error?.message || error}`);
    return null;
  });
  return fromGuild || null;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapSvgLines(value, width = 42) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['N/A'];
}

/** Build a PNG copy of the Melonly report for subject DMs. */
export async function buildMelonlyReportPng(record, type, submitterLabel = 'Melonly') {
  const title = reportTitle(type, record);
  const fields = recordFields(record);
  const caseId = String(record?.id || 'N/A');
  const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const submitterPlain = String(submitterLabel || 'Melonly').replace(/<@!?(\d+)>/g, 'Discord:$1');
  const logoPng = await loadStarLogo();
  const logoDataUri = logoPng
    ? `data:image/png;base64,${logoPng.toString('base64')}`
    : null;

  const rows = fields.length
    ? fields.map(([name, value]) => ({
      label: displayFieldName(name),
      value: String(value ?? 'N/A'),
    }))
    : [{ label: 'Details', value: 'No report details were supplied by Melonly.' }];

  const width = 1200;
  let y = 320;
  const rowSvg = [];
  for (let i = 0; i < rows.length; i += 1) {
    const labelLines = wrapSvgLines(String(rows[i].label).toUpperCase(), 28);
    const valueLines = wrapSvgLines(String(rows[i].value).toUpperCase(), 70);
    const lineCount = Math.max(labelLines.length, valueLines.length, 1);
    const rowH = Math.max(52, 24 + lineCount * 18);
    const fill = i % 2 === 0 ? '#ffffff' : REPORT_DOC.rowAlt;
    rowSvg.push(`<rect x="40" y="${y}" width="1120" height="${rowH}" fill="${fill}" stroke="${REPORT_DOC.border}"/>`);
    labelLines.forEach((line, index) => {
      rowSvg.push(`<text x="56" y="${y + 22 + index * 18}" class="label">${escapeXml(line)}</text>`);
    });
    valueLines.forEach((line, index) => {
      rowSvg.push(`<text x="280" y="${y + 22 + index * 18}" class="value">${escapeXml(line)}</text>`);
    });
    y += rowH;
  }

  const footerY = y + 24;
  const height = Math.max(900, footerY + 160);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${logoDataUri ? `<image href="${logoDataUri}" x="40" y="28" width="88" height="88"/>` : ''}
    <text x="${logoDataUri ? 150 : 40}" y="58" class="agency">PINELLAS COUNTY SHERIFF'S OFFICE</text>
    <text x="${logoDataUri ? 150 : 40}" y="88" class="title">${escapeXml(title)} — Official Record</text>
    <text x="1160" y="48" text-anchor="end" class="tag">CLEARWATER ROLEPLAY</text>
    <text x="1160" y="74" text-anchor="end" class="tag-sub">ONE COUNTY • ONE STANDARD</text>
    <rect x="0" y="140" width="${width}" height="36" fill="${REPORT_DOC.barDark}"/>
    <text x="40" y="164" class="bar">Search Results</text>
    <text x="1160" y="164" text-anchor="end" class="bar-right">Case ${escapeXml(caseId.slice(0, 90))}</text>
    <rect x="0" y="176" width="${width}" height="36" fill="${REPORT_DOC.barOlive}"/>
    <text x="40" y="200" class="bar-dark">Official ${escapeXml(title)} for the cited / arrested person.</text>
    <text x="1160" y="200" text-anchor="end" class="bar-dark-right">${escapeXml(generatedAt)}</text>
    <rect x="0" y="220" width="${width}" height="72" fill="${REPORT_DOC.barSubject}"/>
    <text x="40" y="246" class="subj-h">CASE #</text>
    <text x="360" y="246" class="subj-h">REPORT</text>
    <text x="720" y="246" class="subj-h">SUBMITTED BY</text>
    <text x="40" y="276" class="subj-v">${escapeXml(caseId.slice(0, 28).toUpperCase())}</text>
    <text x="360" y="276" class="subj-v">${escapeXml(String(title).slice(0, 28).toUpperCase())}</text>
    <text x="720" y="276" class="subj-v">${escapeXml(submitterPlain.slice(0, 28).toUpperCase())}</text>
    ${rowSvg.join('\n')}
    <rect x="40" y="${footerY}" width="1120" height="110" fill="#fafafa" stroke="${REPORT_DOC.border}"/>
    <text x="56" y="${footerY + 32}" class="disc-t">IMPORTANT NOTE AND DISCLAIMER</text>
    <text x="56" y="${footerY + 58}" class="disc">This document is an official Pinellas County Sheriff's Office operations record for Clearwater Roleplay.</text>
    <text x="56" y="${footerY + 80}" class="disc">A copy was delivered to the report subject. Generated ${escapeXml(generatedAt)}.</text>
    <text x="600" y="${height - 28}" text-anchor="middle" class="end">— End Report —</text>
    <style>
      .agency { font: 700 28px Arial, Helvetica, sans-serif; fill: ${REPORT_DOC.titleBlue}; }
      .title { font: 700 20px Arial, Helvetica, sans-serif; fill: #111827; }
      .tag { font: 700 12px Arial, Helvetica, sans-serif; fill: #111827; }
      .tag-sub { font: 11px Arial, Helvetica, sans-serif; fill: ${REPORT_DOC.muted}; }
      .bar { font: 700 14px Arial, Helvetica, sans-serif; fill: #ffffff; }
      .bar-right { font: 12px Arial, Helvetica, sans-serif; fill: #f3f4f6; }
      .bar-dark { font: 700 14px Arial, Helvetica, sans-serif; fill: #1f2937; }
      .bar-dark-right { font: 12px Arial, Helvetica, sans-serif; fill: #374151; }
      .subj-h { font: 700 12px Arial, Helvetica, sans-serif; fill: #d1d5db; }
      .subj-v { font: 700 16px Arial, Helvetica, sans-serif; fill: #ffffff; }
      .label { font: 700 11px Arial, Helvetica, sans-serif; fill: ${REPORT_DOC.label}; }
      .value { font: 11px Arial, Helvetica, sans-serif; fill: ${REPORT_DOC.value}; }
      .disc-t { font: 700 12px Arial, Helvetica, sans-serif; fill: #111827; }
      .disc { font: 11px Arial, Helvetica, sans-serif; fill: #374151; }
      .end { font: 12px Arial, Helvetica, sans-serif; fill: ${REPORT_DOC.muted}; }
    </style>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function dmSubjectReportPng(client, record, type, submitterLabel) {
  if (!SUBJECT_DM_TYPES.has(type)) return { sent: false, reason: 'type' };
  const subject = extractReportSubject(record);
  const discordId = await resolveReportSubjectDiscordId(config.melonlyApiKey, record, client);
  if (!discordId) {
    logger.info(
      `Melonly ${type} report ${record?.id || 'unknown'}: no Discord match for subject `
      + `"${subject.fullName || 'unknown'}" — skipping subject DM `
      + '(needs linked Melonly/CAD character, identity, or matching guild nickname)',
    );
    return { sent: false, reason: 'unresolved', discordId: null };
  }

  const png = await buildMelonlyReportPng(record, type, submitterLabel);
  const files = [new AttachmentBuilder(png, { name: 'pcso-report.png' })];
  if (type === 'arrest') {
    const pdf = await buildMelonlyReportPdf(record, type, submitterLabel);
    files.push(new AttachmentBuilder(pdf, { name: 'pcso-arrest-report.pdf' }));
  }
  try {
    const user = await client.users.fetch(discordId);
    await user.send({ files });
  } catch (error) {
    const code = error?.code || error?.rawError?.code;
    if (code === 50007) {
      logger.warn(
        `Melonly ${type} report ${record?.id || 'unknown'}: subject Discord ${discordId} `
        + `(${subject.fullName || 'unknown'}) has DMs closed — could not deliver report files`,
      );
      return { sent: false, reason: 'dms_closed', discordId };
    }
    throw error;
  }
  logger.info(
    `DMed Melonly ${type} report ${type === 'arrest' ? 'PNG and PDF' : 'PNG'} to subject Discord ${discordId} `
    + `(${subject.fullName || 'unknown'}) for case ${record?.id || 'unknown'}`,
  );
  return { sent: true, discordId };
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
      new AttachmentBuilder(Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf), { name: 'pcso-report.pdf' }),
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

export async function chargeCitationFine(client, record) {
  if (reportTypeFor(record) !== 'citation') return { charged: false, reason: 'type' };
  const amount = citationFineAmount(record);
  if (amount <= 0) return { charged: false, reason: 'zero' };
  const discordId = await resolveReportSubjectDiscordId(config.melonlyApiKey, record, client);
  if (!discordId) {
    logger.info(
      `Melonly citation ${record?.id || 'unknown'}: no Discord match for the cited player — skipping ticket fine`,
    );
    return { charged: false, reason: 'unresolved' };
  }
  const result = await withEconomy((store) => applyCitationFine(store, discordId, amount, {
    recordId: String(record?.id || '').trim(),
    note: `Melonly CAD ticket ${record?.id || ''}`.trim(),
  }));
  if (!result.charged) return result;
  await dmEconomyUser(client, discordId, {
    title: 'Citation fine',
    description: `A LEO ticket in Melonly CAD deducted ${formatMoney(result.amount)} from your account (cash first, then bank).`,
  });
  await postEconomyLog(
    client,
    'Citation fine',
    `<@${discordId}> ${formatMoney(-result.amount)} · CAD ${record?.id || 'unknown'} · \`${result.tx.id}\``,
  );
  logger.info(
    `Charged Melonly citation fine ${formatMoney(result.amount)} to Discord ${discordId} for case ${record?.id || 'unknown'}`,
  );
  return result;
}

async function importRecord(client, record, type) {
  const channelId = PINELLAS_SHIFT_REPORT_CHANNELS[type];
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`Report channel ${channelId} is unavailable.`);
  const submitter = await resolveReportSubmitter(config.melonlyApiKey, record);
  const payload = await buildReportPayload(record, type, submitter);
  if (!payload.files?.length) {
    throw new Error(`Melonly ${type} report PDF was not attached for case ${record?.id || 'unknown'}.`);
  }
  logger.info(
    `Posting Melonly ${type} report ${record?.id || 'unknown'} `
    + `submitted by ${submitter.discordId ? `Discord ${submitter.discordId}` : submitter.label} `
    + `with PDF (${payload.files[0].attachment?.length || payload.files[0].size || 'buffer'} bytes)`,
  );
  await channel.send(payload);

  // Arrest / citation subjects get a PNG-only DM copy when Discord can be resolved.
  try {
    await dmSubjectReportPng(client, record, type, submitter.label);
  } catch (error) {
    logger.warn(
      `Could not DM Melonly ${type} report PNG for case ${record?.id || 'unknown'}: `
      + `${error?.message || error}`,
    );
  }
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
    if (!id || seen.has(id) || !type) {
      skipped += 1;
      continue;
    }
    const pinellasOrWarrant = isPinellasRecord(record) || type === 'warrant';
    if (type === 'citation') {
      try {
        const billed = await chargeCitationFine(client, record);
        if (!pinellasOrWarrant && billed.reason !== 'unresolved') seen.add(id);
      } catch (error) {
        logger.warn(`Could not charge Melonly citation ${id}: ${error?.message || error}`);
      }
    }
    if (!pinellasOrWarrant) {
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
