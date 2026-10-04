import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOD_CUSTODY_CHANNEL_ID,
  DOD_DEPLOYMENT_CHANNEL_ID,
  DOD_INCIDENT_CHANNEL_ID,
  DOD_STAFF_LOG_CHANNEL_ID,
  requireMinimumWords,
  wordCount,
} from '../utils/dodReports.js';

test('Detentions commands use the requested destination channels', () => {
  assert.equal(DOD_CUSTODY_CHANNEL_ID, '1545195433792643143');
  assert.equal(DOD_INCIDENT_CHANNEL_ID, '1545195332822900807');
  assert.equal(DOD_STAFF_LOG_CHANNEL_ID, '1545210075600257074');
  assert.equal(DOD_DEPLOYMENT_CHANNEL_ID, '1545195147703357541');
});

test('incident narratives enforce a real 50-word minimum', () => {
  assert.equal(wordCount('one two three'), 3);
  assert.throws(() => requireMinimumWords('too short', 50, 'Incident description'), /at least 50 words/);
  assert.doesNotThrow(() => requireMinimumWords(Array.from({ length: 50 }, (_, index) => `word${index}`).join(' '), 50, 'Action response'));
});
