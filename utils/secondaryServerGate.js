import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { ENFORCEMENT_EXEMPT_ROLE } from './enforcementExemptions.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';

/** Server that requires a qualifying role from the main Clearwater server. */
export const SECONDARY_GATE_GUILD_ID = '1514189396184793169';

/** Main Clearwater Discord — roles are checked here. */
export const SECONDARY_GATE_MAIN_GUILD_ID = '1514026810348671026';

/** Roles on the main Clearwater server that allow access to the gated server. */
export const SECONDARY_GATE_REQUIRED_ROLE_IDS = Object.freeze([
  ENFORCEMENT_EXEMPT_ROLE,
  '1053768758772109394',
  '1514421440890409060',
  '1514744040778760252',
  '1536839307766267944',
]);

const KICK_REASON = 'Missing required Clearwater main-server role for this server.';
const UNKNOWN_MEMBER = 10007;

/**
 * Safety switch. Set false immediately if kicks misbehave again.
 * Join checks stay on; periodic mass-sweeps stay off until this is proven safe.
 */
const KICKS_ENABLED = true;
const PERIODIC_SWEEP_ENABLED = false;

async function fetchGuild(client, guildId) {
  if (!/^\d{16,22}$/.test(String(guildId || ''))) return null;
  return client.guilds.cache.get(String(guildId))
    || await client.guilds.fetch(String(guildId)).catch((error) => {
      logger.error(`Secondary gate: could not fetch guild ${guildId}`, error);
      return null;
    });
}

/**
 * Source-of-truth role check via Discord REST member payload.
 * Avoids discord.js role-cache false negatives that were causing bad kicks.
 */
async function resolveMainAccess(client, userId) {
  const main = await fetchGuild(client, SECONDARY_GATE_MAIN_GUILD_ID);
  if (!main) {
    return { status: 'error', matched: [], roleIds: [], reason: 'main guild unavailable' };
  }

  try {
    const raw = await client.rest.get(`/guilds/${SECONDARY_GATE_MAIN_GUILD_ID}/members/${userId}`);
    const roleIds = (Array.isArray(raw?.roles) ? raw.roles : []).map(String);
    const matched = SECONDARY_GATE_REQUIRED_ROLE_IDS.filter((roleId) => roleIds.includes(roleId));
    if (matched.length) {
      return { status: 'allowed', matched, roleIds, reason: `has ${matched.join(', ')}` };
    }
    return {
      status: 'denied',
      matched: [],
      roleIds,
      reason: `in main server without required roles (roles=${roleIds.slice(0, 12).join(',') || 'none'})`,
    };
  } catch (error) {
    const code = Number(error?.code ?? error?.rawError?.code);
    if (code === UNKNOWN_MEMBER) {
      return { status: 'denied', matched: [], roleIds: [], reason: 'not in main Clearwater server' };
    }
    logger.error(`Secondary gate: REST role lookup failed for ${userId}`, error);
    return { status: 'error', matched: [], roleIds: [], reason: 'role lookup failed' };
  }
}

async function maybeDmKickNotice(user) {
  try {
    await user.send(
      'You were removed from a Clearwater server because you do not have a required role in the main Clearwater Discord.',
    );
  } catch {
    // DMs closed — continue.
  }
}

async function kickFromGatedGuild(gatedGuild, userId, user) {
  if (!KICKS_ENABLED) {
    logger.warn(`Secondary gate: kicks disabled; would have removed ${user?.tag || userId}.`);
    return false;
  }

  const me = gatedGuild.members.me
    || await gatedGuild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.KickMembers)) {
    logger.error('Secondary gate: bot is missing Kick Members in the gated server.');
    return false;
  }

  await maybeDmKickNotice(user);
  try {
    await gatedGuild.members.kick(userId, KICK_REASON);
    return true;
  } catch (error) {
    logger.error(`Secondary gate: kick failed for ${user?.tag || userId}`, error);
    return false;
  }
}

/**
 * @returns {'kicked'|'allowed'|'skipped'|'failed'|'dry_run'}
 */
export async function enforceSecondaryGateMember(client, gatedMember) {
  if (!gatedMember || gatedMember.user?.bot) return 'skipped';
  if (String(gatedMember.guild?.id) !== SECONDARY_GATE_GUILD_ID) return 'skipped';
  if (gatedMember.id === gatedMember.guild.ownerId) {
    logger.warn('Secondary gate: skipped guild owner.');
    return 'skipped';
  }

  const access = await resolveMainAccess(client, gatedMember.id);
  if (access.status === 'error') {
    logger.warn(`Secondary gate: skipped ${gatedMember.user?.tag || gatedMember.id} (${access.reason}).`);
    return 'failed';
  }

  if (access.status === 'allowed') {
    logger.info(`Secondary gate: allowed ${gatedMember.user?.tag || gatedMember.id} (${access.reason}).`);
    return 'allowed';
  }

  // Only reach here when REST confirmed they lack required roles.
  logger.info(`Secondary gate: removing ${gatedMember.user?.tag || gatedMember.id} (${access.reason}).`);
  if (!KICKS_ENABLED) return 'dry_run';

  const ok = await kickFromGatedGuild(gatedMember.guild, gatedMember.id, gatedMember.user);
  return ok ? 'kicked' : 'failed';
}

