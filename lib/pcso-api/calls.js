import { sendJson } from '../discord-auth.js';
import { fetchPcsoAssignedMelonlyCalls } from '../../utils/melonly.js';
import { PINELLAS_MELONLY_DEPARTMENT_ID } from '../../utils/pinellasShiftPanel.js';

async function fetchFromBot() {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return { ok: false, reason: 'not_configured' };
  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: 'calls', action: 'list' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return { ok: false, error: body.error || `Bot returned HTTP ${upstream.status}` };
    return { ok: true, body };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not reach the bot.' };
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }

  const fromBot = await fetchFromBot();
  if (fromBot.ok) return sendJson(response, 200, fromBot.body);

  const apiKey = process.env.MELONLY_API_KEY?.trim() || '';
  if (apiKey) {
    try {
      const result = await fetchPcsoAssignedMelonlyCalls(apiKey, {
        pinellasDepartmentId: PINELLAS_MELONLY_DEPARTMENT_ID,
      });
      return sendJson(response, 200, {
        ok: true,
        configured: true,
        calls: result.calls,
        message: result.calls.length ? undefined : 'No PCSO units are assigned to an active call.',
      });
    } catch (error) {
      return sendJson(response, 502, { error: error?.message || 'Active calls could not be loaded.', calls: [] });
    }
  }

  return sendJson(response, fromBot.reason === 'not_configured' ? 503 : 502, {
    error: fromBot.error || 'Active calls are unavailable.',
    calls: [],
    configured: false,
  });
}
