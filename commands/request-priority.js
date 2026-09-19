import { SlashCommandBuilder } from 'discord.js';
import { handlePriorityRequest } from '../utils/priorityRequest.js';

export default {
  data: new SlashCommandBuilder()
    .setName('request-priority')
    .setDescription('Request an in-game 30 minute priority. Anyone can approve, deny, or add time.')
    .setDMPermission(false),
  execute: handlePriorityRequest,
};
