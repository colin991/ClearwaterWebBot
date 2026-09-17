import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchErlcServer, parseErlcPlayer, isEmergencyServiceTeam, libertyMapPoint } from './erlc.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TENURE_PATH = join(ROOT, 'data', 'jail-tenure.json');

const JAIL_DRAG_ZONE = Object.freeze({
  leftMin: 0.55937,
  leftMax: 0.58125,
  topMin: 0.5975,
  topMax: 0.63688,
});

function pointInDragZone(x, z) {
  const pin = libertyMapPoint(x, z);
  if (!pin) return false;
  return pin.left >= JAIL_DRAG_ZONE.leftMin
    && pin.left <= JAIL_DRAG_ZONE.leftMax
    && pin.top >= JAIL_DRAG_ZONE.topMin
    && pin.top <= JAIL_DRAG_ZONE.topMax;
}

export function formatJailHold(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes} min`;
  return `${Math.max(1, total)} sec`;
}

export function applyJailTenure(inmates, previous = {}, now = Date.now()) {
  const occupants = {};
  const next = (Array.isArray(inmates) ? inmates : []).map((inmate) => {
    const key = String(inmate.robloxId || inmate.robloxUsername || '').trim().toLowerCase();
    const enteredAt = Number(previous?.[key]) || now;
    if (key) occupants[key] = enteredAt;
    const heldMs = Math.max(0, now - enteredAt);
    return {
      robloxUsername: inmate.robloxUsername || 'Unknown',
      robloxId: inmate.robloxId || null,
      heldMs,
      heldFor: formatJailHold(heldMs),
    };
  });
  return { inmates: next, occupants };
}

/**
 * People currently in the jail booking zone, with Roblox username and hold time.
 */
export async function fetchJailInmates({
  erlcServerKey,
} = {}) {
  if (!erlcServerKey) {
    const error = new Error('ERLC_SERVER_KEY is not configured');
    error.code = 'not_configured';
    throw error;
  }

  const server = await fetchErlcServer(erlcServerKey);
  const players = (server.Players || server.players || []).map(parseErlcPlayer);
  const inZone = players.filter((player) => {
    const x = player.location?.x;
    const z = player.location?.z;
    if (!pointInDragZone(x, z)) return false;
    if (isEmergencyServiceTeam(player.team)) return false;
    return Boolean(player.username || player.robloxId);
  });

  const rows = inZone.map((player) => ({
    robloxUsername: String(player.username || '').trim() || 'Unknown',
    robloxId: String(player.robloxId || '').trim() || null,
  })).sort((left, right) => left.robloxUsername.localeCompare(right.robloxUsername));

  const stored = await readJsonFile(TENURE_PATH, { occupants: {} });
  const { inmates, occupants } = applyJailTenure(rows, stored.occupants);
  await writeJsonFile(TENURE_PATH, {
    occupants,
    updatedAt: new Date().toISOString(),
  });

  return {
    inmates,
    zoneCount: inZone.length,
    checked: players.length,
  };
}
