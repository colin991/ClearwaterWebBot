import { isOwner } from './discord-auth.js';

export async function hasOwnerAccess(user) {
  if (isOwner(user)) return true;
  if (!user?.id) return false;

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return false;

  try {
    const url = new URL(`${apiUrl}/api/access`);
    url.searchParams.set('discordId', String(user.id));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.allowed === true;
  } catch {
    return false;
  }
}
