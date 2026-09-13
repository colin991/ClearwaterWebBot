import { fetchJailInmates } from '../../utils/jailRoster.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=10');

  const erlcServerKey = process.env.ERLC_SERVER_KEY?.trim();
  const melonlyApiKey = process.env.MELONLY_API_KEY?.trim() || '';

  if (!erlcServerKey) {
    response.statusCode = 503;
    return response.end(JSON.stringify({
      inmates: [],
      configured: false,
      error: 'ER:LC is not configured.',
      message: 'Jail occupancy is unavailable because ER:LC is not configured.',
    }));
  }

  try {
    const result = await fetchJailInmates({ erlcServerKey, melonlyApiKey });
    return response.end(JSON.stringify({
      configured: true,
      updatedAt: new Date().toISOString(),
      inmates: result.inmates,
      message: result.inmates.length
        ? undefined
        : 'No one is currently in the jail booking zone.',
    }));
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    response.statusCode = status;
    return response.end(JSON.stringify({
      configured: true,
      inmates: [],
      error: error?.message || 'Jail occupancy could not be loaded.',
      message: 'Jail occupancy could not be loaded right now.',
    }));
  }
}
