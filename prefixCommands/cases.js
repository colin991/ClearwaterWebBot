import { EmbedBuilder } from 'discord.js';
import {
  caseEmbed,
  formatDuration,
  parseDuration,
  RANK_FLOOR,
  requireMinRank,
  resolveUser,
} from '../utils/prefixHelpers.js';
import {
  addUserNote,
  clearUserCases,
  findCase,
  listUserNotes,
  removeUserNote,
  userCases,
  userPoints,
  withModerationStore,
} from '../utils/moderationStore.js';

export const caseCommand = {
  name: 'case',
  description: 'Find a specific moderation case.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const entry = await withModerationStore((store) => findCase(store, args[0]));
    if (!entry || entry.guildId !== message.guild.id) return message.reply('Case not found.');
    await message.reply({ embeds: [caseEmbed(entry)] });
  },
};

export const editcase = {
  name: 'editcase',
  description: 'Edit the duration or reason of a case.',
  minRank: RANK_FLOOR.administrator,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.administrator);
    const id = args[0];
    const rest = args.slice(1);
    if (!id || !rest.length) return message.reply('Use `-editcase <id> [duration] [reason…]`.');
    const maybeDuration = parseDuration(rest[0]);
    let durationMs = null;
    let reasonParts = rest;
    if (maybeDuration != null) {
      durationMs = maybeDuration;
      reasonParts = rest.slice(1);
    }
    const reason = reasonParts.join(' ').trim();
    const entry = await withModerationStore((store) => {
      const found = findCase(store, id);
      if (!found || found.guildId !== message.guild.id) return null;
      if (durationMs != null) {
        found.durationMs = durationMs || null;
        found.expiresAt = durationMs > 0 ? new Date(Date.now() + durationMs).toISOString() : null;
      }
      if (reason) found.reason = reason.slice(0, 400);
      found.editedAt = new Date().toISOString();
      return found;
    });
    if (!entry) return message.reply('Case not found.');
    await message.reply({ content: `Updated case #${entry.id}.`, embeds: [caseEmbed(entry, 'Updated case')] });
  },
};

export const modlogs = {
  name: 'modlogs',
  description: 'Get a list of moderation actions taken against the mentioned user.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const user = await resolveUser(message, args[0], message.client);
    if (!user) return message.reply('Use `-modlogs @user`.');
    const cases = await withModerationStore((store) => userCases(store, message.guild.id, user.id).slice(0, 15));
    if (!cases.length) return message.reply(`No modlogs for **${user.tag}**.`);
    const lines = cases.map((entry) => (
      `\`#${entry.id}\` **${entry.type}** · ${entry.reason.slice(0, 80)} · <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
    ));
    const embed = new EmbedBuilder()
      .setColor(0x4f8ff7)
      .setTitle(`Modlogs · ${user.tag}`)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: `${cases.length} shown` });
    await message.reply({ embeds: [embed] });
  },
};

export const uwid = {
  name: 'uwid',
  description: 'Clear a users modlogs.',
  minRank: RANK_FLOOR.seniorSupervisor,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.seniorSupervisor);
    const user = await resolveUser(message, args[0], message.client);
    if (!user) return message.reply('Use `-uwid @user`.');
    const removed = await withModerationStore((store) => clearUserCases(store, message.guild.id, user.id));
    await message.reply(`Cleared **${removed}** modlog${removed === 1 ? '' : 's'} for **${user.tag}**.`);
  },
};

export const points = {
  name: 'points',
  description: 'View a user\'s moderation points.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const user = await resolveUser(message, args[0] || message.author.id, message.client);
    if (!user) return message.reply('Use `-points @user`.');
    const total = await withModerationStore((store) => userPoints(store, message.guild.id, user.id));
    await message.reply(`**${user.tag}** has **${total}** moderation point${total === 1 ? '' : 's'}.`);
  },
};

export const note = {
  name: 'note',
  description: 'Add or remove a private note for a user.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    if (args[0]?.toLowerCase() === 'remove') {
      const user = await resolveUser(message, args[1], message.client);
      const noteId = args[2];
      if (!user || !noteId) return message.reply('Use `-note remove @user <noteId>`.');
      const removed = await withModerationStore((store) => removeUserNote(store, message.guild.id, user.id, noteId));
      return message.reply(removed ? `Removed note \`${noteId}\`.` : 'Note not found.');
    }
    const user = await resolveUser(message, args[0], message.client);
    const content = args.slice(1).join(' ').trim();
    if (!user || !content) return message.reply('Use `-note @user <text>` or `-note remove @user <noteId>`.');
    const created = await withModerationStore((store) => addUserNote(store, message.guild.id, user.id, message.author.id, content));
    await message.reply(`Note \`${created.id}\` added for **${user.tag}**.`);
  },
};

export const notes = {
  name: 'notes',
  description: 'View a user\'s notes, a specific one, or the edit history for one.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const user = await resolveUser(message, args[0], message.client);
    if (!user) return message.reply('Use `-notes @user [noteId]`.');
    const list = await withModerationStore((store) => listUserNotes(store, message.guild.id, user.id));
    if (!list.length) return message.reply(`No notes for **${user.tag}**.`);
    if (args[1]) {
      const found = list.find((item) => item.id === args[1]);
      if (!found) return message.reply('Note not found.');
      const embed = new EmbedBuilder()
        .setColor(0x4f8ff7)
        .setTitle(`Note ${found.id}`)
        .setDescription(found.content)
        .addFields(
          { name: 'Author', value: `<@${found.moderatorId}>`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(new Date(found.createdAt).getTime() / 1000)}:f>`, inline: true },
        );
      return message.reply({ embeds: [embed] });
    }
    const lines = list.slice(0, 15).map((item) => (
      `\`${item.id}\` · <@${item.moderatorId}> · ${item.content.slice(0, 90)}`
    ));
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle(`Notes · ${user.tag}`)
          .setDescription(lines.join('\n')),
      ],
    });
  },
};

export const presets = {
  name: 'presets',
  description: 'View your preset moderation reasons.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const list = await withModerationStore((store) => store.presets);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8ff7)
          .setTitle('Preset reasons')
          .setDescription(list.map((item, index) => `\`${index + 1}.\` ${item}`).join('\n')),
      ],
    });
  },
};

export default [caseCommand, editcase, modlogs, uwid, points, note, notes, presets];
