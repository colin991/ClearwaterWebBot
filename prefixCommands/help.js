import { EmbedBuilder } from 'discord.js';
import { PREFIX } from '../utils/prefixHelpers.js';

const GROUPS = [
  {
    title: 'Punishments',
    lines: [
      '`-ban @user [duration] [reason]` — Ban a user from the server.',
      '`-softban @user [reason]` — Ban then unban to purge recent messages.',
      '`-unban <userId>` — Unban a banned user.',
      '`-kick @user [reason]` — Kick a user.',
      '`-mute @user [duration] [reason]` — Timeout/mute a user.',
      '`-unmute @user [reason]` — Remove a mute/timeout.',
      '`-warn @user [reason]` — Warn a user and DM them a case number.',
    ],
  },
  {
    title: 'Cases & notes',
    lines: [
      '`-case <id>` — Find a moderation case.',
      '`-editcase <id> [duration|reason…]` — Edit duration or reason.',
      '`-modlogs @user` — List moderation actions for a user.',
      '`-uwid @user` — Clear a user’s modlogs.',
      '`-points @user` — View a user’s moderation points.',
      '`-note @user <text>` / `-note remove @user <noteId>` — Add or remove a note.',
      '`-notes @user [noteId]` — View notes or one note’s history.',
      '`-presets` — View preset moderation reasons.',
    ],
  },
  {
    title: 'Channels & cleanup',
    lines: [
      '`-purge <1-100> [user]` — Bulk delete messages.',
      '`-clean [count]` — Delete recent Circle/Clearwater bot messages.',
      '`-lock [#channel] [reason]` — Lock Send Messages for @everyone.',
      '`-unlock [#channel]` — Unlock Send Messages for @everyone.',
      '`-locked` — List currently locked channels.',
    ],
  },
  {
    title: 'Info',
    lines: [
      '`-roles [@user|search]` — List roles or search roles.',
      '`-members <hasRole> [!missingRole]` — Members with/without roles.',
      '`-mutes` / `-bans` — Active timed mutes or temp-ban cases.',
      '`-modstats [@mod]` — Top moderator stats.',
      '`-inviteinfo <code|url>` — Invite details.',
      '`-nick [@user] [name]` — Change or clear a nickname.',
      '`-diagnose [command]` — Check bot/command health.',
      '`-id @user` — Melonly Roblox identity lookup.',
      `\`${PREFIX}help\` — Show this list.`,
    ],
  },
];

export default {
  name: 'help',
  aliases: ['commands', 'modhelp', 'circle'],
  description: 'Show Clearwater Circle-style moderation commands.',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0x4f8ff7)
      .setTitle('Moderation Commands')
      .setDescription(`Prefix: \`${PREFIX}\` · Staff ranks only`)
      .addFields(GROUPS.map((group) => ({
        name: group.title,
        value: group.lines.join('\n').slice(0, 1024),
      })))
      .setFooter({ text: 'Modeled after Circle-style staff tools' });
    await message.reply({ embeds: [embed] });
  },
};
