import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import {
  cadRecordCreatedMs,
  renderPcsoWeeklyReportPdf,
  resolveCadRecordDiscordId,
  sanitizeWeeklyReportPerson,
} from '../utils/pcsoAdminData.js';

function pdfVisibleText(pdf) {
  const raw = pdf.toString('latin1');
  const payload = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    try {
      return inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      return '';
    }
  }).join('\n');
  return [...payload.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('');
}

test('weekly personnel PDF uses the official PCSO record layout', async () => {
  const pdf = await renderPcsoWeeklyReportPdf({
    roleplayName: 'Judah Briggs',
    callsign: '100',
    rank: 'Superintendent',
    discordId: '1044686997194805280',
    shiftHoursLabel: '0m',
    reportCount: 0,
    reports: [],
  }, '2026-09-10T20:20:16.000Z', '2026-09-17T20:20:16.000Z');

  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 2000);
  assert.equal(pdf.subarray(0, 4).toString('utf8'), '%PDF');
  const text = pdfVisibleText(pdf);
  assert.match(text, /PINELLAS COUNTY SHERIFF/);
  assert.match(text, /Weekly Personnel Report/);
  assert.match(text, /JUDAH BRIGGS/);
  assert.match(text, /CLEARWATER ROLEPLAY/);
  assert.match(text, /IMPORTANT NOTE AND DISCLAIMER/);
});

test('weekly reports match nested createdBy Discord ids', async () => {
  const discordId = await resolveCadRecordDiscordId('', {
    id: '2026-001500',
    createdByUserId: '7184693640411746304',
    createdBy: { id: '7184693640411746304', discordId: '1128547120304095272' },
    createdAt: Date.now(),
  }, new Map(), new Set(['1128547120304095272']));
  assert.equal(discordId, '1128547120304095272');
});

test('weekly reports match a Discord id already on the roster', async () => {
  const discordId = await resolveCadRecordDiscordId('', {
    createdByUserId: '1128547120304095272',
    createdAt: Date.now(),
  }, new Map(), new Set(['1128547120304095272']));
  assert.equal(discordId, '1128547120304095272');
});

test('cadRecordCreatedMs accepts unix seconds and milliseconds', () => {
  assert.equal(cadRecordCreatedMs({ createdAt: 1_700_000_000 }), 1_700_000_000_000);
  assert.equal(cadRecordCreatedMs({ createdAt: 1_700_000_000_000 }), 1_700_000_000_000);
});

test('sanitizeWeeklyReportPerson keeps the on-screen report list for PDF', async () => {
  const person = sanitizeWeeklyReportPerson({
    callsign: '1100',
    roleplayName: 'Cole Harrison',
    rank: 'Major',
    reportCount: 8,
    reports: [
      { type: 'Vehicle Registration', createdAt: Date.now() },
      { type: 'General Citation', createdAt: Date.now() },
    ],
  }, '1128547120304095272');
  assert.equal(person.discordId, '1128547120304095272');
  assert.equal(person.callsign, '1100');
  assert.equal(person.reports.length, 2);
  const pdf = await renderPcsoWeeklyReportPdf(person, '2026-09-11T00:00:00.000Z', '2026-09-18T00:00:00.000Z');
  const text = pdfVisibleText(pdf);
  assert.match(text, /COLE HARRISON/);
  assert.match(text, /VEHICLE REGISTRATION/);
});
