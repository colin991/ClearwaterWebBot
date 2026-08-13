import { sendJson } from '../lib/discord-auth.js';
import {
  handleDiscordCallback,
  handleDiscordStart,
  handleLogout,
  handleMe,
  handleRobloxCallback,
  handleRobloxStart,
  handleRobloxSync,
} from '../lib/auth-handlers.js';

function routeKey(request) {
  const fromQuery = request.query?.route;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery.replace(/^\/+|\/+$/g, '');
  if (Array.isArray(fromQuery) && fromQuery[0]) return String(fromQuery[0]).replace(/^\/+|\/+$/g, '');

  try {
    const pathname = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`).pathname;
    const match = pathname.match(/^\/api\/auth\/(.+?)\/?$/);
    return match ? match[1].replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

export default async function handler(request, response) {
  const route = routeKey(request);

  if (route === 'discord') return handleDiscordStart(request, response);
  if (route === 'discord/callback') return handleDiscordCallback(request, response);
  if (route === 'me') return handleMe(request, response);
  if (route === 'logout') return handleLogout(request, response);
  if (route === 'roblox') return handleRobloxStart(request, response);
  if (route === 'roblox/callback') return handleRobloxCallback(request, response);
  if (route === 'roblox/sync') return handleRobloxSync(request, response);

  return sendJson(response, 404, { error: 'Not found' });
}
