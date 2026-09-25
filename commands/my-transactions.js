import { SlashCommandBuilder } from 'discord.js';
import { listUserTransactions } from '../utils/economyService.js';
import { transactionLine } from '../utils/economyCommandView.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder().setName('my-transactions').setDescription('View your recent economy transactions.'),
  async execute(interaction) {
    const rows = await listUserTransactions(interaction.user.id, 12);
    await interaction.reply(v2Card({
      title: 'Your recent transactions',
      description: rows.length ? rows.map((tx) => transactionLine(tx, interaction.user.id)).join('\n') : 'No transactions yet.',
      ephemeral: true,
    }));
  },
};
