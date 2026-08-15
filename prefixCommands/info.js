import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import {
  formatDuration,
  listStaffRanks,
  requireBotPerms,
  requireStaff,
  resolveMember,
  resolveUser,
  snowflakeFrom,
  staffRankLabel,
} from '../utils/prefixHelpers.js';
import {
  activeTimedCases,
  moderatorStats,
  withModerationStore,
} from '../utils/moderationStore.js';

export const roles = {
  name: 'roles',
  description: 'List all roles in the server or that a user has, or search for specific roles.',
  async execute(message, args) {
    requireStaff(message);
    const query = args.join(' ').trim();
    const member = await resolveMember(message, args[0]);
    if (member) {
      const list = member.roles.cache
        .filter((role) => role.id !== message.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => role.toString())
        .slice(0, 40);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x4f8ff7)
            .setTitle(`Roles · ${member.user.tag}`)
            .setDescription(list.join(', ') || 'No roles'),
        ],
      });
    }
    let list = [...message.guild.roles.cache.values()]
      .filter((role) => role.id !== message.guild.id)
      .sort((a, b) => b.position - a.position);
    if (query) {
      const needle = query.toLowerCase();
      list = list.filter((role) => role.name.toLowerCase().includes(needle) || role.id === snowflakeFrom(query));
    }
    const lines = list.slice(0, 40).map((role) => `${role} \`${role.id}\` · ${role.members.size}`);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle(query ? `Role search · ${query}` : 'Server roles')
          .setDescription(lines.join('\n') || 'No roles matched.'),
      ],
    });
  },
};

export const members = {
  name: 'members',
  description: 'View a list of users who have one or more roles and don\'t have others.',
  async execute(message, args) {
    requireStaff(message);
    if (!args.length) return message.reply('Use `-members <role> [!missingRole]`.');
    const hasTokens = [];
    const missingTokens = [];
    for (const token of args) {
      if (token.startsWith('!')) missingTokens.push(token.slice(1));
      else hasTokens.push(token);
    }
    const resolveRole = (token) => {
      const id = snowflakeFrom(token) || message.mentions.roles.first()?.id;
      if (id) return message.guild.roles.cache.get(id) || null;
      const needle = token.toLowerCase();
      return message.guild.roles.cache.find((role) => role.name.toLowerCase() === needle)
        || message.guild.roles.cache.find((role) => role.name.toLowerCase().includes(needle))
        || null;
    };
    const hasRoles = hasTokens.map(resolveRole).filter(Boolean);
    const missingRoles = missingTokens.map(resolveRole).filter(Boolean);
    if (!hasRoles.length) return message.reply('Could not resolve the required role.');
    await message.guild.members.fetch().catch(() => {});
    const matches = [...message.guild.members.cache.values()].filter((member) => (
      hasRoles.every((role) => member.roles.cache.has(role.id))
      && missingRoles.every((role) => !member.roles.cache.has(role.id))
    ));
    const preview = matches.slice(0, 30).map((member) => member.toString()).join(', ');
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle(`Members · ${matches.length}`)
          .setDescription(preview || 'Nobody matched.')
          .setFooter({ text: `Has: ${hasRoles.map((role) => role.name).join(', ')}${missingRoles.length ? ` · Missing: ${missingRoles.map((role) => role.name).join(', ')}` : ''}` }),
      ],
    });
  },
};

export const mutes = {
  name: 'mutes',
  description: 'Get a list of muted users and the time until they are unmuted.',
  async execute(message) {
    requireStaff(message);
    await message.guild.members.fetch().catch(() => {});
    const timed = [...message.guild.members.cache.values()]
      .filter((member) => member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now())
      .sort((a, b) => a.communicationDisabledUntilTimestamp - b.communicationDisabledUntilTimestamp)
      .slice(0, 30);
    const cases = await withModerationStore((store) => activeTimedCases(store, message.guild.id, 'mute').slice(0, 20));
    const lines = timed.map((member) => (
      `${member} · ends <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`
    ));
    if (!lines.length && cases.length) {
      for (const entry of cases) {
        lines.push(`<@${entry.userId}> · case #${entry.id} · ${entry.expiresAt ? `<t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:R>` : formatDuration(entry.durationMs)}`);
      }
    }
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Active mutes')
          .setDescription(lines.join('\n') || 'Nobody is muted right now.'),
      ],
    });
  },
};

export const bans = {
  name: 'bans',
  aliases: ['tempbans'],
  description: 'Get a list of muted/temp-banned users and the time until they are unmuted/unbanned.',
  async execute(message) {
    requireStaff(message);
    requireBotPerms(message, [PermissionFlagsBits.BanMembers]);
    const cases = await withModerationStore((store) => activeTimedCases(store, message.guild.id, 'ban').slice(0, 30));
    const lines = cases.map((entry) => (
      `<@${entry.userId}> · case #${entry.id} · ${entry.reason.slice(0, 60)} · <t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:R>`
    ));
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Timed ban cases')
          .setDescription(lines.join('\n') || 'No active timed ban cases. Discord bans are permanent unless staff unban them.'),
      ],
    });
  },
};

