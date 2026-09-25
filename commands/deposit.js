import { SlashCommandBuilder } from 'discord.js';
import { handleDeposit } from '../utils/economyService.js';
import { formatMoney } from '../utils/economyConfig.js';
import { v2Card } from '../utils/v2Message.js';
import { walletFields } from '../utils/economyCommandView.js';

export default {
  data: new SlashCommandBuilder().setName('deposit').setDescription('Deposit cash into your bank account.')
    .addIntegerOption((option) => option.setName('amount').setDescription('Cash amount to deposit').setMinValue(1).setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const { user } = await handleDeposit(interaction.user.id, amount);
    await interaction.reply(v2Card({ title: 'Deposit complete', description: `Deposited **${formatMoney(amount)}**.`, fields: walletFields(user), ephemeral: true }));
  },
};
