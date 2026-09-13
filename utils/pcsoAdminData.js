import PDFDocument from 'pdfkit';
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

  const pdf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#092d55').fontSize(20).text("Pinellas County Sheriff's Office");
    doc.moveDown(0.3);
    doc.fillColor('#34363b').fontSize(12).text('Weekly personnel report');
    doc.moveDown(0.8);
    doc.fillColor('#111').fontSize(11);
    doc.text(`Roleplay name: ${person.roleplayName}`);
    doc.text(`Callsign: ${person.callsign}`);
    doc.text(`Rank: ${person.rank}`);
    doc.text(`Discord ID: ${person.discordId}`);
    doc.text(`Week: ${new Date(roster.weekStart).toLocaleString('en-US')} – ${new Date(roster.weekEnd).toLocaleString('en-US')}`);
    doc.moveDown();
    doc.fontSize(13).fillColor('#092d55').text('Shift hours');
    doc.fontSize(11).fillColor('#111').text(person.shiftHoursLabel);
    doc.moveDown();
    doc.fontSize(13).fillColor('#092d55').text(`Reports completed (${person.reportCount})`);
    doc.fontSize(11).fillColor('#111');
    if (!person.reports.length) {
      doc.text('No Melonly CAD reports were attributed to this member in the last 7 days.');
    } else {
      for (const report of person.reports.slice(0, 40)) {
        const raw = Number(report.createdAt || 0);
        const when = raw
          ? new Date(raw < 1e12 ? raw * 1000 : raw).toLocaleString('en-US')
          : 'Unknown time';
        doc.text(`• ${report.type} — ${when}`);
      }
    }
    doc.moveDown(1.5);
    doc.fontSize(9).fillColor('#666').text(
      'Generated from Melonly CAD / PCSO roster data for roleplay administration.',
    );
    doc.end();
  });

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
