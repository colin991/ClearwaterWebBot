import { CLEARWATER_GUILD_ID } from './staffRanks.js';
import { logger } from './logger.js';

/** Server that requires a qualifying role from the main Clearwater server. */
export const SECONDARY_GATE_GUILD_ID = '1514189396184793169';

/** Roles on the main Clearwater server that allow access to the gated server. */
export const SECONDARY_GATE_REQUIRED_ROLE_IDS = Object.freeze([
  '1514744040778760252',
  '1514421440890409060',
]);

const KICK_REASON = 'Missing required Clearwater main-server role for this server.';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function requiredRoleIds(config = {}) {
  const fromEnv = String(config.secondaryGateRequiredRoleIds || process.env.SECONDARY_GATE_REQUIRED_ROLE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : [...SECONDARY_GATE_REQUIRED_ROLE_IDS];
}

function gatedGuildId(config = {}) {
  return String(
    config.secondaryGateGuildId
    || process.env.SECONDARY_GATE_GUILD_ID
    || SECONDARY_GATE_GUILD_ID,
  ).trim();
}

function mainGuildId(config = {}) {
  return String(config.guildId || CLEARWATER_GUILD_ID).trim() || CLEARWATER_GUILD_ID;
}

async function fetchGuild(client, guildId) {
  if (!/^\d{16,22}$/.test(String(guildId || ''))) return null;
  return client.guilds.cache.get(guildId)
    || await client.guilds.fetch(guildId).catch((error) => {
      logger.error(`Secondary gate: could not fetch guild ${guildId}`, error);
      return null;
    });
}

export function memberHasSecondaryGateRole(member, roleIds = SECONDARY_GATE_REQUIRED_ROLE_IDS) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(String(roleId)));
}

async function mainMemberFor(client, config, userId) {
  const main = await fetchGuild(client, mainGuildId(config));
  if (!main) return null;
  return main.members.cache.get(userId)
    || await main.members.fetch(userId).catch(() => null);
}

async function maybeDmKickNotice(member) {
  try {
    await member.send(
      'You were removed from a Clearwater server because you do not have a required role in the main Clearwater Discord.',
    );
  } catch {
    // DMs closed — continue with kick.
  }
}

/**
 * Kick a gated-server member if they lack a required role on the main server.
 * @returns {'kicked'|'allowed'|'skipped'}
 */
export async function enforceSecondaryGateMember(client, gatedMember, config = {}) {
  if (!gatedMember || gatedMember.user?.bot) return 'skipped';
  if (String(gatedMember.guild?.id) !== gatedGuildId(config)) return 'skipped';
  if (gatedMember.id === gatedMember.guild.ownerId) return 'skipped';

  const roleIds = requiredRoleIds(config);
  const mainMember = await mainMemberFor(client, config, gatedMember.id);
  if (mainMember && memberHasSecondaryGateRole(mainMember, roleIds)) {
    return 'allowed';
  }

  if (!gatedMember.kickable) {
    logger.warn(`Secondary gate: cannot kick ${gatedMember.user?.tag || gatedMember.id} (missing permissions or role hierarchy).`);
    return 'skipped';
  }

  await maybeDmKickNotice(gatedMember);
  await gatedMember.kick(KICK_REASON);
  logger.info(`Secondary gate: kicked ${gatedMember.user?.tag || gatedMember.id} (missing main-server role).`);
  return 'kicked';
}

/** Handle GuildMemberAdd for the gated server. */
export async function handleSecondaryGateJoin(member, client) {
  const config = client?.config || {};
  if (String(member.guild?.id) !== gatedGuildId(config)) return false;
  await enforceSecondaryGateMember(client, member, config);
  return true;
}

/**
 * If a main-server member lost all required roles, kick them from the gated server.
 */
export async function handleSecondaryGateMainRoleUpdate(previousMember, member, client) {
  const config = client?.config || {};
  if (String(member.guild?.id) !== mainGuildId(config)) return false;

  const roleIds = requiredRoleIds(config);
  const hadAccess = memberHasSecondaryGateRole(previousMember, roleIds);
  const hasAccess = memberHasSecondaryGateRole(member, roleIds);
  if (!hadAccess || hasAccess) return false;

  const gated = await fetchGuild(client, gatedGuildId(config));
  if (!gated) return false;
  const gatedMember = await gated.members.fetch(member.id).catch(() => null);
  if (!gatedMember) return false;

  await enforceSecondaryGateMember(client, gatedMember, config);
  return true;
}

/** Sweep everyone already in the gated server. */
export async function sweepSecondaryGateServer(client, config = {}) {
  const gated = await fetchGuild(client, gatedGuildId(config));
  if (!gated) {
    logger.warn(`Secondary gate: gated guild ${gatedGuildId(config)} is unavailable.`);
    return { checked: 0, kicked: 0, allowed: 0, skipped: 0 };
  }

  const main = await fetchGuild(client, mainGuildId(config));
  if (!main) {
    logger.warn('Secondary gate: main Clearwater guild is unavailable; skipping sweep.');
    return { checked: 0, kicked: 0, allowed: 0, skipped: 0 };
  }

  await Promise.allSettled([
    gated.members.fetch(),
    main.members.fetch(),
  ]);

  let kicked = 0;
  let allowed = 0;
  let skipped = 0;

  for (const member of gated.members.cache.values()) {
    const result = await enforceSecondaryGateMember(client, member, config);
    if (result === 'kicked') kicked += 1;
    else if (result === 'allowed') allowed += 1;
    else skipped += 1;
    if (result === 'kicked') {
      // Soft pacing so large sweeps do not hit Discord rate limits hard.
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const checked = kicked + allowed + skipped;
  logger.info(`Secondary gate sweep: checked ${checked}, kicked ${kicked}, allowed ${allowed}, skipped ${skipped}.`);
  return { checked, kicked, allowed, skipped };
}

export function startSecondaryServerGate(client, config = {}) {
  let stopped = false;
  let timer;

  const run = async () => {
    try {
      await sweepSecondaryGateServer(client, config);
    } catch (error) {
      logger.error('Secondary gate sweep failed', error);
    } finally {
      if (!stopped) timer = setTimeout(run, SWEEP_INTERVAL_MS);
    }
  };

  // Let guild caches settle a bit after ready, then sweep existing members.
  timer = setTimeout(run, 8_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
