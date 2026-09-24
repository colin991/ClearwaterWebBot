import { SlashCommandBuilder } from 'discord.js';
import { handlePriorityRequest } from '../utils/priorityRequest.js';

export default {
  data: new SlashCommandBuilder()
    .setName('request-priority')
    .setDescription('Request an in-game 30 minute priority. Blocked while a peace timer is running.')
    .setDMPermission(false),
  execute: handlePriorityRequest,
};
