import { PermissionFlagsBits } from 'discord.js';
import {
  caseEmbed,
  formatDuration,
  RANK_FLOOR,
  requireBotPerms,
  requireMinRank,
  resolveMember,
  resolveUser,
  splitTargetReason,
} from '../utils/prefixHelpers.js';
import { createCase, withModerationStore } from '../utils/moderationStore.js';

async function dmCase(user, entry, guildName) {
  if (!user?.send) return;
  try {
    await user.send({
      embeds: [
        caseEmbed(entry, `${guildName} moderation notice`)
          .setDescription(`You received a **${entry.type}** in **${guildName}**.`),
      ],
    });
  } catch {
    // User DMs closed.
  }
}

export const ban = {
  name: 'ban',
  description: 'Ban a user from the server.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    requireBotPerms(message, [PermissionFlagsBits.BanMembers]);
    const { target, duration, reason } = splitTargetReason(args);
    const user = await resolveUser(message, target, message.client);
    if (!user) return message.reply('Use `-ban @user [duration] [reason]`.');
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member && !member.bannable) return message.reply('I cannot ban that member.');

    const entry = await withModerationStore((store) => createCase(store, {
      type: 'ban',
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      reason,
      durationMs: duration,
      points: 5,
    }));

    await message.guild.members.ban(user.id, {
      reason: `#${entry.id} ${reason}`.slice(0, 512),
      deleteMessageSeconds: 0,
    });
    await dmCase(user, entry, message.guild.name);
    await message.reply({ content: `Banned **${user.tag}**.`, embeds: [caseEmbed(entry)] });
  },
};

export const softban = {
  name: 'softban',
  description: 'Ban then immediately unban a user to purge messages.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    requireBotPerms(message, [PermissionFlagsBits.BanMembers]);
    const { target, reason } = splitTargetReason(args);
    const user = await resolveUser(message, target, message.client);
    if (!user) return message.reply('Use `-softban @user [reason]`.');
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member && !member.bannable) return message.reply('I cannot softban that member.');

    const entry = await withModerationStore((store) => createCase(store, {
      type: 'softban',
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      reason,
      points: 3,
    }));

    await message.guild.members.ban(user.id, {
      reason: `Softban #${entry.id} ${reason}`.slice(0, 512),
      deleteMessageSeconds: 60 * 60 * 24 * 7,
    });
    await message.guild.members.unban(user.id, `Softban cleanup #${entry.id}`).catch(() => {});
    await dmCase(user, entry, message.guild.name);
    await message.reply({ content: `Softbanned **${user.tag}** (messages purged).`, embeds: [caseEmbed(entry)] });
  },
};

export const unban = {
  name: 'unban',
  description: 'Unban a banned user from the server.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    requireBotPerms(message, [PermissionFlagsBits.BanMembers]);
    const { target, reason } = splitTargetReason(args);
    const user = await resolveUser(message, target, message.client);
    if (!user) return message.reply('Use `-unban <userId> [reason]`.');
    await message.guild.members.unban(user.id, reason.slice(0, 512));
    const entry = await withModerationStore((store) => createCase(store, {
      type: 'unban',
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      reason,
      points: 0,
    }));
    await message.reply({ content: `Unbanned **${user.tag}**.`, embeds: [caseEmbed(entry)] });
  },
};

export const kick = {
  name: 'kick',
  description: 'Kick a user from the server.',
  minRank: RANK_FLOOR.administrator,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.administrator);
    requireBotPerms(message, [PermissionFlagsBits.KickMembers]);
    const { target, reason } = splitTargetReason(args);
    const member = await resolveMember(message, target);
    if (!member) return message.reply('Use `-kick @user [reason]`.');
    if (!member.kickable) return message.reply('I cannot kick that member.');
    const entry = await withModerationStore((store) => createCase(store, {
      type: 'kick',
      guildId: message.guild.id,
      userId: member.id,
      moderatorId: message.author.id,
      reason,
      points: 2,
    }));
    await dmCase(member.user, entry, message.guild.name);
    await member.kick(`#${entry.id} ${reason}`.slice(0, 512));
    await message.reply({ content: `Kicked **${member.user.tag}**.`, embeds: [caseEmbed(entry)] });
  },
};

export const mute = {
  name: 'mute',
  description: 'Mute a user.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    requireBotPerms(message, [PermissionFlagsBits.ModerateMembers]);
    const { target, duration, reason } = splitTargetReason(args);
    const member = await resolveMember(message, target);
    if (!member) return message.reply('Use `-mute @user [duration] [reason]`.');
    if (!member.moderatable) return message.reply('I cannot mute that member.');
    const ms = duration && duration > 0 ? duration : 60 * 60 * 1000;
    if (ms > 28 * 24 * 60 * 60 * 1000) return message.reply('Discord timeouts cannot exceed 28 days.');
    const entry = await withModerationStore((store) => createCase(store, {
      type: 'mute',
      guildId: message.guild.id,
      userId: member.id,
      moderatorId: message.author.id,
      reason,
      durationMs: ms,
      points: 1,
    }));
    await member.timeout(ms, `#${entry.id} ${reason}`.slice(0, 512));
    await dmCase(member.user, entry, message.guild.name);
    await message.reply({ content: `Muted **${member.user.tag}** for ${formatDuration(ms)}.`, embeds: [caseEmbed(entry)] });
  },
};

export const unmute = {
  name: 'unmute',
  description: 'Unmute a muted user.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    requireBotPerms(message, [PermissionFlagsBits.ModerateMembers]);
    const { target, reason } = splitTargetReason(args);
    const member = await resolveMember(message, target);
    if (!member) return message.reply('Use `-unmute @user [reason]`.');
    if (!member.moderatable) return message.reply('I cannot unmute that member.');
    await member.timeout(null, reason.slice(0, 512));
    const entry = await withModerationStore((store) => createCase(store, {
      type: 'unmute',
      guildId: message.guild.id,
      userId: member.id,
      moderatorId: message.author.id,
      reason,
    }));
    await message.reply({ content: `Unmuted **${member.user.tag}**.`, embeds: [caseEmbed(entry)] });
  },
};

export const warn = {
  name: 'warn',
  description: 'Send a member an official warning DM with a case number.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const { target, reason } = splitTargetReason(args);
    const user = await resolveUser(message, target, message.client);
    if (!user) return message.reply('Use `-warn @user [reason]`.');
    const entry = await withModerationStore((store) => createCase(store, {
      type: 'warn',
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      reason,
      points: 1,
    }));
    await dmCase(user, entry, message.guild.name);
    await message.reply({ content: `Warned **${user.tag}**.`, embeds: [caseEmbed(entry)] });
  },
};

export default [ban, softban, unban, kick, mute, unmute, warn];
