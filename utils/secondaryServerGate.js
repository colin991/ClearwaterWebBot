import { PermissionFlagsBits } from 'discord.js';
import { CLEARWATER_GUILD_ID } from './staffRanks.js';
import { logger } from './logger.js';

/** Server that requires a qualifying role from the main Clearwater server. */
export const SECONDARY_GATE_GUILD_ID = '1514189396184793169';

/** Main Clearwater Discord — roles are checked here. */
export const SECONDARY_GATE_MAIN_GUILD_ID = CLEARWATER_GUILD_ID;

/** Roles on the main Clearwater server that allow access to the gated server. */
export const SECONDARY_GATE_REQUIRED_ROLE_IDS = Object.freeze([
  '1514744040778760252',
  '1514421440890409060',
]);

const KICK_REASON = 'Missing required Clearwater main-server role for this server.';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const JOIN_RECHECK_MS = 2_500;

async function fetchGuild(client, guildId) {
  if (!/^\d{16,22}$/.test(String(guildId || ''))) return null;
  return client.guilds.cache.get(String(guildId))
    || await client.guilds.fetch(String(guildId)).catch((error) => {
      logger.error(`Secondary gate: could not fetch guild ${guildId}`, error);
      return null;
    });
}

export function memberHasSecondaryGateRole(member, roleIds = SECONDARY_GATE_REQUIRED_ROLE_IDS) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(String(roleId)));
}

async function mainMemberFor(client, userId) {
  const main = await fetchGuild(client, SECONDARY_GATE_MAIN_GUILD_ID);
  if (!main) return { main: null, member: null };
  const member = main.members.cache.get(String(userId))
    || await main.members.fetch(String(userId)).catch(() => null);
  return { main, member };
}

async function maybeDmKickNotice(user) {
  try {
    await user.send(
      'You were removed from a Clearwater server because you do not have a required role in the main Clearwater Discord.',
    );
  } catch {
    // DMs closed — continue with kick.
  }
}

async function kickFromGatedGuild(gatedGuild, userId, user) {
  const me = gatedGuild.members.me
    || await gatedGuild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.KickMembers)) {
    logger.error('Secondary gate: bot is missing Kick Members in the gated server. Move the bot role higher and enable Kick Members.');
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
 * Kick a gated-server member if they lack a required role on the main server.
 * @returns {'kicked'|'allowed'|'skipped'|'failed'}
 */
export async function enforceSecondaryGateMember(client, gatedMember) {
  if (!gatedMember || gatedMember.user?.bot) return 'skipped';
  if (String(gatedMember.guild?.id) !== SECONDARY_GATE_GUILD_ID) return 'skipped';
  if (gatedMember.id === gatedMember.guild.ownerId) {
    logger.warn('Secondary gate: skipped guild owner.');
    return 'skipped';
  }

  const { main, member: mainMember } = await mainMemberFor(client, gatedMember.id);
  if (!main) {
    logger.error('Secondary gate: main Clearwater guild unavailable; cannot verify roles.');
    return 'failed';
  }

  if (mainMember && memberHasSecondaryGateRole(mainMember)) {
    logger.info(`Secondary gate: allowed ${gatedMember.user?.tag || gatedMember.id} (has required main-server role).`);
    return 'allowed';
  }

  const why = mainMember
    ? 'in main server but missing required roles'
    : 'not in main Clearwater server';
  logger.info(`Secondary gate: removing ${gatedMember.user?.tag || gatedMember.id} (${why}).`);

  const ok = await kickFromGatedGuild(gatedMember.guild, gatedMember.id, gatedMember.user);
  return ok ? 'kicked' : 'failed';
}

/** Handle GuildMemberAdd for the gated server. */
export async function handleSecondaryGateJoin(member, client) {
  if (String(member.guild?.id) !== SECONDARY_GATE_GUILD_ID) return false;

  logger.info(`Secondary gate: join detected for ${member.user?.tag || member.id} in gated server.`);
  await enforceSecondaryGateMember(client, member);

  // Re-check shortly after join in case the first attempt raced membership/permissions.
  setTimeout(() => {
    void (async () => {
      try {
        const fresh = await member.guild.members.fetch(member.id).catch(() => null);
        if (!fresh) return; // already gone
        await enforceSecondaryGateMember(client, fresh);
      } catch (error) {
        logger.error('Secondary gate: delayed join re-check failed', error);
      }
    })();
  }, JOIN_RECHECK_MS);

  return true;
}

/**
 * If a main-server member lost all required roles, kick them from the gated server.
 */
export async function handleSecondaryGateMainRoleUpdate(previousMember, member, client) {
  if (String(member.guild?.id) !== SECONDARY_GATE_MAIN_GUILD_ID) return false;

  const hadAccess = memberHasSecondaryGateRole(previousMember);
  const hasAccess = memberHasSecondaryGateRole(member);
  if (!hadAccess || hasAccess) return false;

  const gated = await fetchGuild(client, SECONDARY_GATE_GUILD_ID);
  if (!gated) return false;
  const gatedMember = await gated.members.fetch(member.id).catch(() => null);
  if (!gatedMember) return false;

  logger.info(`Secondary gate: ${member.user?.tag || member.id} lost required main roles; checking gated server.`);
  await enforceSecondaryGateMember(client, gatedMember);
  return true;
}

/** Sweep everyone already in the gated server. */
export async function sweepSecondaryGateServer(client) {
  const gated = await fetchGuild(client, SECONDARY_GATE_GUILD_ID);
  if (!gated) {
    logger.warn(`Secondary gate: gated guild ${SECONDARY_GATE_GUILD_ID} is unavailable (is the bot in that server?).`);
    return { checked: 0, kicked: 0, allowed: 0, skipped: 0, failed: 0 };
  }

  const main = await fetchGuild(client, SECONDARY_GATE_MAIN_GUILD_ID);
  if (!main) {
    logger.warn('Secondary gate: main Clearwater guild is unavailable; skipping sweep.');
    return { checked: 0, kicked: 0, allowed: 0, skipped: 0, failed: 0 };
  }

  const me = gated.members.me || await gated.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.KickMembers)) {
    logger.error('Secondary gate: bot cannot kick in the gated server. Give it Kick Members and place its role above members.');
  }

  await Promise.allSettled([
    gated.members.fetch(),
    main.members.fetch(),
  ]);

  let kicked = 0;
  let allowed = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of gated.members.cache.values()) {
    const result = await enforceSecondaryGateMember(client, member);
    if (result === 'kicked') kicked += 1;
    else if (result === 'allowed') allowed += 1;
    else if (result === 'failed') failed += 1;
    else skipped += 1;
    if (result === 'kicked') {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const checked = kicked + allowed + skipped + failed;
  logger.info(`Secondary gate sweep: checked ${checked}, kicked ${kicked}, allowed ${allowed}, skipped ${skipped}, failed ${failed}.`);
  return { checked, kicked, allowed, skipped, failed };
}

export function startSecondaryServerGate(client) {
  let stopped = false;
  let timer;

  const run = async () => {
    try {
      await sweepSecondaryGateServer(client);
    } catch (error) {
      logger.error('Secondary gate sweep failed', error);
    } finally {
      if (!stopped) timer = setTimeout(run, SWEEP_INTERVAL_MS);
    }
  };

  logger.info(`Secondary gate armed for guild ${SECONDARY_GATE_GUILD_ID} (main ${SECONDARY_GATE_MAIN_GUILD_ID}).`);
  // Short delay so guild/member caches can settle after login.
  timer = setTimeout(run, 3_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
