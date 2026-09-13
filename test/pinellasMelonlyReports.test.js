import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMelonlyReportPdf,
  recordFields,
  resolveReportSubmitter,
} from '../utils/pinellasMelonlyReports.js';

const sampleArrest = {
  id: '2026-001446',
  label: 'Arrest Report',
  agency: 'Pinellas County Sheriff',
  createdByUserId: '7184693640411746304',
  previewData: {
    firstName: { name: 'First Name', value: 'Betty' },
    lastName: { name: 'Last Name', value: 'Sanchez' },
    dob: { name: 'DOB', value: 915321600000 },
    charges: [
      { code: '§784.011', class: 'misdemeanor', counts: 1, fine: 500, jail: 60 },
      { code: '(FL) 316.1935', class: 'felony', counts: 1, fine: 10000, jail: 5 },
    ],
  },
};

test('recordFields flattens Melonly arrest preview data', () => {
  const fields = recordFields(sampleArrest);
  assert.ok(fields.some(([name]) => /first name/i.test(name)));
  assert.ok(fields.some(([, value]) => String(value).includes('Betty')));
  assert.ok(fields.some(([name]) => /charges/i.test(name)));
});

test('resolveReportSubmitter falls back when Melonly id cannot be mapped', async () => {
  const result = await resolveReportSubmitter('', sampleArrest);
  assert.equal(result.discordId, null);
  assert.match(result.label, /Melonly user 7184693640411746304/);
});

test('resolveReportSubmitter returns Melonly when creator is missing', async () => {
  const result = await resolveReportSubmitter('key', { id: '1' });
  assert.equal(result.label, 'Melonly');
  assert.equal(result.discordId, null);
});

test('buildMelonlyReportPdf returns a PDF buffer', async () => {
  const pdf = await buildMelonlyReportPdf(sampleArrest, 'arrest', '<@123456789012345678>');
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 500);
  assert.equal(pdf.subarray(0, 4).toString('utf8'), '%PDF');
});

test('resolveReportSubmitter pings Discord id nested on createdBy', async () => {
  const result = await resolveReportSubmitter('key', {
    id: '2026-001452',
    createdByUserId: '7401840545355534336',
    createdBy: {
      id: '7401840545355534336',
      discordId: '987654321098765432',
    },
  });
  assert.equal(result.discordId, '987654321098765432');
  assert.equal(result.label, '<@987654321098765432>');
});
