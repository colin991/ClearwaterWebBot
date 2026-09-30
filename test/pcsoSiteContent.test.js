import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePcsoSiteContent } from '../utils/pcsoSiteContent.js';

test('Discord news metadata is retained while expired news is hidden', () => {
  const content = normalizePcsoSiteContent({
    news: [
      {
        id: 'active',
        title: 'Active image',
        imageUrl: 'https://cdn.discordapp.com/active.png',
        discordMessageId: '1516000000000000001',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      {
        id: 'expired',
        title: 'Expired image',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
  });
  assert.equal(content.news.length, 1);
  assert.equal(content.news[0].id, 'active');
  assert.equal(content.news[0].discordMessageId, '1516000000000000001');
});
