import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInternetPostPayload,
  requiredInternetForumTags,
} from '../utils/discordInternetFeed.js';

test('Internet feed payload uses unicode emojis and omits empty mention user lists', () => {
  const payload = buildInternetPostPayload({
    id: 'post-1',
    authorId: '123456789012345678',
    username: 'Raven_21044',
    content: 'Hello Internet',
    likes: [],
    createdAt: '2026-09-16T00:00:00.000Z',
  });
  const json = JSON.stringify(payload);
  assert.match(json, /❤️|❤/);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(payload.allowedMentions, 'users'), false);
});

test('required forum tags stay unique', () => {
  const flags = { has: () => true };
  const channel = {
    flags,
    availableTags: [{ id: '111' }, { id: '111' }, { id: '222' }],
  };
  assert.deepEqual(requiredInternetForumTags(channel), ['111']);
  assert.deepEqual(requiredInternetForumTags({ flags: { has: () => false }, availableTags: [{ id: '111' }] }), []);
});
