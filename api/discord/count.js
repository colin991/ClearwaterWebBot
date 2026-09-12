const INVITE_CODE = '839teFCwB';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  try {
    const inviteResponse = await fetch(`https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true`);
    if (!inviteResponse.ok) throw new Error('Discord invite unavailable');

    const invite = await inviteResponse.json();
    const memberCount = Number(invite.approximate_member_count);
    if (!Number.isInteger(memberCount)) throw new Error('Discord member count unavailable');

    return response.end(JSON.stringify({ memberCount }));
  } catch {
    response.statusCode = 503;
    return response.end(JSON.stringify({ error: 'Discord member count unavailable' }));
  }
}
