import { PermissionFlagsBits } from 'discord.js';
import {
  getHighestStaffRank,
  getStaffRankIndex,
  memberMeetsMinRank,
  FULL_STAFF_PANEL_ROLE_ID,
  STAFF_RANKS,
} from './staffRanks.js';
import { v2Card } from './v2Message.js';

export const PREFIX = '-';

/** Named floors used by prefix moderation commands (must match STAFF_RANKS names). */
export const RANK_FLOOR = Object.freeze({
  anyStaff: 'Moderator',
  leadModerator: 'Lead Moderator',
  administrator: 'Administrator',
  supervisor: 'Supervisor',
  seniorSupervisor: 'Senior Supervisor',
});

export const snowflakeFrom = (value = '') => String(value || '').match(/\d{16,22}/)?.[0] || null;

export function parseArgs(content, prefix = PREFIX) {
  const body = String(content || '').slice(String(prefix).length).trim();
  const [name = '', ...rest] = body.split(/\s+/);
  return {
    name: name.toLowerCase(),
    args: rest,
    raw: rest.join(' ').trim(),
  };
}

export function memberIsStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return Boolean(getHighestStaffRank(member));
}

export function requireStaff(message) {
  if (!memberIsStaff(message.member)) {
    throw new Error('Only Clearwater staff can use moderation commands.');
  }
}

/**
 * Require a minimum Clearwater staff rank (and staff membership).
 * Discord Administrator permission bypasses the named floor.
 */
export function requireMinRank(message, minRankName = RANK_FLOOR.anyStaff) {
  requireStaff(message);
  if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return;
  if (!memberMeetsMinRank(message.member, minRankName)) {
    const yours = staffRankLabel(message.member);
    throw new Error(`Requires **${minRankName}+** (your rank: ${yours}).`);
  }
}

/** Ownership role / configured owner IDs only — not general staff ranks. */
export function memberIsOwnership(member, config = {}) {
  if (!member) return false;
  const ownerIds = new Set((config.ownerDiscordIds || []).map(String));
  if (ownerIds.has(String(member.id))) return true;
  if (member.roles?.cache?.has(FULL_STAFF_PANEL_ROLE_ID)) return true;
  for (const roleId of config.ownerRoleIds || []) {
    if (roleId && member.roles?.cache?.has(String(roleId))) return true;
  }
  return getHighestStaffRank(member)?.owner === true;
}

export function requireOwnership(message) {
  const config = message.client?.config || {};
  if (!memberIsOwnership(message.member, config)) {
    throw new Error('Only Ownership can use that command.');
  }
}

export function requireAdministrator(message) {
  if (!message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    throw new Error('You need the **Administrator** permission to use that command.');
  }
}

export function requireBotPerms(message, permissions = []) {
  const me = message.guild?.members?.me;
  if (!me) throw new Error('Could not resolve the bot member in this server.');
  for (const permission of permissions) {
    if (!me.permissions.has(permission)) {
      throw new Error(`I need the \`${permission}\` permission to run that.`);
    }
  }
}

export async function resolveMember(message, token) {
  const mention = message.mentions.members?.first();
  if (mention) return mention;
  const id = snowflakeFrom(token);
  if (!id) return null;
  return message.guild.members.fetch(id).catch(() => null);
}

export async function resolveUser(message, token, client) {
  const mention = message.mentions.users?.first();
  if (mention) return mention;
  const id = snowflakeFrom(token);
  if (!id) return null;
  return client.users.fetch(id).catch(() => null);
}

export function parseDuration(input = '') {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === '0' || raw === 'perm' || raw === 'permanent' || raw === 'forever') return 0;
  const match = raw.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult =
    unit.startsWith('s') ? 1000
      : unit.startsWith('m') ? 60_000
        : unit.startsWith('h') ? 3_600_000
          : unit.startsWith('d') ? 86_400_000
            : 604_800_000;
  return amount * mult;
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Permanent';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function splitTargetReason(args = []) {
  if (!args.length) return { target: '', reason: '', duration: null, rest: [] };
  const target = args[0] || '';
  let duration = null;
  let reasonParts = args.slice(1);
  if (reasonParts.length) {
    const maybeDuration = parseDuration(reasonParts[0]);
    if (maybeDuration != null) {
      duration = maybeDuration;
      reasonParts = reasonParts.slice(1);
    }
  }
  return {
    target,
    duration,
    reason: reasonParts.join(' ').trim() || 'No reason provided.',
    rest: reasonParts,
  };
}

export function caseMessage(entry, title = 'Moderation case', {
  description = '',
  intro = '',
} = {}) {
  return v2Card({
    intro,
    title: `${title} #${entry.id}`,
    description,
    fields: [
      { name: 'Type', value: entry.type },
      { name: 'User', value: `<@${entry.userId}> (\`${entry.userId}\`)` },
      { name: 'Moderator', value: `<@${entry.moderatorId}>` },
      { name: 'Reason', value: entry.reason || 'No reason provided.' },
      {
        name: 'Duration',
        value: entry.expiresAt
          ? `Until <t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:f>`
          : formatDuration(entry.durationMs),
      },
      { name: 'Points', value: String(entry.points || 0) },
      { name: 'Created', value: `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:f>` },
    ],
  });
}

export function staffRankLabel(member) {
  return getHighestStaffRank(member)?.name || (member?.permissions?.has(PermissionFlagsBits.Administrator) ? 'Administrator' : 'Staff');
}

export function listStaffRanks() {
  return STAFF_RANKS.map((rank) => rank.name).join(', ');
}

export function describeRankAccess(member) {
  const rank = getHighestStaffRank(member);
  const index = getStaffRankIndex(member);
  return {
    rank: rank?.name || null,
    index,
    canWarn: memberIsStaff(member),
    canKick: member?.permissions?.has(PermissionFlagsBits.Administrator) || memberMeetsMinRank(member, RANK_FLOOR.administrator),
    canBan: member?.permissions?.has(PermissionFlagsBits.Administrator) || memberMeetsMinRank(member, RANK_FLOOR.supervisor),
  };
}
