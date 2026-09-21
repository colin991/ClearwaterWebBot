export { ROBLOX_FUNDS_GROUP_ID, resolveFundsGroupId } from './robloxGroups.js';
export const FUNDS_TRANSACTION_COUNT = 7;

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

export function parseGroupTransaction(entry, kind) {
  const agent = entry?.agent || {};
  const details = entry?.details || {};
  const currency = entry?.currency || {};
  const createdAt = entry?.created || entry?.Created || null;
  return {
    kind,
    id: String(entry?.id || entry?.idHash || ''),
    createdAt,
    username: String(agent.name || agent.Name || 'Unknown').trim() || 'Unknown',
    userId: agent.id == null ? null : String(agent.id),
    item: String(details.name || details.Name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    amount: Number(currency.amount ?? currency.Amount),
  };
}

function discordRelative(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

export function formatTransactionLine(entry, kind) {
  const amount = Number.isFinite(entry?.amount) ? formatRobux(Math.abs(entry.amount)) : '—';
  const when = discordRelative(entry?.createdAt);
  const who = `**${entry?.username || 'Unknown'}**`;
  let line;
  if (kind === 'payout') line = `• Paid ${who} — **${amount}**`;
  else if (entry?.item) line = `• ${who} bought ${entry.item} — **${amount}**`;
  else line = `• ${who} — **${amount}**`;
  return when ? `${line} · ${when}` : line;
}

function transactionList(entries, kind, error) {
  if (error) {
    return kind === 'payout'
      ? `_Could not load payouts (${error})._`
      : `_Could not load sales (${error})._`;
  }
  if (!Array.isArray(entries) || !entries.length) {
    return kind === 'payout' ? '_No payouts in recent records._' : '_No sales in recent records._';
  }
  return entries.map((entry) => formatTransactionLine(entry, kind)).join('\n');
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
    Referer: 'https://www.roblox.com/',
    Origin: 'https://www.roblox.com',
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

function transactionUrl(groupId, type) {
  const params = new URLSearchParams({
    limit: '10',
    sortOrder: 'Desc',
    transactionType: type,
  });
  return `https://economy.roblox.com/v2/groups/${groupId}/transactions?${params}`;
}

function transactionHttpError(status) {
  if (status === 401) return 'cookie invalid or expired';
  if (status === 403) return 'no permission';
  if (status === 429) return 'rate limited';
  return `HTTP ${status}`;
}

async function fetchTransactionPage(groupId, type, cookie, fetchImpl) {
  const kind = type === 'GroupPayout' ? 'payout' : 'sale';
  try {
    const response = await robloxGet(transactionUrl(groupId, type), cookie, fetchImpl);
    if (!response.ok) {
      return { items: [], error: transactionHttpError(response.status) };
    }
    const body = await readJson(response);
    const rows = Array.isArray(body.data)
      ? body.data
      : (Array.isArray(body.Data) ? body.Data : (Array.isArray(body) ? body : []));
    return {
      items: rows.map((entry) => parseGroupTransaction(entry, kind)).slice(0, FUNDS_TRANSACTION_COUNT),
    };
  } catch (error) {
    return { items: [], error: error?.message || 'request failed' };
  }
}

function fundsError(status) {
  if (status === 401) {
    return new Error('The Roblox cookie is invalid or expired. Update ROBLOX_COOKIE on the bot host.');
  }
  if (status === 403) {
    return new Error('That Roblox account cannot view this group’s funds. Use a cookie for an account with group economy permission.');
  }
  if (status === 404) {
    return new Error('That Roblox group was not found. Check ROBLOX_FUNDS_GROUP_ID.');
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
    throw new Error('Set ROBLOX_FUNDS_GROUP_ID in the bot host .env.');
  }
  const token = normalizeRobloxCookie(cookie);
  if (!token) {
    throw new Error('Set ROBLOX_COOKIE in the bot host .env (your .ROBLOSECURITY value). Never paste it in Discord.');
  }

  const [groupResponse, fundsResponse, payoutPage, salePage] = await Promise.all([
    robloxGet(`https://groups.roblox.com/v1/groups/${id}`, token, fetchImpl),
    robloxGet(`https://economy.roblox.com/v1/groups/${id}/currency`, token, fetchImpl),
    fetchTransactionPage(id, 'GroupPayout', token, fetchImpl),
    fetchTransactionPage(id, 'Sale', token, fetchImpl),
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
    payouts: payoutPage.items,
    sales: salePage.items,
    payoutsError: payoutPage.error || null,
    salesError: salePage.error || null,
  };
}

export function groupFundsCard(info) {
  const members = Number.isFinite(info.memberCount)
    ? `${info.memberCount.toLocaleString('en-US')} members`
    : null;
  const payouts = transactionList(info.payouts, 'payout', info.payoutsError);
  const sales = transactionList(info.sales, 'sale', info.salesError);
  const header = [
    `**${info.name}**`,
    members,
    `**Balance:** ${formatRobux(info.robux)}`,
  ].filter(Boolean).join('\n');
  return {
    title: 'Group Funds',
    description: header,
    fields: [
      { name: `Payouts sent (last ${FUNDS_TRANSACTION_COUNT})`, value: payouts },
      { name: `Sales (last ${FUNDS_TRANSACTION_COUNT})`, value: sales },
    ],
    footer: `Group ID \`${info.groupId}\``,
    sections: [
      `## Group Funds\n${header}`,
      `**Payouts sent (last ${FUNDS_TRANSACTION_COUNT})**\n${payouts}`,
      `**Sales (last ${FUNDS_TRANSACTION_COUNT})**\n${sales}`,
      `-# Group ID \`${info.groupId}\``,
    ],
  };
}
