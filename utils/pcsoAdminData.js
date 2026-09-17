import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGoogleSheetsConfigured, readGoogleSheetValues } from './googleSheets.js';
import { PINELLAS_ROSTER_RANGE, parsePinellasRosterRows } from './pinellasRoster.js';
import {
  PINELLAS_MELONLY_DEPARTMENT_ID,
  formatShiftDuration,
  isPinellasDepartmentShift,
} from './pinellasShiftPanel.js';
import {
  fetchMelonlyMemberDiscordId,
  fetchPinellasDepartmentShifts,
  melonlyFetch,
  shiftCreatedMs,
} from './melonly.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PCSO_STAR_LOGO_PATH = path.join(ROOT, 'assets', 'pcso-sheriff-star.png');

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

async function loadStarLogo() {
  try {
    const raw = await readFile(PCSO_STAR_LOGO_PATH);
    return await sharp(raw)
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

function formatNyDate(value, withTime = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

function formatReportWhen(value) {
  const raw = Number(value || 0);
  if (!raw) return 'Unknown time';
  const ms = raw < 1e12 ? raw * 1000 : raw;
  return formatNyDate(ms, true);
}

function googleSettings() {
  return {
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || '',
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY || '',
  };
}

function rosterSpreadsheetId() {
  return process.env.PCSO_ROSTER_SPREADSHEET_ID?.trim()
    || '1gbwwPz8Sk9AE_AG6J8RRWGaEGLGPX6AdHW2FTxqY4Xc';
}

function weekWindow(now = Date.now()) {
  return { start: now - (7 * 24 * 60 * 60 * 1000), end: now };
}

function shiftDurationMs(shift, now = Date.now()) {
  const start = shiftCreatedMs(shift);
  if (!start) return 0;
  const endRaw = Number(shift?.endedAt);
  const end = Number.isFinite(endRaw) && endRaw > 0
    ? (endRaw < 1e12 ? endRaw * 1000 : endRaw)
    : now;
  return Math.max(0, end - start);
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

function recordType(record) {
  return String(record?.label || record?.type || record?.templateId || record?.agency || 'Report').trim();
}

function emptyPerson(seed = {}) {
  return {
    discordId: seed.discordId || null,
    callsign: seed.callsign || '—',
    roleplayName: seed.roleplayName || 'Unknown',
    rank: seed.rank || '—',
    shiftMs: 0,
    shiftHoursLabel: '0m',
    reportCount: 0,
    reports: [],
  };
}

async function loadRosterRows() {
  const settings = googleSettings();
  if (!isGoogleSheetsConfigured(settings)) return [];
  try {
    const values = await readGoogleSheetValues(settings, rosterSpreadsheetId(), PINELLAS_ROSTER_RANGE);
    return parsePinellasRosterRows(values).filter((row) => row.discordId || row.callsign || row.roleplayName);
  } catch {
    return [];
  }
}

async function resolveDiscordId(apiKey, melonlyUserId, cache) {
  const id = String(melonlyUserId || '').trim();
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const discordId = await fetchMelonlyMemberDiscordId(apiKey, id, {
      departmentId: PINELLAS_MELONLY_DEPARTMENT_ID,
    });
    const value = discordId || null;
    cache.set(id, value);
    return value;
  } catch {
    cache.set(id, null);
    return null;
  }
}

async function loadWeeklyShifts(apiKey, { start, end }) {
  if (!apiKey) return [];
  const shifts = await fetchPinellasDepartmentShifts(apiKey, PINELLAS_MELONLY_DEPARTMENT_ID, {
    maxPages: 8,
    cacheTtlMs: 30_000,
  });
  return (shifts || []).filter((shift) => {
    if (!isPinellasDepartmentShift(shift)) return false;
    const created = shiftCreatedMs(shift);
    return created && created >= start && created <= end;
  });
}

async function loadWeeklyReports(apiKey, { start, end }) {
  if (!apiKey) return [];
  try {
    const result = await melonlyFetch(apiKey, '/server/cad/records', {
      query: { limit: 100 },
      cacheTtlMs: 30_000,
    });
    const records = Array.isArray(result?.data) ? result.data
      : (Array.isArray(result?.records) ? result.records
        : (Array.isArray(result) ? result : []));
    return records.filter((record) => {
      const created = Number(record?.createdAt || record?.created_at || 0);
      const ms = created > 0 && created < 1e12 ? created * 1000 : created;
      return ms >= start && ms <= end;
    });
  } catch {
    return [];
  }
}

/** Build the admin panel roster for the last 7 days. */
export async function buildPcsoAdminRoster({ melonlyApiKey = '' } = {}) {
  const window = weekWindow();
  const [rosterRows, shifts, records] = await Promise.all([
    loadRosterRows(),
    loadWeeklyShifts(melonlyApiKey, window),
    loadWeeklyReports(melonlyApiKey, window),
  ]);

  const byDiscord = new Map();
  for (const row of rosterRows) {
    const discordId = String(row.discordId || '').trim();
    if (!discordId) continue;
    byDiscord.set(discordId, emptyPerson({
      discordId,
      callsign: row.callsign || '—',
      roleplayName: row.roleplayName || 'Unknown',
      rank: row.rank || '—',
    }));
  }

  const discordCache = new Map();
  for (const shift of shifts) {
    const memberId = String(shift?.memberId || shift?.userId || '').trim();
    const discordId = await resolveDiscordId(melonlyApiKey, memberId, discordCache);
    if (!discordId) continue;
    const person = byDiscord.get(discordId) || emptyPerson({
      discordId,
      roleplayName: `Member ${discordId.slice(-4)}`,
    });
    person.shiftMs += shiftDurationMs(shift, window.end);
    byDiscord.set(discordId, person);
  }

  for (const record of records) {
    const creator = recordCreatorId(record);
    const discordId = await resolveDiscordId(melonlyApiKey, creator, discordCache);
    if (!discordId) continue;
    const person = byDiscord.get(discordId) || emptyPerson({
      discordId,
      roleplayName: `Member ${discordId.slice(-4)}`,
    });
    person.reportCount += 1;
    person.reports.push({
      id: String(record?.id || ''),
      type: recordType(record),
      createdAt: record?.createdAt || null,
    });
    byDiscord.set(discordId, person);
  }

  const people = [...byDiscord.values()]
    .map((person) => ({
      ...person,
      shiftHoursLabel: formatShiftDuration(person.shiftMs) || '0m',
      reports: person.reports.slice(0, 25),
    }))
    .sort((left, right) => {
      const a = `${left.callsign} ${left.roleplayName}`.toLowerCase();
      const b = `${right.callsign} ${right.roleplayName}`.toLowerCase();
      return a.localeCompare(b);
    });

  return {
    people,
    weekStart: new Date(window.start).toISOString(),
    weekEnd: new Date(window.end).toISOString(),
    rosterConfigured: isGoogleSheetsConfigured(googleSettings()),
    melonlyConfigured: Boolean(melonlyApiKey),
  };
}

/** Render the official weekly personnel PDF (same layout as Melonly CAD reports). */
export async function renderPcsoWeeklyReportPdf(person, weekStart, weekEnd) {
  const logoPng = await loadStarLogo();
  const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const weekLabel = `${formatNyDate(weekStart)} – ${formatNyDate(weekEnd)}`;
  const reports = Array.isArray(person.reports) ? person.reports.slice(0, 40) : [];
  const reportCount = Number(person.reportCount || reports.length || 0);
  const rows = [
    { label: 'Roleplay name', value: person.roleplayName || 'Unknown' },
    { label: 'Callsign', value: person.callsign || '—' },
    { label: 'Rank', value: person.rank || '—' },
    { label: 'Discord ID', value: person.discordId || '—' },
    { label: 'Reporting week', value: weekLabel },
    { label: 'Shift hours', value: person.shiftHoursLabel || '0m' },
    { label: 'Reports completed', value: String(reportCount) },
  ];
  if (!reports.length) {
    rows.push({
      label: 'CAD reports',
      value: 'No Melonly CAD reports were attributed to this member in the last 7 days.',
    });
  } else {
    reports.forEach((report, index) => {
      rows.push({
        label: `Report ${index + 1}`,
        value: `${report.type || 'Report'} — ${formatReportWhen(report.createdAt)}`,
      });
    });
  }

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
      .text('Weekly Personnel Report — Official Record', textLeft, y + 26, { width: contentW - 70 });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
      .text('CLEARWATER ROLEPLAY', left, y + 8, { width: contentW, align: 'right' });
    doc.fillColor(REPORT_DOC.muted).font('Helvetica').fontSize(7)
      .text('ONE COUNTY • ONE STANDARD', left, y + 22, { width: contentW, align: 'right' });

    y = 100;
    doc.rect(0, y, pageW, 22).fill(REPORT_DOC.barDark);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('Personnel Summary', left, y + 6);
    doc.font('Helvetica').fontSize(7).text(`Unit ${person.callsign || 'N/A'}`.slice(0, 95), left, y + 7, {
      width: contentW,
      align: 'right',
    });

    y += 22;
    doc.rect(0, y, pageW, 22).fill(REPORT_DOC.barOlive);
    doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(8)
      .text('Official weekly personnel summary from Melonly CAD and the PCSO roster.', left, y + 7);
    doc.fillColor('#374151').font('Helvetica').fontSize(7).text(generatedAt, left, y + 7, {
      width: contentW,
      align: 'right',
    });

    y += 22;
    doc.rect(0, y, pageW, 44).fill(REPORT_DOC.barSubject);
    doc.fillColor('#d1d5db').font('Helvetica-Bold').fontSize(7);
    doc.text('CALLSIGN', left, y + 8);
    doc.text('MEMBER', left + 180, y + 8);
    doc.text('RANK', left + 340, y + 8);
    doc.fillColor('#ffffff').fontSize(10);
    doc.text(String(person.callsign || '—').slice(0, 24).toUpperCase(), left, y + 24);
    doc.text(String(person.roleplayName || 'Unknown').slice(0, 28).toUpperCase(), left + 180, y + 24);
    doc.text(String(person.rank || '—').slice(0, 28).toUpperCase(), left + 340, y + 24);

    y += 52;
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
        + 'Shift hours and CAD reports are compiled from Melonly CAD and the PCSO roster for the reporting week. '
        + 'Verify against CAD before any personnel action. '
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

/** Generate a weekly PDF summary for one Discord member. */
export async function buildPcsoWeeklyReportPdf({ melonlyApiKey = '', discordId } = {}) {
  const id = String(discordId || '').trim();
  if (!/^\d{16,22}$/.test(id)) {
    const error = new Error('A valid Discord user id is required.');
    error.status = 400;
    throw error;
  }

  const roster = await buildPcsoAdminRoster({ melonlyApiKey });
  const person = roster.people.find((entry) => entry.discordId === id);
  if (!person) {
    const error = new Error('No roster, shift, or report data was found for that member this week.');
    error.status = 404;
    throw error;
  }

  const pdf = await renderPcsoWeeklyReportPdf(person, roster.weekStart, roster.weekEnd);

  const safeName = String(person.callsign || person.roleplayName || id)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || id;

  return {
    pdf,
    filename: `pcso-weekly-${safeName}.pdf`,
    person,
    weekStart: roster.weekStart,
    weekEnd: roster.weekEnd,
  };
}
