const INTERNET_VERSION = '20260808-clickable-mentions-1';

export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.end(JSON.stringify({ version: INTERNET_VERSION }));
}
