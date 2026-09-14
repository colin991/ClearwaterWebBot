import { PermissionFlagsBits } from 'discord.js';
import { PRIORITY_CHANNEL, priorityPanel } from '../utils/priorityQueue.js';

export default {
  name: 'prtyq',
  description: 'Administrator-only: post the in-game priority queue panel.',
  async execute(message) {
    if (!message.guild || message.guild.id !== message.client.config.guildId) throw new Error('Use this command in the Clearwater Discord server.');
    const member = await message.guild.members.fetch({ user: message.author.id, force: true });
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Administrator permission is required.');
    const channel = await message.guild.channels.fetch(PRIORITY_CHANNEL);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error('The priority queue channel is unavailable.');
    await channel.send(priorityPanel());
    await message.reply('Priority queue panel posted in <#' + PRIORITY_CHANNEL + '>.');
  },
};
