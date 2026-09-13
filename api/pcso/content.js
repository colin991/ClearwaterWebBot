/** Public PCSO site content (news + events). Empty until admin publishes entries. */
const EMPTY_CONTENT = Object.freeze({
  news: [],
  events: [],
  updatedAt: null,
});

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return response.end(JSON.stringify({
    ok: true,
    ...EMPTY_CONTENT,
  }));
}
