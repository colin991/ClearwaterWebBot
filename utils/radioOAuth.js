/**
 * Discord sign-in for the Clearwater Radio app.
 * The app catches the OAuth redirect on a fixed loopback port and hands the code to the relay,
 * which exchanges it here so the client secret never leaves the bot host.
 */
export const RADIO_OAUTH_REDIRECT_URI = 'http://127.0.0.1:53682/callback';

export function radioOAuthConfig(env = process.env) {
  const clientId = (env.RADIO_OAUTH_CLIENT_ID || env.DISCORD_CLIENT_ID || '').trim();
  const clientSecret = (env.RADIO_OAUTH_CLIENT_SECRET || env.DISCORD_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: RADIO_OAUTH_REDIRECT_URI };
}

/** @returns {Promise<string>} the Discord user ID that approved the sign-in. */
export async function exchangeRadioCode(code, env = process.env, fetchImpl = fetch) {
  const config = radioOAuthConfig(env);
  if (!config) throw new Error('Discord sign-in is not set up on the bot host.');
  const tokenResponse = await fetchImpl('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenResponse.ok) throw new Error(`Discord sign-in failed (${tokenResponse.status}).`);
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) throw new Error('Discord sign-in failed.');
  const userResponse = await fetchImpl('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!userResponse.ok) throw new Error(`Discord sign-in failed (${userResponse.status}).`);
  const user = await userResponse.json();
  const id = String(user?.id || '');
  if (!/^\d{15,22}$/.test(id)) throw new Error('Discord sign-in failed.');
  return id;
}
