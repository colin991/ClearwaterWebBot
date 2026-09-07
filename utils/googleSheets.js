import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

let cachedToken = null;

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function credentials(settings) {
  const email = String(settings?.googleServiceAccountEmail || '').trim();
  const privateKey = String(settings?.googlePrivateKey || '').replace(/\\n/g, '\n').trim();
  if (!email || !privateKey) {
    throw new Error(
      'Google Sheets is not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY on the bot host.',
    );
  }
  return { email, privateKey };
}

export function isGoogleSheetsConfigured(settings) {
  return Boolean(
    String(settings?.googleServiceAccountEmail || '').trim()
    && String(settings?.googlePrivateKey || '').trim(),
  );
}

async function getAccessToken(settings) {
  const { email, privateKey } = credentials(settings);
  if (cachedToken?.email === email && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(privateKey))}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Google service-account authentication failed (${response.status}).`);
  }

  cachedToken = {
    email,
    value: body.access_token,
    expiresAt: Date.now() + (Math.max(60, Number(body.expires_in) || 3600) * 1000),
  };
  return cachedToken.value;
}

async function sheetsFetch(settings, url, options = {}) {
  const token = await getAccessToken(settings);
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(body?.error?.message || body?.error || response.statusText || 'request failed')
      .slice(0, 300);
    throw new Error(`Google Sheets request failed (${response.status}): ${detail}`);
  }
  return body;
}

export async function readGoogleSheetValues(settings, spreadsheetId, range) {
  const id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('PCSO_ROSTER_SPREADSHEET_ID is not configured.');
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`);
  url.searchParams.set('majorDimension', 'ROWS');
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
  const result = await sheetsFetch(settings, url);
  return Array.isArray(result?.values) ? result.values : [];
}

export async function batchUpdateGoogleSheetValues(settings, spreadsheetId, updates) {
  if (!Array.isArray(updates) || !updates.length) return 0;
  const id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('PCSO_ROSTER_SPREADSHEET_ID is not configured.');

  await sheetsFetch(settings, `${SHEETS_API}/${encodeURIComponent(id)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map(({ range, value }) => ({
        range,
        majorDimension: 'ROWS',
        values: [[value ?? '']],
      })),
    }),
  });
  return updates.length;
}
