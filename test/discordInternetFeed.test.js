import sharp from 'sharp';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import {
  buildInternetPostPayload,
  createInternetFeedController,
  requiredInternetForumTags,
} from '../utils/discordInternetFeed.js';

test('Internet feed payload uses profile layout with image and no bookmark button', async () => {
  const payload = await buildInternetPostPayload({
    id: 'post-1',
    authorId: '123456789012345678',
    displayName: 'Iceberg',
    username: 'Iceberg2310',
    content: 'Cxrsed is so tuff',
    likes: ['1'],
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
  assert.match(json, /attachment:\/\/internet-post.png/);
  assert.doesNotMatch(json, /cw-internet-bookmark:/);
  const metadata = await sharp(payload.files[0].attachment).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1000);
  assert.equal(payload.components.at(-1).components.length, 4);
  assert.match(json, /cw-internet-more:/);
  assert.doesNotMatch(json, /React to Post/);
  assert.doesNotMatch(json, /media_gallery/i);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(payload.allowedMentions, 'users'), false);
});

test('Internet replies are image cards with four action buttons', async () => {
  const payload = await buildInternetPostPayload({
    id: 'reply-1',
    parentId: 'post-1',
    authorId: '2305',
    displayName: '2305 | jacksondoesdevs',
    username: 'jacksonsdc_ig',
    content: 'What cannon said',
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
  assert.equal((await sharp(payload.files[0].attachment).metadata()).format, 'png');
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


test('controller sends image payloads and replaces previous attachments on edits', async () => {
  const sent = [], edited = [];
  const channel = { isTextBased: () => true,
    send: async payload => { sent.push(payload); return { id: '123456789012345678' }; },
    messages: { edit: async (id, payload) => edited.push(payload) },
  };
  const client = { isReady: () => true, channels: { fetch: async () => channel } };
  const controller = createInternetFeedController(client, { internetFeedChannelId: '123' });
  const post = { id: 'post', username: 'Player', content: 'Hello', discordFeedMessageId: '123456789012345678' };
  const store = { users: {}, posts: [] };
  await controller.announce(post, store); await controller.update(post, store);
  assert.equal(sent.length, 1); assert.equal(edited.length, 1);
  assert.equal((await sharp(sent[0].files[0].attachment).metadata()).format, 'png');
  assert.deepEqual(edited[0].attachments, []);
  assert.deepEqual(edited[0].embeds, []);
});

test('media is included in image card and long markup-like text renders safely', async () => {
  const media = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const post = { id: 'media', username: 'Test', content: '<b>Hello & goodbye</b> '.repeat(30) };
  const plain = await buildInternetPostPayload(post);
  const withMedia = await buildInternetPostPayload({ ...post, imageUrl: 'data:image/png;base64,' + media.toString('base64') });
  const a = await sharp(plain.files[0].attachment).metadata();
  const b = await sharp(withMedia.files[0].attachment).metadata();
  assert.equal(b.height - a.height, 224);
});
