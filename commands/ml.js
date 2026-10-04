import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { rememberManualIdentity } from '../utils/identityStore.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { DOD_GUILD_ID } from '../utils/dodReports.js';

async function fetchRobloxUser(robloxId) {
  const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(robloxId)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('That Roblox ID does not belong to a valid Roblox account.');
  const user = await response.json();
  if (String(user?.id || '') !== String(robloxId) || !user?.name) {
    throw new Error('That Roblox ID does not belong to a valid Roblox account.');
  }
  return user;
}

export default {
  data: new SlashCommandBuilder()
    .setName('ml')
    .setDescription('Manually link a Discord user to their Roblox account.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName('discord-user')
      .setDescription('Discord user to link')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('roblox-id')
      .setDescription('Numeric Roblox user ID')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(20)),
  guildIds: [DOD_GUILD_ID],

  async execute(interaction) {
    if (String(interaction.guildId) !== DOD_GUILD_ID) rejectWrongGuild();
    const target = interaction.options.getUser('discord-user', true);
    const robloxId = interaction.options.getString('roblox-id', true).trim();
    if (target.bot) throw new Error('Bots cannot be linked to Roblox accounts.');
    if (!/^\d{1,20}$/.test(robloxId) || robloxId === '0') {
      throw new Error('Enter a valid numeric Roblox user ID.');
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roblox = await fetchRobloxUser(robloxId);
    await rememberManualIdentity({
      discordId: target.id,
      robloxId,
      robloxUsername: roblox.name,
      robloxDisplayName: roblox.displayName || roblox.name,
      checkedAt: new Date().toISOString(),
    });

    await interaction.editReply({
      content: `Linked <@${target.id}> to Roblox account **${roblox.name}** (ID: \`${robloxId}\`).`,
      allowedMentions: { parse: [] },
    });
  },
};
