import test from 'node:test';
import assert from 'node:assert/strict';
import { erlcResponseRetrySeconds } from '../utils/erlc.js';

test('429 uses longest body/header/reset delay and adds a boundary margin', () => {
  const response = new Response('{}', { status: 429, headers: { 'retry-after': '10', 'x-ratelimit-reset': '1800000030' } });
  assert.equal(erlcResponseRetrySeconds(response, { retry_after: 5 }, 1800000000000), 31);
});
test('successful exhausted responses honor reset while nonexhausted responses do not', () => {
  const headers = { 'x-ratelimit-reset': '1800000020', 'x-ratelimit-remaining': '0' };
  assert.equal(erlcResponseRetrySeconds(new Response('{}', { headers }), {}, 1800000000000), 21);
  headers['x-ratelimit-remaining'] = '4';
  assert.equal(erlcResponseRetrySeconds(new Response('{}', { headers }), {}, 1800000000000), 0);
});
test('missing 429 headers still start a shared cooldown', () => {
  assert.equal(erlcResponseRetrySeconds(new Response('{}', { status: 429 })), 6);
});
