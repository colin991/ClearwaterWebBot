import assert from 'node:assert/strict';
import test from 'node:test';
import { applyJailTenure, formatJailHold } from '../utils/jailRoster.js';
import { savePcsoSiteForm, validatePcsoSiteForm } from '../utils/pcsoSiteForms.js';

test('formatJailHold uses minutes then hours', () => {
  assert.equal(formatJailHold(45_000), '45 sec');
  assert.equal(formatJailHold(120_000), '2 min');
  assert.equal(formatJailHold(3_660_000), '1h 1m');
});

test('applyJailTenure keeps first-seen time and drops released inmates', () => {
  const now = 1_700_000_000_000;
  const first = applyJailTenure(
    [{ robloxUsername: 'buttercup75075', robloxId: '1' }],
    {},
    now,
  );
  assert.equal(first.inmates[0].heldFor, '1 sec');
  const later = applyJailTenure(
    [{ robloxUsername: 'buttercup75075', robloxId: '1' }],
    first.occupants,
    now + 8 * 60_000,
  );
  assert.equal(later.inmates[0].heldFor, '8 min');
  const empty = applyJailTenure([], later.occupants, now + 9 * 60_000);
  assert.deepEqual(empty.occupants, {});
  assert.equal(empty.inmates.length, 0);
});

test('validatePcsoSiteForm accepts anonymous tips and map reports', () => {
  const tip = validatePcsoSiteForm('crime-stoppers', { tip: 'Stolen vehicle on 1st' });
  assert.equal(tip.fields.tip.includes('Stolen'), true);

  assert.throws(
    () => validatePcsoSiteForm('police-report', { description: 'Crash on the highway' }),
    /map/,
  );
  const report = validatePcsoSiteForm('police-report', {
    name: 'Alex',
    incident: 'Crash',
    description: 'Two cars at the light',
    mapLeft: 0.42,
    mapTop: 0.61,
  });
  assert.equal(report.fields.mapLeft, 0.42);
  assert.equal(report.fields.mapTop, 0.61);
});

test('public records require Discord and complaints cannot bypass the signed-in ticket flow', () => {
  assert.throws(
    () => validatePcsoSiteForm('public-records', { subjectType: 'deputy', subject: 'N. Richards' }),
    /Sign in/,
  );
  const records = validatePcsoSiteForm(
    'public-records',
    { subjectType: 'case', subject: '24-1102', details: 'Need the report' },
    { id: '99', username: 'requester' },
  );
  assert.equal(records.fields.subjectType, 'case');
  assert.equal(records.requester.discordId, '99');

  assert.throws(
    () => validatePcsoSiteForm('complaint', {
      trooperName: 'Smith', badgeNumber: '142', location: 'Bank', reason: 'Force', description: 'Tased without warning',
    }, { id: '99', username: 'requester' }),
    /Sign in on the complaint page/,
  );
});

test('savePcsoSiteForm still returns a record on a read-only Vercel filesystem', async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    const record = await savePcsoSiteForm({
      kind: 'crime-stoppers',
      fields: { tip: 'Someone is selling drugs at the pier' },
    });
    assert.match(record.id, /^form_/);
    assert.equal(record.kind, 'crime-stoppers');
    assert.equal(record.status, 'submitted');
  } finally {
    if (previous == null) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
