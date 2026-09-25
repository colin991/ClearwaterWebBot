import { SlashCommandBuilder } from 'discord.js';
import { handleWithdraw } from '../utils/economyService.js';
import { formatMoney } from '../utils/economyConfig.js';
import { v2Card } from '../utils/v2Message.js';
import { walletFields } from '../utils/economyCommandView.js';

export default {
  data: new SlashCommandBuilder().setName('withdraw').setDescription('Withdraw money from your bank account.')
    .addIntegerOption((option) => option.setName('amount').setDescription('Bank amount to withdraw').setMinValue(1).setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const { user } = await handleWithdraw(interaction.user.id, amount);
    await interaction.reply(v2Card({ title: 'Withdrawal complete', description: `Withdrew **${formatMoney(amount)}**.`, fields: walletFields(user), ephemeral: true }));
  },
};
