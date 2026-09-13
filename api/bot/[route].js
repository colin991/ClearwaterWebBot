import action from '../../lib/bot-api/action.js';
import status from '../../lib/bot-api/status.js';

const ROUTES = {
  action,
  status,
};

function routeName(request) {
  const fromQuery = request?.query?.route;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  if (Array.isArray(fromQuery) && fromQuery[0]) return String(fromQuery[0]);

  try {
    const url = new URL(request.url || '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    const botIndex = parts.indexOf('bot');
    if (botIndex >= 0 && parts[botIndex + 1]) return parts[botIndex + 1];
  } catch {
    // ignore
  }
  return '';
}

export default async function handler(request, response) {
  const name = routeName(request);
  const routeHandler = ROUTES[name];
  if (!routeHandler) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    return response.end(JSON.stringify({ error: `Unknown bot API route: ${name || '(empty)'}` }));
  }
  return routeHandler(request, response);
}
