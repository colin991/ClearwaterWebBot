import { fetchErlcServer, parseErlcPlayer, isEmergencyServiceTeam, libertyMapPoint } from './erlc.js';
import { melonlyFetch, fetchMelonlyMembers } from './melonly.js';
import { getIdentityCache } from './identityStore.js';


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

const CAD_CHARACTER_PATHS = [
  '/server/cad/characters',
  '/server/cad/civilians',
  '/server/cad/profiles',
  '/server/characters',
  '/server/civilians',
];

function pickString(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'characters', 'civilians', 'profiles', 'results', 'items', 'members']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function characterRoleplayName(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const first = pickString(entry.firstName, entry.first_name, entry.givenName);
  const last = pickString(entry.lastName, entry.last_name, entry.surname, entry.familyName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return pickString(
    entry.roleplayName,
    entry.roleplay_name,
    entry.rpName,
    entry.rp_name,
    entry.characterName,
    entry.character_name,
    entry.cadName,
    entry.cad_name,
    entry.fullName,
    entry.full_name,
    entry.displayName,
    entry.display_name,
    combined,
    entry.name,
  );
}

function characterRobloxKeys(entry) {
  const keys = new Set();
  const id = pickString(
    entry.robloxId,
    entry.roblox_id,
    entry.robloxUserId,
    entry.roblox_user_id,
    entry.userId,
    entry.user_id,
    entry.playerId,
  );
  const username = pickString(
    entry.robloxUsername,
    entry.roblox_username,
    entry.robloxName,
    entry.username,
    entry.playerName,
  ).toLowerCase();
  if (id) keys.add(`id:${id}`);
  if (username) keys.add(`name:${username}`);
  return keys;
}

function memberRoleplayName(member) {
  if (!member || typeof member !== 'object') return '';
  const nested = member.character || member.cad || member.profile || member.civilian || null;
  return pickString(
    characterRoleplayName(nested),
    member.roleplayName,
    member.roleplay_name,
    member.rpName,
    member.characterName,
    member.cadName,
    member.displayName,
    member.display_name,
  );
}

function memberRobloxId(member) {
  return pickString(
    member?.robloxId,
    member?.roblox_id,
    member?.robloxUserId,
    member?.roblox_user_id,
    member?.user?.robloxId,
    member?.account?.robloxId,
  );
}

function memberRobloxUsername(member) {
  return pickString(
    member?.robloxUsername,
    member?.roblox_username,
    member?.robloxName,
    member?.username,
    member?.user?.robloxUsername,
    member?.account?.robloxUsername,
  );
}

async function loadCadCharacterIndex(apiKey) {
  const byKey = new Map();
  if (!apiKey) return byKey;

  for (const path of CAD_CHARACTER_PATHS) {
    try {
      const payload = await melonlyFetch(apiKey, path, { cacheTtlMs: 60_000 });
      const rows = asList(payload);
      if (!rows.length) continue;
      for (const row of rows) {
        const name = characterRoleplayName(row);
        if (!name) continue;
        for (const key of characterRobloxKeys(row)) {
          if (!byKey.has(key)) byKey.set(key, name);
        }
      }
      if (byKey.size) return byKey;
    } catch (error) {
      if (error?.status === 429) throw error;
    }
  }
  return byKey;
}

async function loadMelonlyMemberIndex(apiKey) {
  const byId = new Map();
  const byName = new Map();
  if (!apiKey) return { byId, byName };

  try {
    const members = await fetchMelonlyMembers(apiKey, { maxPages: 8, cacheTtlMs: 5 * 60_000 });
    for (const member of members || []) {
      const id = memberRobloxId(member);
      const username = memberRobloxUsername(member).toLowerCase();
      if (id) byId.set(id, member);
      if (username) byName.set(username, member);
    }
  } catch (error) {
    if (error?.status === 429) throw error;
  }
  return { byId, byName };
}

/**
 * People currently in the jail drag zone who are not on emergency-service teams.
 * Includes Melonly CAD roleplay name (when resolvable) and Roblox username.
 */
export async function fetchJailInmates({
  erlcServerKey,
  melonlyApiKey = '',
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

  const [cadIndex, memberIndex, identityCache] = await Promise.all([
    loadCadCharacterIndex(melonlyApiKey).catch(() => new Map()),
    loadMelonlyMemberIndex(melonlyApiKey).catch(() => ({ byId: new Map(), byName: new Map() })),
    getIdentityCache().catch(() => ({ byDiscord: {} })),
  ]);

  const identityByRobloxId = new Map();
  for (const entry of Object.values(identityCache?.byDiscord || {})) {
    const robloxId = String(entry?.robloxId || '').trim();
    if (robloxId) identityByRobloxId.set(robloxId, entry);
  }

  const inmates = inZone.map((player) => {
    const robloxId = String(player.robloxId || '').trim();
    const robloxUsername = String(player.username || '').trim();
    const usernameKey = robloxUsername.toLowerCase();

    const member = (robloxId && memberIndex.byId.get(robloxId))
      || (usernameKey && memberIndex.byName.get(usernameKey))
      || null;

    const identity = robloxId ? identityByRobloxId.get(robloxId) : null;

    const roleplayName = pickString(
      cadIndex.get(robloxId ? `id:${robloxId}` : ''),
      cadIndex.get(usernameKey ? `name:${usernameKey}` : ''),
      memberRoleplayName(member),
      identity?.robloxDisplayName,
    ) || null;

    return {
      roleplayName,
      robloxUsername: robloxUsername || null,
      robloxId: robloxId || null,
      team: player.team || 'Civilian',
    };
  }).sort((left, right) => {
    const a = `${left.roleplayName || ''} ${left.robloxUsername || ''}`.toLowerCase();
    const b = `${right.roleplayName || ''} ${right.robloxUsername || ''}`.toLowerCase();
    return a.localeCompare(b);
  });

  return {
    inmates,
    zoneCount: inZone.length,
    checked: players.length,
  };
}
