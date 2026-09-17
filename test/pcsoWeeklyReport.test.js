import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { renderPcsoWeeklyReportPdf } from '../utils/pcsoAdminData.js';

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
