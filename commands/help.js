import { SlashCommandBuilder } from 'discord.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show the Clearwater bot commands.'),

  async execute(interaction) {
    await interaction.reply(v2Card({
      title: 'Clearwater Bot Help',
      description: [
        '`/ping` - check the bot response time and latency',
        '`/server` - show Clearwater server information',
        '`/briefing` - Discord Administrator only: start a server-wide LEO briefing',
        '`/request-priority` - request a 30 minute in-game priority; anyone can approve, deny, or add time',
        '`/priority active` - see who currently has the in-game priority',
        '`/help` - show this command list',
        '`/vc whitelist` - Discord Administrator only: stop VC checks from jailing or PMing a player',
        '`/say` - Ownership only: speak text in a voice channel',
        '`-funds` - Administrator: show this Roblox group’s funds, last 7 payouts, and last 7 sales',
        '',
        'Ownership VC hold uses prefix commands: `-holdvc` / `-unholdvc` (auto-mutes joiners while held)',
        'Staff also have Circle-style prefix commands with `-`',
        'Example: `-help`, `-ban`, `-mute`, `-purge`, `-modlogs`, `-void`',
      ].join('\n'),
      ephemeral: true,
    }));
  },
};
