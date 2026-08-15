import { normalizeClientIp } from './privacy.js';
import { sendJson, redirect, safeNextPath } from './discord-auth.js';

const cache = new Map();
const CACHE_TTL_MS = 45 * 60 * 1000;
const CACHE_MAX = 2_000;

function vpnBlockEnabled() {
  const raw = String(process.env.VPN_BLOCK ?? '1').trim().toLowerCase();
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no');
}

function blockHostingEnabled() {
  const raw = String(process.env.VPN_BLOCK_HOSTING ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

function isPrivateIp(ip) {
  const value = String(ip || '');
  if (!value) return true;
  if (value === '::1' || value === '127.0.0.1' || value === '0.0.0.0') return true;
  if (/^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (/^fc/i.test(value) || /^fd/i.test(value) || /^fe80:/i.test(value)) return true;
  return false;
}

function readCache(ip) {
  const hit = cache.get(ip);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(ip);
    return null;
  }
  return hit.value;
}

function writeCache(ip, value) {
  cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }
  return value;
}

async function lookupProxycheck(ip) {
  const key = String(process.env.PROXYCHECK_API_KEY || '').trim();
  const url = new URL(`https://proxycheck.io/v2/${encodeURIComponent(ip)}`);
  url.searchParams.set('vpn', '1');
  url.searchParams.set('asn', '1');
  url.searchParams.set('risk', '1');
  if (key) url.searchParams.set('key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw new Error(`proxycheck ${response.status}`);
  const data = await response.json();
  if (data?.status === 'denied' || data?.status === 'error') throw new Error(String(data.message || 'proxycheck error'));
  const row = data?.[ip];
  if (!row || typeof row !== 'object') return null;
  const proxyYes = String(row.proxy || '').toLowerCase() === 'yes';
  const type = String(row.type || '');
  const risk = Number(row.risk);
  const vpnType = /vpn|proxy|tor|socks|shadowsocks|relay/i.test(type);
  return {
    blocked: proxyYes || vpnType || (Number.isFinite(risk) && risk >= 66),
    reason: proxyYes || vpnType ? (type || 'VPN/proxy') : (Number.isFinite(risk) ? `risk ${risk}` : 'VPN/proxy'),
    source: 'proxycheck',
    hosting: /hosting|business|cdn/i.test(type),
  };
}

async function lookupHackMyIp(ip) {
  const response = await fetch(`https://hackmyip.com/api/lookup?ip=${encodeURIComponent(ip)}`, {
    signal: AbortSignal.timeout(4500),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`hackmyip ${response.status}`);
  const data = await response.json();
  const privacy = data?.data?.privacy || {};
  const proxy = privacy.proxy === true;
  const hosting = privacy.hosting === true;
  const blocked = proxy || (blockHostingEnabled() && hosting);
  return {
    blocked,
    reason: proxy ? 'VPN/proxy' : (hosting ? 'datacenter/hosting' : 'clean'),
    source: 'hackmyip',
    hosting,
  };
}

/**
 * Classify the request IP. Fail-open on detector outages so the site stays up.
 */
export async function checkClientVpn(request) {
  if (!vpnBlockEnabled()) return { blocked: false, skipped: true, reason: 'disabled' };
  const ip = normalizeClientIp(request);
  if (!ip || isPrivateIp(ip)) return { blocked: false, skipped: true, reason: 'local', ip };

  const cached = readCache(ip);
  if (cached) return { ...cached, cached: true, ip };

  try {
    let verdict = null;
    try {
      verdict = await lookupProxycheck(ip);
    } catch {
      verdict = null;
    }
    if (!verdict) verdict = await lookupHackMyIp(ip);
    if (blockHostingEnabled() && verdict.hosting && !verdict.blocked) {
      verdict = { ...verdict, blocked: true, reason: 'datacenter/hosting' };
    }
    return { ...writeCache(ip, { blocked: Boolean(verdict.blocked), reason: verdict.reason, source: verdict.source }), ip };
  } catch {
    // Detector unavailable — do not lock the whole site.
    return { blocked: false, skipped: true, reason: 'detector_unavailable', ip };
  }
}

export async function rejectVpnJson(request, response) {
  const verdict = await checkClientVpn(request);
  if (!verdict.blocked) return false;
  sendJson(response, 403, {
    error: 'VPNs and proxies are not allowed on Clearwater. Turn off your VPN and try again.',
    code: 'VPN_BLOCKED',
    reason: verdict.reason || 'VPN/proxy',
  });
  return true;
}

export async function rejectVpnRedirect(request, response, nextPath = '/') {
  const verdict = await checkClientVpn(request);
  if (!verdict.blocked) return false;
  const next = safeNextPath(nextPath || '/');
  redirect(response, `/signin?error=vpn${next && next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`);
  return true;
}
