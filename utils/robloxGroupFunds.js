const ROBLOX_UA = 'Mozilla/5.0 (compatible; ClearwaterBot/1.0; +https://github.com/colin991/ClearwaterWebBot)';

export function normalizeRobloxCookie(raw) {
  let value = String(raw || '').trim().replace(/^["']+|["']+$/g, '');
  if (!value) return '';
  const embedded = value.match(/\.ROBLOSECURITY=([^;]+)/i);
  if (embedded) value = embedded[1].trim();
  else value = value.replace(/^\.ROBLOSECURITY=/i, '').trim();
  return value;
}

export function looksLikeRobloxCookie(text) {
  const value = String(text || '');
  if (/\.ROBLOSECURITY=/i.test(value)) return true;
  if (/_\|WARNING:-DO-NOT-SHARE-THIS/i.test(value)) return true;
  return false;
}

export function formatRobux(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return '—';
  return `${Math.trunc(number).toLocaleString('en-US')} Robux`;
}

function headerGet(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  return String(headers[name] || headers[name.toLowerCase()] || '');
}

async function robloxGet(url, cookie, fetchImpl) {
  const headers = {
    Cookie: `.ROBLOSECURITY=${cookie}`,
    Accept: 'application/json',
    'User-Agent': ROBLOX_UA,
  };
  let response = await fetchImpl(url, {
    method: 'GET',
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const csrf = headerGet(response.headers, 'x-csrf-token');
  if ((response.status === 403 || response.status === 401) && csrf) {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { ...headers, 'x-csrf-token': csrf },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  }
  return response;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function fundsError(status) {
  if (status === 401) {
    return new Error('The Roblox cookie is invalid or expired. Update ROBLOX_COOKIE on the bot host.');
  }
  if (status === 403) {
    return new Error('That Roblox account cannot view this group’s funds. Use a cookie for an account with group economy permission.');
  }
  if (status === 404) {
    return new Error('That Roblox group was not found. Check ROBLOX_GROUP_ID.');
  }
  return new Error(`Roblox funds lookup failed (${status}).`);
}

export async function fetchRobloxGroupFunds({
  groupId,
  cookie,
  fetchImpl = globalThis.fetch,
} = {}) {
  const id = String(groupId || '').trim();
  if (!/^\d+$/.test(id)) {
    throw new Error('Set ROBLOX_GROUP_ID in the bot host .env.');
  }
  const token = normalizeRobloxCookie(cookie);
  if (!token) {
    throw new Error('Set ROBLOX_COOKIE in the bot host .env (your .ROBLOSECURITY value). Never paste it in Discord.');
  }

  const [groupResponse, fundsResponse] = await Promise.all([
    robloxGet(`https://groups.roblox.com/v1/groups/${id}`, token, fetchImpl),
    robloxGet(`https://economy.roblox.com/v1/groups/${id}/currency`, token, fetchImpl),
  ]);

  if (!fundsResponse.ok) throw fundsError(fundsResponse.status);

  const funds = await readJson(fundsResponse);
  const group = groupResponse.ok ? await readJson(groupResponse) : {};
  const robux = Number(funds.robux ?? funds.Robux);
  if (!Number.isFinite(robux)) {
    throw new Error('Roblox did not return a funds amount for that group.');
  }

  return {
    groupId: id,
    name: String(group.name || group.Name || `Group ${id}`),
    memberCount: Number.isFinite(Number(group.memberCount)) ? Number(group.memberCount) : null,
    robux,
  };
}

export function groupFundsCard(info) {
  const members = Number.isFinite(info.memberCount)
    ? `${info.memberCount.toLocaleString('en-US')} members`
    : null;
  return {
    title: 'Group Funds',
    description: [
      `**${info.name}**`,
      members,
      `**${formatRobux(info.robux)}**`,
      `-# Group ID \`${info.groupId}\``,
    ].filter(Boolean).join('\n'),
  };
}
