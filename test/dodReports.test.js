import assert from 'node:assert/strict';
import test from 'node:test';
import custodyReport from '../commands/custody-report.js';
import deployment from '../commands/deployment.js';
import dodInfract from '../commands/dod-infract.js';
import dodPromote from '../commands/dod-promote.js';
import incidentReport from '../commands/incident-report.js';
import manualLink from '../commands/ml.js';
import {
  DOD_CUSTODY_CHANNEL_ID,
  DOD_DEPLOYMENT_CHANNEL_ID,
  DOD_INCIDENT_CHANNEL_ID,
  DOD_STAFF_LOG_CHANNEL_ID,
  DOD_GUILD_ID,
  requireMinimumWords,
  wordCount,
} from '../utils/dodReports.js';

test('Detentions commands use the requested destination channels', () => {
  assert.equal(DOD_GUILD_ID, '1536695906768781362');
  assert.equal(DOD_CUSTODY_CHANNEL_ID, '1545195433792643143');
  assert.equal(DOD_INCIDENT_CHANNEL_ID, '1545195332822900807');
  assert.equal(DOD_STAFF_LOG_CHANNEL_ID, '1545210075600257074');
  assert.equal(DOD_DEPLOYMENT_CHANNEL_ID, '1545195147703357541');
});

test('Detentions commands register only in the Divisional Hub', () => {
  for (const command of [custodyReport, incidentReport, dodInfract, dodPromote, deployment, manualLink]) {
    assert.deepEqual(command.guildIds, [DOD_GUILD_ID]);
  }
});

test('incident narratives enforce a real 50-word minimum', () => {
  assert.equal(wordCount('one two three'), 3);
  assert.throws(() => requireMinimumWords('too short', 50, 'Incident description'), /at least 50 words/);
  assert.doesNotThrow(() => requireMinimumWords(Array.from({ length: 50 }, (_, index) => `word${index}`).join(' '), 50, 'Action response'));
});
