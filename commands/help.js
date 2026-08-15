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
        '`/ping` - check the bot response time',
        '`/server` - show Clearwater server information',
        '`/help` - show this command list',
        '`/holdvc` / `/unholdvc` - Ownership only: hold or release a voice channel',
        '`/say` - Ownership only: speak text in a voice channel',
        '',
        'Staff also have Circle-style prefix commands with `-`',
        'Example: `-help`, `-ban`, `-mute`, `-purge`, `-modlogs`, `-void`',
      ].join('\n'),
      ephemeral: true,
    }));
  },
};
