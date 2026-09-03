const baseUrl = 'https://api.melonly.xyz/api/v1';

async function melonlyFetch(path, apiKey) {
  if (!apiKey) throw new Error('MELONLY_API_KEY is not configured');
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403
      ? 'The Melonly API key was rejected. Replace MELONLY_API_KEY on the bot host and restart the bot.'
      : `Melonly request failed (${response.status}).`;
    throw new Error(reason);
  }
  return response.json();
}

export function safeMelonlyError(error) {
  const message = String(error?.message || '');
  if (message.includes('MELONLY_API_KEY is not configured')) return 'Melonly is not configured on the bot host. Add MELONLY_API_KEY, save it, and restart the bot.';
  if (message.includes('API key was rejected')) return 'Melonly rejected the API key. Replace MELONLY_API_KEY on the bot host, then restart the bot.';
  if (message.includes('timed out') || message.includes('fetch failed')) return 'Melonly could not be reached right now. Try again in a minute.';
  return 'Melonly could not complete the identity lookup. Check the bot host console for the exact status.';
}

async function getRobloxUser(robloxId) {
  const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(robloxId)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

export async function findRobloxIdentity(discordId, apiKey) {
  // Use Melonly Verify directly. This is distinct from application records.
  const verified = await melonlyFetch(`/verification/discord/${encodeURIComponent(discordId)}/roblox`, apiKey);
  if (!verified?.robloxId) return null;

  const roblox = await getRobloxUser(verified.robloxId).catch(() => null);
  return {
    discordId: String(discordId),
    robloxId: String(verified.robloxId),
    robloxUsername: roblox?.name || null,
    robloxDisplayName: roblox?.displayName || null,
    applicationId: null,
    status: 'verified',
  };
}

export async function fetchApplicationIdentityIndex(apiKey) {
  const applications = await melonlyFetch('/server/applications?limit=100', apiKey);
  const identities = [];
  const seenDiscordIds = new Set();
  for (const application of applications?.data || []) {
    let page = 1;
    let totalPages = 1;
    do {
      const responses = await melonlyFetch(`/server/applications/${encodeURIComponent(application.id)}/responses?limit=100&page=${page}`, apiKey);
      for (const entry of responses?.data || []) {
        // Melonly responses that expose the linked Discord snowflake can be indexed
        // automatically.
        if (/^\d{16,22}$/.test(String(entry.userId || '')) && entry.robloxId && !seenDiscordIds.has(String(entry.userId))) {
          identities.push({ discordId: String(entry.userId), robloxId: String(entry.robloxId) });
          seenDiscordIds.add(String(entry.userId));
        }
      }
      totalPages = Math.max(1, Number(responses?.totalPages || 1));
      page += 1;
    } while (page <= totalPages);
  }
  return identities;
}