export const modstats = {
  name: 'modstats',
  description: 'View stats for top moderators or for a specific moderator.',
  async execute(message, args) {
    requireStaff(message);
    const user = args[0] ? await resolveUser(message, args[0], message.client) : null;
    const stats = await withModerationStore((store) => moderatorStats(store, message.guild.id, user?.id || null).slice(0, 15));
    if (!stats.length) return message.reply('No moderation stats yet.');
    const lines = stats.map((entry, index) => (
      `**${index + 1}.** <@${entry.moderatorId}> · ${entry.total} total · bans ${entry.ban} · kicks ${entry.kick} · mutes ${entry.mute} · warns ${entry.warn}`
    ));
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle(user ? `Modstats · ${user.tag}` : 'Top moderators')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Updates as cases are created' }),
      ],
    });
  },
};

export const inviteinfo = {
  name: 'inviteinfo',
  description: 'Get information about a Discord invite.',
  async execute(message, args) {
    requireStaff(message);
    const raw = args[0] || '';
    const code = raw.split('/').pop()?.split('?')[0];
    if (!code) return message.reply('Use `-inviteinfo <code|url>`.');
    try {
      const invite = await message.client.fetchInvite(code, { withCounts: true });
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x4f8ff7)
            .setTitle(`Invite · ${invite.code}`)
            .addFields(
              { name: 'Server', value: invite.guild?.name || 'Unknown', inline: true },
              { name: 'Channel', value: invite.channel?.name || 'Unknown', inline: true },
              { name: 'Inviter', value: invite.inviter?.tag || 'Unknown', inline: true },
              { name: 'Members', value: String(invite.memberCount || 0), inline: true },
              { name: 'Online', value: String(invite.presenceCount || 0), inline: true },
              { name: 'Temporary', value: invite.temporary ? 'Yes' : 'No', inline: true },
            ),
        ],
      });
    } catch {
      await message.reply('Could not resolve that invite.');
    }
  },
};

export const nick = {
  name: 'nick',
  description: 'Change/clear the nickname of Circle or a user.',
  async execute(message, args) {
    requireStaff(message);
    requireBotPerms(message, [PermissionFlagsBits.ManageNicknames]);
    if (!args.length) {
      await message.guild.members.me.setNickname(null).catch(() => {});
      return message.reply('Cleared my nickname.');
    }
    const member = await resolveMember(message, args[0]);
    if (member) {
      const next = args.slice(1).join(' ').trim();
      if (!member.manageable) return message.reply('I cannot change that nickname.');
      await member.setNickname(next || null, `Nickname changed by ${message.author.tag}`);
      return message.reply(next ? `Set nickname for **${member.user.tag}** to **${next}**.` : `Cleared nickname for **${member.user.tag}**.`);
    }
    const next = args.join(' ').trim();
    await message.guild.members.me.setNickname(next.slice(0, 32)).catch(() => {
      throw new Error('Could not change my nickname.');
    });
    await message.reply(`My nickname is now **${next.slice(0, 32)}**.`);
  },
};

export const diagnose = {
  name: 'diagnose',
  description: 'Check if there are any issues with Circle or one of its plugins/commands.',
  async execute(message, args) {
    requireStaff(message);
    const me = message.guild.members.me;
    const needed = [
      ['BanMembers', PermissionFlagsBits.BanMembers],
      ['KickMembers', PermissionFlagsBits.KickMembers],
      ['ModerateMembers', PermissionFlagsBits.ModerateMembers],
      ['ManageMessages', PermissionFlagsBits.ManageMessages],
      ['ManageChannels', PermissionFlagsBits.ManageChannels],
      ['ManageNicknames', PermissionFlagsBits.ManageNicknames],
      ['ViewChannel', PermissionFlagsBits.ViewChannel],
    ];
    const missing = needed.filter(([, bit]) => !me.permissions.has(bit)).map(([name]) => name);
    const commandName = args[0]?.toLowerCase();
    const command = commandName ? message.client.prefixCommands.get(commandName) : null;
    const embed = new EmbedBuilder()
      .setColor(missing.length ? 0xf0a84b : 0x4f8ff7)
      .setTitle('Diagnose')
      .addFields(
        { name: 'Bot', value: `${me.user.tag}\nLatency ${Math.round(message.client.ws.ping || 0)}ms`, inline: true },
        { name: 'Your rank', value: staffRankLabel(message.member), inline: true },
        { name: 'Prefix commands', value: String(message.client.prefixCommands?.size || 0), inline: true },
        { name: 'Staff ranks recognized', value: listStaffRanks().slice(0, 900) },
        { name: 'Missing bot permissions', value: missing.join(', ') || 'None' },
      );
    if (commandName) {
      embed.addFields({
        name: `Command \`${commandName}\``,
        value: command ? (command.description || 'Loaded') : 'Not found',
      });
    }
    await message.reply({ embeds: [embed] });
  },
};

export default [roles, members, mutes, bans, modstats, inviteinfo, nick, diagnose];
