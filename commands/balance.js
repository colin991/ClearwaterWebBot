import { SlashCommandBuilder } from 'discord.js';
import { getWalletView } from '../utils/economyService.js';
import { v2Card } from '../utils/v2Message.js';
import { walletFields } from '../utils/economyCommandView.js';

export default {
  data: new SlashCommandBuilder().setName('balance').setDescription('View your cash and bank balances.'),
  async execute(interaction) {
    const { user } = await getWalletView(interaction.user.id);
    await interaction.reply(v2Card({ title: 'Your balance', fields: walletFields(user), ephemeral: true }));
  },
};
