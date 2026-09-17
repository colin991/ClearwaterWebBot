import assert from 'node:assert/strict';
import test from 'node:test';
import { applyJailTenure, formatJailHold } from '../utils/jailRoster.js';
import { validatePcsoSiteForm } from '../utils/pcsoSiteForms.js';

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

test('public records require Discord and complaints require trooper fields', () => {
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
    () => validatePcsoSiteForm('complaint', { trooperName: 'Smith' }),
    /badge/,
  );
  const complaint = validatePcsoSiteForm('complaint', {
    trooperName: 'Smith',
    badgeNumber: '142',
    location: 'Bank of Liberty',
    reason: 'Use of force',
    description: 'Trooper tased without warning',
    witnesses: 'Jordan',
  });
  assert.equal(complaint.fields.witnesses, 'Jordan');
});
