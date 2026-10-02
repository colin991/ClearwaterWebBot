import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalCwd = process.cwd();
const workdir = await mkdtemp(join(tmpdir(), 'cw-pcso-news-'));
process.chdir(workdir);
const news = await import('../utils/pcsoDiscordNews.js');
const content = await import('../utils/pcsoSiteContent.js');
const { renderNewsCarouselHtml, renderNewsDirectoryHtml } = await import('../pcso-events.js');
process.chdir(originalCwd);

test.after(async () => {
  await rm(workdir, { recursive: true, force: true });
});

const hex = (ms) => Math.floor(ms / 1000).toString(16);
const discordUrl = (exMs) => `https://cdn.discordapp.com/attachments/1/2/photo.png?ex=${hex(exMs)}&is=aa&hm=bb&`;

test('only expired or nearly expired Discord attachment links need a refresh', () => {
  const now = Date.parse('2026-10-02T00:00:00Z');
  assert.equal(news.discordAttachmentNeedsRefresh(discordUrl(now - 1000), now), true);
  assert.equal(news.discordAttachmentNeedsRefresh(discordUrl(now + 30 * 60 * 1000), now), true);
  assert.equal(news.discordAttachmentNeedsRefresh(discordUrl(now + 12 * 60 * 60 * 1000), now), false);
  assert.equal(news.discordAttachmentNeedsRefresh('https://cdn.discordapp.com/attachments/1/2/a.png', now), true);
  assert.equal(news.discordAttachmentNeedsRefresh('https://x.blob.vercel-storage.com/a.png', now), false);
  assert.equal(news.discordAttachmentNeedsRefresh('https://cdn.discordapp.com/avatars/1/a.png', now), false);
});

test('Discord photo posts are titled Press Release and get fresh image links', async () => {
  process.chdir(workdir);
  try {
    const stale = discordUrl(Date.now() - 60_000);
    const fresh = discordUrl(Date.now() + 24 * 60 * 60 * 1000);
    await news.syncPcsoNewsImageMessage({
      id: '99',
      channelId: news.PCSO_NEWS_IMAGE_CHANNEL_ID,
      content: '',
      url: 'https://discord.com/channels/1/2/99',
      createdTimestamp: Date.now(),
      member: { displayName: '100 | Judah Briggs' },
      attachments: new Map([['a', { url: stale, contentType: 'image/png' }]]),
    });
    const before = await content.getPcsoSiteContent();
    assert.equal(before.news[0].title, 'Press Release');

    const calls = [];
    const client = {
      rest: {
        post: async (route, { body }) => {
          calls.push({ route, body });
          return { refreshed_urls: [{ original: stale, refreshed: fresh }] };
        },
      },
    };
    news.resetPcsoNewsImageRefreshForTests();
    const after = await news.refreshPcsoNewsImages(client, before);
    assert.deepEqual(calls, [{ route: '/attachments/refresh-urls', body: { attachment_urls: [stale] } }]);
    assert.equal(after.news[0].imageUrl, fresh);
    assert.equal((await content.getPcsoSiteContent()).news[0].imageUrl, fresh);

    assert.equal(await news.refreshPcsoNewsImages(client, after), after);
    assert.equal(calls.length, 1);
  } finally {
    process.chdir(originalCwd);
  }
});

test('a failed refresh keeps the existing content', async () => {
  news.resetPcsoNewsImageRefreshForTests();
  const input = { news: [{ imageUrl: discordUrl(Date.now() - 1000) }] };
  const client = { rest: { post: async () => { throw new Error('discord down'); } } };
  assert.equal(await news.refreshPcsoNewsImages(client, input), input);
});

test('news cards open their photo in a pop-up', () => {
  const item = {
    title: 'Press Release',
    summary: 'Photo shared by 100 | Judah Briggs.',
    imageUrl: 'https://cdn.discordapp.com/attachments/1/2/p.png?ex=1',
    linkUrl: 'https://discord.com/channels/1/2/99',
    discordMessageId: '99',
  };
  const card = renderNewsCarouselHtml([item]);
  assert.match(card, /<button type="button" class="pcso-news-card-image pcso-news-image-button"[^>]*data-news-image="https:\/\/cdn\.discordapp\.com/);
  assert.match(card, /<button type="button" class="pcso-news-card-more" data-news-image=/);
  assert.doesNotMatch(card, /href="https:\/\/discord\.com/);
  assert.match(card, /<h3>Press Release<\/h3>/);

  const linked = renderNewsCarouselHtml([{ ...item, discordMessageId: '', linkUrl: '/news/story' }]);
  assert.match(linked, /<a class="pcso-news-card-more" href="\/news\/story"/);

  const row = renderNewsDirectoryHtml([item]);
  assert.match(row, /class="pcso-news-row-image pcso-news-image-button"/);
  assert.doesNotMatch(row, /Read more/);
});
