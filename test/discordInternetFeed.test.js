import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInternetPostPayload,
  requiredInternetForumTags,
} from '../utils/discordInternetFeed.js';

test('Internet feed payload uses profile layout with like/repost/reply/bookmark', () => {
  const payload = buildInternetPostPayload({
    id: 'post-1',
    authorId: '123456789012345678',
    displayName: 'Iceberg',
    username: 'Iceberg2310',
    content: 'Cxrsed is so tuff',
    likes: ['1'],
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    createdAt: '2026-09-20T21:14:00.000Z',
  }, {
    users: {
      '999': { following: ['123456789012345678'] },
    },
    posts: [],
  });
  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, /Chirper/i);
  assert.match(json, /Iceberg/);
  assert.match(json, /@Iceberg2310/);
  assert.match(json, /1 follower/);
  assert.match(json, /Cxrsed is so tuff/);
  assert.match(json, /❤️|❤/);
  assert.match(json, /cw-internet-repost:/);
  assert.match(json, /cdn\.discordapp\.com\/embed\/avatars/);
  assert.match(json, /cw-internet-more:/);
  assert.doesNotMatch(json, /React to Post/);
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