/** Handle GuildMemberAdd for the gated server. */
export async function handleSecondaryGateJoin(member, client) {
  if (String(member.guild?.id) !== SECONDARY_GATE_GUILD_ID) return false;

  logger.info(`Secondary gate: join detected for ${member.user?.tag || member.id}.`);
  await enforceSecondaryGateMember(client, member);
  return true;
}

/**
 * If a main-server member lost all required roles, kick them from the gated server.
 */
export async function handleSecondaryGateMainRoleUpdate(previousMember, member, client) {
  if (String(member.guild?.id) !== SECONDARY_GATE_MAIN_GUILD_ID) return false;

  const before = await resolveMainAccess(client, previousMember.id).catch(() => null);
  // Use the updated member roles from the event when possible; fall back to REST.
  const afterRoles = [...(member.roles?.cache?.keys?.() || [])].map(String);
  const afterHas = SECONDARY_GATE_REQUIRED_ROLE_IDS.some((roleId) => afterRoles.includes(roleId));
  const beforeHas = SECONDARY_GATE_REQUIRED_ROLE_IDS.some((roleId) => previousMember.roles?.cache?.has?.(roleId));
  if (!beforeHas || afterHas) return false;

  const gated = await fetchGuild(client, SECONDARY_GATE_GUILD_ID);
  if (!gated) return false;
  const gatedMember = await gated.members.fetch(member.id).catch(() => null);
  if (!gatedMember) return false;

  logger.info(`Secondary gate: ${member.user?.tag || member.id} lost required main roles; re-checking via REST.`);
  await enforceSecondaryGateMember(client, gatedMember);
  return true;
}

/** Manual/optional sweep — disabled on a timer until role checks are trusted. */
export async function sweepSecondaryGateServer(client) {
  const gated = await fetchGuild(client, SECONDARY_GATE_GUILD_ID);
  if (!gated) {
    logger.warn(`Secondary gate: gated guild ${SECONDARY_GATE_GUILD_ID} is unavailable.`);
    return { checked: 0, kicked: 0, allowed: 0, skipped: 0, failed: 0 };
  }

  await ensureGuildMembers(gated, { allowStale: true }).catch(() => null);

  let kicked = 0;
  let allowed = 0;
  let skipped = 0;
  let failed = 0;
  let dryRun = 0;

  for (const member of gated.members.cache.values()) {
    const result = await enforceSecondaryGateMember(client, member);
    if (result === 'kicked') kicked += 1;
    else if (result === 'allowed') allowed += 1;
    else if (result === 'failed') failed += 1;
    else if (result === 'dry_run') dryRun += 1;
    else skipped += 1;
    if (result === 'kicked') {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const checked = kicked + allowed + skipped + failed + dryRun;
  logger.info(`Secondary gate sweep: checked ${checked}, kicked ${kicked}, allowed ${allowed}, skipped ${skipped}, failed ${failed}, dryRun ${dryRun}.`);
  return { checked, kicked, allowed, skipped, failed, dryRun };
}

export function startSecondaryServerGate(client) {
  logger.info(`Secondary gate armed for guild ${SECONDARY_GATE_GUILD_ID} (main ${SECONDARY_GATE_MAIN_GUILD_ID}).`);
  logger.info(`Secondary gate required main roles: ${SECONDARY_GATE_REQUIRED_ROLE_IDS.join(', ')}`);
  logger.info(`Secondary gate kicks=${KICKS_ENABLED} periodicSweep=${PERIODIC_SWEEP_ENABLED}`);

  if (!PERIODIC_SWEEP_ENABLED) {
    logger.warn('Secondary gate periodic sweep is OFF (join checks only) to prevent mass false kicks.');
    return () => {};
  }

  let stopped = false;
  let timer;
  const run = async () => {
    try {
      await sweepSecondaryGateServer(client);
    } catch (error) {
      logger.error('Secondary gate sweep failed', error);
    } finally {
      if (!stopped) timer = setTimeout(run, 5 * 60 * 1000);
    }
  };
  timer = setTimeout(run, 10_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
