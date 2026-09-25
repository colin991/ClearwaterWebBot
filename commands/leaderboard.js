import { SlashCommandBuilder } from 'discord.js';
import { getEconomyLeaderboard } from '../utils/economyService.js';
import { formatMoney } from '../utils/economyConfig.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('View the 10 richest Clearwater economy users.'),
  async execute(interaction) {
    const users = await getEconomyLeaderboard(10);
    const description = users.length
      ? users.map((user, index) => `**${index + 1}.** <@${user.discordId}> — **${formatMoney(user.total)}**`).join('\n')
      : 'No economy accounts yet.';
    await interaction.reply(v2Card({ title: 'Top 10 richest users', description }));
  },
};
