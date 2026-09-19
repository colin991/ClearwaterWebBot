import {
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { RANK_FLOOR, requireBotPerms, requireMinRank } from '../utils/prefixHelpers.js';
import { v2Card } from '../utils/v2Message.js';

const locked = new Map(); // guildId -> Map(channelId -> { by, at, reason })

function guildLocks(guildId) {
  if (!locked.has(guildId)) locked.set(guildId, new Map());
  return locked.get(guildId);
}

export const purge = {
  name: 'purge',
  aliases: ['clear'],
  description: 'Bulk delete a number of messages.',
  minRank: RANK_FLOOR.leadModerator,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.leadModerator);
    requireBotPerms(message, [PermissionFlagsBits.ManageMessages]);
    const count = Math.min(100, Math.max(1, Number.parseInt(args[0], 10) || 0));
    if (!count) return message.reply('Use `-purge <1-100> [@user]`.');
    const targetId = message.mentions.users.first()?.id || null;
    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const deletable = [...fetched.values()]
      .filter((entry) => entry.id !== message.id)
      .filter((entry) => (targetId ? entry.author.id === targetId : true))
      .filter((entry) => Date.now() - entry.createdTimestamp < 14 * 24 * 60 * 60 * 1000)
      .slice(0, count);
    if (!deletable.length) return message.reply('No recent messages matched.');
    const deleted = await message.channel.bulkDelete(deletable, true);
    const reply = await message.reply(`Deleted **${deleted.size}** message${deleted.size === 1 ? '' : 's'}.`);
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  },
};

export const clean = {
  name: 'clean',
  description: 'Clean up Circle/Clearwater bot recent messages.',
  minRank: RANK_FLOOR.leadModerator,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.leadModerator);
    requireBotPerms(message, [PermissionFlagsBits.ManageMessages]);
    const count = Math.min(50, Math.max(1, Number.parseInt(args[0], 10) || 20));
    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const mine = [...fetched.values()]
      .filter((entry) => entry.author.id === message.client.user.id)
      .slice(0, count);
    if (!mine.length) return message.reply('No recent bot messages to clean.');
    const deleted = await message.channel.bulkDelete(mine, true);
    const reply = await message.reply(`Cleaned **${deleted.size}** bot message${deleted.size === 1 ? '' : 's'}.`);
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  },
};

export const lock = {
  name: 'lock',
  description: 'Deny Send Messages permissions for the @everyone role in the mentioned channel.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    requireBotPerms(message, [PermissionFlagsBits.ManageChannels]);
    const channel = message.mentions.channels.first() || message.channel;
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      return message.reply('That channel cannot be locked.');
    }
    const reason = args.filter((part) => !part.startsWith('<#')).join(' ').trim() || 'Channel locked by staff';
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }, { reason });
    guildLocks(message.guild.id).set(channel.id, {
      by: message.author.id,
      at: new Date().toISOString(),
      reason,
    });
    await message.reply(`Locked ${channel}.`);
  },
};

export const unlock = {
  name: 'unlock',
  description: 'Allow Send Messages permissions for the @everyone role in the mentioned channel.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    requireBotPerms(message, [PermissionFlagsBits.ManageChannels]);
    const channel = message.mentions.channels.first() || message.channel;
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }, { reason: 'Channel unlocked by staff' });
    guildLocks(message.guild.id).delete(channel.id);
    await message.reply(`Unlocked ${channel}.`);
  },
};

export const lockedList = {
  name: 'locked',
  description: 'Get a list of temporary locked channels in your server.',
  minRank: RANK_FLOOR.supervisor,
  async execute(message) {
    requireMinRank(message, RANK_FLOOR.supervisor);
    const map = guildLocks(message.guild.id);
    if (!map.size) return message.reply('No channels are marked as locked right now.');
    const lines = [...map.entries()].map(([channelId, info]) => (
      `<#${channelId}> · by <@${info.by}> · ${info.reason}`
    ));
    await message.reply(v2Card({
      title: 'Locked channels',
      description: lines.join('\n').slice(0, 4000),
    }));
  },
};

export default [purge, clean, lock, unlock, lockedList];
