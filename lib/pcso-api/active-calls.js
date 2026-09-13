import { fetchPcsoAssignedMelonlyCalls } from '../../utils/melonly.js';

/** Pinellas County Sheriff's Office Melonly department id. */
const PINELLAS_MELONLY_DEPARTMENT_ID = '7470323914464301056';

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
  return response.end(JSON.stringify(body));
}

async function fetchFromBotApi() {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/active-calls`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return {
        ok: false,
        reason: 'upstream_error',
        status: upstream.status,
        error: body?.error || `Bot active-calls returned HTTP ${upstream.status}.`,
        body,
      };
    }
    if (!body || !Array.isArray(body.calls)) {
      return { ok: false, reason: 'bad_payload', error: 'Bot active-calls response was invalid.' };
    }
    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      reason: 'unreachable',
      error: error?.message || 'Could not reach the bot active-calls API.',
    };
  }
}

async function loadLocalMelonlyCalls() {
  const apiKey = process.env.MELONLY_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  const result = await fetchPcsoAssignedMelonlyCalls(apiKey, {
    pinellasDepartmentId: PINELLAS_MELONLY_DEPARTMENT_ID,
  });
  return {
    ok: true,
    body: {
      configured: true,
      source: 'local',
      updatedAt: new Date().toISOString(),
      calls: result.calls,
      message: result.calls.length
        ? undefined
        : 'No active Melonly calls currently have a PCSO unit assigned.',
    },
  };
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Method not allowed' });
  }

  // Prefer the bot host — it already has MELONLY_API_KEY for shift/CAD features.
  const fromBot = await fetchFromBotApi();
  if (fromBot.ok) {
    return sendJson(response, 200, {
      ...fromBot.body,
      configured: true,
      source: 'bot',
    });
  }

  try {
    const local = await loadLocalMelonlyCalls();
    if (local.ok) {
      return sendJson(response, 200, local.body);
    }
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    return sendJson(response, status, {
      configured: true,
      source: 'local',
      calls: [],
      error: error?.message || 'Melonly CAD calls could not be loaded.',
      message: 'Active calls could not be loaded from Melonly right now.',
    });
  }

  const botHint = fromBot.reason === 'not_configured'
    ? 'Set BOT_API_URL + BOT_API_KEY on Vercel (bot already has Melonly), or set MELONLY_API_KEY on Vercel.'
    : (fromBot.error || 'Bot active-calls bridge failed.');

  return sendJson(response, 503, {
    calls: [],
    configured: false,
    source: 'unavailable',
    reason: fromBot.reason || 'not_configured',
    error: 'Melonly is not configured.',
    message: botHint,
  });
}
