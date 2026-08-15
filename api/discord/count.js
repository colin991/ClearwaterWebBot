import { cachedJson, isAppFetchRequest, rejectPublicBrowse } from '../../lib/api-guard.js';

const INVITE_CODE = '839teFCwB';

export default async function handler(request, response) {
  if (rejectPublicBrowse(request, response)) return;
  if (!isAppFetchRequest(request)) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.end('Not found');
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=600, max-age=60');
  response.setHeader('X-Robots-Tag', 'noindex');

  const payload = await cachedJson('discord-count-v1', 120_000, async () => {
    try {
      const inviteResponse = await fetch(`https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true`);
      if (!inviteResponse.ok) throw new Error('Discord invite unavailable');

      const invite = await inviteResponse.json();
      const memberCount = Number(invite.approximate_member_count);
      if (!Number.isInteger(memberCount)) throw new Error('Discord member count unavailable');
      return { memberCount, status: 200 };
    } catch {
      return { error: 'Discord member count unavailable', status: 503 };
    }
  });

  response.statusCode = payload.status || 200;
  const { status, ...body } = payload;
  return response.end(JSON.stringify(body));
}
