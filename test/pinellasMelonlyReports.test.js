import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMelonlyReportPdf,
  buildMelonlyReportPng,
  extractReportSubject,
  personNameMatches,
  recordFields,
  isPcsoStaffCadRecord,
  citationFineAmount,
  reportTypeFor,
  resolveReportSubjectDiscordId,
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

test('report type trusts an explicit citation label over nested MVA text', () => {
  assert.equal(reportTypeFor({
    label: 'General Citation',
    agency: 'Pinellas County Sheriff',
    previewData: { vehicle: 'motor vehicle collision evidence' },
  }), 'citation');
});

test('vehicle registration is civilian CAD, not a PCSO staff report', () => {
  assert.equal(reportTypeFor({
    label: 'Vehicle Registration',
    agency: 'Pinellas County Sheriff',
  }), null);
  assert.equal(isPcsoStaffCadRecord({
    label: 'Vehicle Registration',
    agency: 'Pinellas County Sheriff',
  }), false);
  assert.equal(isPcsoStaffCadRecord({
    label: 'General Citation',
    agency: 'Pinellas County Sheriff',
  }), true);
});

test('warrant CAD logs are not treated as arrest reports', () => {
  assert.equal(reportTypeFor({
    label: 'Warrant Arrest Log',
    agency: 'Pinellas County Sheriff',
  }), 'warrant');
  assert.equal(reportTypeFor({
    label: 'Warrant',
    agency: 'PCSO',
  }), 'warrant');
  assert.equal(reportTypeFor({
    label: 'Arrest Report',
    agency: 'Pinellas County Sheriff',
  }), 'arrest');
});

test('citationFineAmount sums charge fines and ignores ticket numbers', () => {
  assert.equal(citationFineAmount(sampleArrest), 10500);
  assert.equal(citationFineAmount({
    id: '2026-001500',
    label: 'General Citation',
    previewData: {
      ticketNumber: { name: 'Ticket Number', value: '2026001446' },
      fine: { name: 'Fine', value: '$250' },
    },
  }), 250);
  assert.equal(citationFineAmount({
    id: '2026-001501',
    label: 'General Citation',
    ticketAmount: 75,
  }), 75);
  assert.equal(citationFineAmount({
    id: '2026-001502',
    label: 'Arrest Report',
    previewData: { charges: [{ code: '§316', class: 'misdemeanor', counts: 1, jail: 10 }] },
  }), 0);
});

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

test('extractReportSubject reads first and last name', () => {
  const subject = extractReportSubject(sampleArrest);
  assert.equal(subject.firstName, 'Betty');
  assert.equal(subject.lastName, 'Sanchez');
  assert.equal(subject.fullName, 'Betty Sanchez');
});

test('resolveReportSubjectDiscordId uses nested civilian discord id', async () => {
  const discordId = await resolveReportSubjectDiscordId('key', {
    ...sampleArrest,
    civilian: { discordId: '112233445566778899' },
  }, null);
  assert.equal(discordId, '112233445566778899');
});

test('resolveReportSubjectDiscordId reads discord from Melonly civilian field object', async () => {
  const discordId = await resolveReportSubjectDiscordId('key', {
    id: '2026-001462',
    label: 'Vehicle Citation',
    agency: 'Pinellas County Sheriff',
    createdBy: { discordId: '999999999999999999' },
    previewData: {
      civilian: {
        name: 'Civilian',
        value: {
          firstName: 'Andrew',
          lastName: 'Miller',
          discordId: '555555555555555555',
        },
      },
    },
  }, null);
  assert.equal(discordId, '555555555555555555');
});

test('resolveReportSubjectDiscordId does not treat submitter discord as subject', async () => {
  const discordId = await resolveReportSubjectDiscordId('key', {
    ...sampleArrest,
    createdBy: { discordId: '999999999999999999' },
  }, null);
  assert.equal(discordId, null);
});

test('personNameMatches supports PCSO nickname styles', () => {
  const subject = { firstName: 'Andrew', lastName: 'Miller', fullName: 'Andrew Miller' };
  assert.equal(personNameMatches('482 | Andrew Miller', subject), true);
  assert.equal(personNameMatches('482 | A. Miller', subject), true);
  assert.equal(personNameMatches('AndrewMiller', subject), true);
  assert.equal(personNameMatches('1000 | N. Richards', subject), false);
  assert.equal(personNameMatches('Miller', subject), false);
});

test('resolveReportSubjectDiscordId matches guild nickname initial + last', async () => {
  const members = new Map([
    ['111111111111111111', {
      id: '111111111111111111',
      displayName: '482 | A. Miller',
      nickname: '482 | A. Miller',
      user: { bot: false, globalName: 'Andrew', username: 'amiller' },
    }],
  ]);
  const client = {
    guilds: {
      cache: {
        get: () => ({
          members: {
            cache: {
              size: members.size,
              values: () => members.values(),
            },
            fetch: async () => members,
          },
        }),
      },
      fetch: async () => null,
    },
  };
  const discordId = await resolveReportSubjectDiscordId('key', {
    id: '2026-001462',
    label: 'Vehicle Citation',
    agency: 'Pinellas County Sheriff',
    previewData: {
      firstName: { name: 'First Name', value: 'Andrew' },
      lastName: { name: 'Last Name', value: 'Miller' },
    },
  }, client);
  assert.equal(discordId, '111111111111111111');
});

test('buildMelonlyReportPng returns a PNG buffer', async () => {
  const png = await buildMelonlyReportPng(sampleArrest, 'arrest', '<@123456789012345678>');
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 500);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
