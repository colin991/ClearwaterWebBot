import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
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
  assert.equal(Boolean(payload.flags & MessageFlags.IsComponentsV2), true);
  assert.equal(Object.hasOwn(payload, 'embeds'), false);
  assert.match(json, /Iceberg/);
  assert.match(json, /@Iceberg2310/);
  assert.match(json, /1 follower/);
  assert.match(json, /Cxrsed is so tuff/);
  assert.match(json, /1551629795316600942/);
  assert.match(json, /1518386518387851425/);
  assert.match(json, /1540761931797758013/);
  assert.match(json, /cw-internet-repost:/);
  assert.match(json, /cdn\.discordapp\.com\/embed\/avatars/);
  assert.match(json, /cw-internet-more:/);
  assert.doesNotMatch(json, /React to Post/);
  assert.doesNotMatch(json, /media_gallery/i);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(payload.allowedMentions, 'users'), false);
});

test('Internet replies are V2 cards with the photo on the right and four action buttons', () => {
  const payload = buildInternetPostPayload({
    id: 'reply-1',
    parentId: 'post-1',
    authorId: '2305',
    displayName: '2305 | jacksondoesdevs',
    username: 'jacksonsdc_ig',
    content: 'What cannon said',
    imageUrl: 'https://cdn.discordapp.com/attachments/1/2/boat.png',
    createdAt: '2026-09-21T16:10:00.000Z',
  }, { users: {}, posts: [] }, { variant: 'reply' });
  const json = JSON.stringify(payload);
  assert.equal(Boolean(payload.flags & MessageFlags.IsComponentsV2), true);
  assert.equal(Object.hasOwn(payload, 'embeds'), false);
  assert.match(json, /↩ @jacksonsdc_ig replied to this post\./);
  assert.match(json, /What cannon said/);
  assert.match(json, /1551629795316600942/);
  assert.match(json, /1518386518387851425/);
  assert.match(json, /1540761931797758013/);
  assert.match(json, /attachments\/1\/2\/boat\.png/);
  assert.doesNotMatch(json, /cw-internet-bookmark:/);
  assert.doesNotMatch(json, /media_gallery/i);
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
