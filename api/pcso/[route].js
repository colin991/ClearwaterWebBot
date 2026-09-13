import activeCalls from '../../lib/pcso-api/active-calls.js';
import admin from '../../lib/pcso-api/admin.js';
import content from '../../lib/pcso-api/content.js';
import jail from '../../lib/pcso-api/jail.js';
import radioLogs from '../../lib/pcso-api/radio-logs.js';
import weeklyReport from '../../lib/pcso-api/weekly-report.js';

const ROUTES = {
  'active-calls': activeCalls,
  admin,
  content,
  jail,
  'radio-logs': radioLogs,
  'weekly-report': weeklyReport,
};

function routeName(request) {
  const fromQuery = request?.query?.route;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  if (Array.isArray(fromQuery) && fromQuery[0]) return String(fromQuery[0]);

  try {
    const url = new URL(request.url || '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    // /api/pcso/<route>
    const pcsoIndex = parts.indexOf('pcso');
    if (pcsoIndex >= 0 && parts[pcsoIndex + 1]) return parts[pcsoIndex + 1];
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
    return response.end(JSON.stringify({ error: `Unknown PCSO API route: ${name || '(empty)'}` }));
  }
  return routeHandler(request, response);
}
