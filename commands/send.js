import { SlashCommandBuilder } from 'discord.js';
import { handleTransfer } from '../utils/economyService.js';
import { formatMoney } from '../utils/economyConfig.js';
import { v2Card } from '../utils/v2Message.js';
import { walletFields } from '../utils/economyCommandView.js';

export default {
  data: new SlashCommandBuilder().setName('send').setDescription('Send cash to another person.')
    .addUserOption((option) => option.setName('person').setDescription('Person receiving the money').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Cash amount to send').setMinValue(1).setRequired(true))
    .addStringOption((option) => option.setName('note').setDescription('Optional transaction note').setMaxLength(100)),
  async execute(interaction) {
    const recipient = interaction.options.getUser('person', true);
    if (recipient.bot) throw new Error('You cannot send money to a bot.');
    const amount = interaction.options.getInteger('amount', true);
    const result = await handleTransfer(interaction.user.id, recipient.id, amount, interaction.options.getString('note') || '');
    const taxText = result.taxAmount ? ` A ${formatMoney(result.taxAmount)} transaction tax was applied; they received ${formatMoney(result.received)}.` : '';
    await interaction.reply(v2Card({ title: 'Money sent', description: `Sent **${formatMoney(amount)}** to <@${recipient.id}>.${taxText}`, fields: walletFields(result.sender), ephemeral: true }));
  },
};
