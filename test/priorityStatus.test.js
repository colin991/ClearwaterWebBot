import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIORITY_START_HINT,
  formatActivePriorityStatus,
  priorityStartMessageCommand,
} from '../utils/priorityRequest.js';

test('priority start uses the hint command instead of :m', () => {
  assert.equal(
    priorityStartMessageCommand({ requesterUsername: 'HostUser', details: 'bank' }),
    PRIORITY_START_HINT,
  );
  assert.match(PRIORITY_START_HINT, /^:h The priority timer is active/);
  assert.doesNotMatch(PRIORITY_START_HINT, /^:m /);
});

test('active priority status lists who has it', () => {
  const none = formatActivePriorityStatus({ status: 'pending' }, 1_000);
  assert.match(none.description, /no active priority/i);

  const active = formatActivePriorityStatus({
    status: 'active',
    requesterUsername: 'HostUser',
    details: 'bank robbery',
    participants: [{ username: 'HostUser' }, { username: 'Partner' }],
    vehicles: ['Navara'],
    endsAt: 1_000 + 10 * 60 * 1000,
  }, 1_000);
  assert.equal(active.title, 'Active priority');
  assert.match(active.description, /HostUser/);
  assert.match(active.description, /Partner/);
  assert.match(active.description, /bank robbery/);
  assert.match(active.description, /10m/);
});
