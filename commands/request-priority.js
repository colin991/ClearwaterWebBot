import { SlashCommandBuilder } from 'discord.js';
import { handlePriorityRequest } from '../utils/priorityRequest.js';

export default {
  data: new SlashCommandBuilder()
    .setName('request-priority')
    .setDescription('Request an in-game 30 minute priority for staff to approve.')
    .setDMPermission(false),
  execute: handlePriorityRequest,
};
