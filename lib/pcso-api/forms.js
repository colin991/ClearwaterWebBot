import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';
import { validatePcsoSiteForm, savePcsoSiteForm } from '../../utils/pcsoSiteForms.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 40_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function sessionUser(request) {
  try {
    const { sessionSecret } = getAuthConfig();
    return readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
  } catch {
    return null;
  }
}

async function postToBot(record) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return { ok: false, reason: 'not_configured' };
  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/site-form`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(12_000),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { ok: false, error: body.error || `Bot returned HTTP ${upstream.status}` };
    }
    return { ok: true, body };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not reach the bot.' };
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  if (!isSameSiteRequest(request)) {
    return sendJson(response, 403, { error: 'Invalid request origin.' });
  }

  try {
    const body = await readBody(request);
    const parsed = validatePcsoSiteForm(body.kind, body.fields || body, sessionUser(request));
    const record = await savePcsoSiteForm(parsed);
    const posted = await postToBot(record);
    const onVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (!posted.ok) {
      if (posted.reason === 'not_configured' && !onVercel) {
        return sendJson(response, 200, {
          ok: true,
          id: record.id,
          posted: false,
          message: parsed.kind === 'crime-stoppers'
            ? 'Your anonymous tip was submitted.'
            : parsed.kind === 'public-records'
              ? 'Your public records request was submitted. You will get a Discord DM if it is accepted or denied.'
              : 'Your report was submitted.',
        });
      }
      return sendJson(response, posted.reason === 'not_configured' ? 503 : 502, {
        error: posted.error || 'The report could not be delivered to PCSO Discord.',
        id: record.id,
      });
    }
    return sendJson(response, 200, {
      ok: true,
      id: record.id,
      posted: Boolean(posted.body?.posted),
      message: parsed.kind === 'crime-stoppers'
        ? 'Your anonymous tip was submitted.'
        : parsed.kind === 'public-records'
          ? 'Your public records request was submitted. You will get a Discord DM if it is accepted or denied.'
          : 'Your report was submitted.',
    });
  } catch (error) {
    const message = String(error?.message || 'The form could not be submitted.');
    const status = /Sign in/.test(message) ? 401 : (/read-only|EROFS/i.test(message) ? 502 : 400);
    return sendJson(response, status, { error: message });
  }
}
