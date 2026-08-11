import { isOwner } from './discord-auth.js';

export async function getStaffAccess(user) {
  if (!user?.id) return { allowed: false, staffRank: null, badges: [] };

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return { allowed: isOwner(user), staffRank: null, badges: [] };

  try {
    const url = new URL(`${apiUrl}/api/access`);
    url.searchParams.set('discordId', String(user.id));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { allowed: isOwner(user), staffRank: null, badges: [] };
    const result = await response.json();
    return {
      allowed: isOwner(user) || result.allowed === true,
      staffRank: typeof result.staffRank === 'string' ? result.staffRank : null,
      badges: Array.isArray(result.badges) ? result.badges.filter((badge) => badge === 'clearwater-role') : [],
    };
  } catch {
    return { allowed: isOwner(user), staffRank: null, badges: [] };
  }
}

export async function hasOwnerAccess(user) {
  return (await getStaffAccess(user)).allowed;
}
