import { SlashCommandBuilder } from 'discord.js';
import { handlePriorityRequest } from '../utils/priorityRequest.js';

export default {
  data: new SlashCommandBuilder()
    .setName('request-priority')
    .setDescription('Request an in-game 30 minute priority. Anyone can approve or deny.')
    .setDMPermission(false),
  execute: handlePriorityRequest,
};
