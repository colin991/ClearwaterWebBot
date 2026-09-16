import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { postProximityLog } from '../utils/vcActionLog.js';
import { getIdentityCache } from '../utils/identityStore.js';
import {
  addVcWhitelist,
  formatVcWhitelistEntry,
  getVcWhitelist,
  removeVcWhitelist,
} from '../utils/vcWhitelist.js';

function subcommandName(interaction) {
  return interaction.options?.getSubcommand?.(false) || 'checks';
}

async function handleChecks(interaction) {
  const service = interaction.client.vcChecks;
  if (!service) {
    await interaction.reply({ content: 'VC checks are still starting. Try again shortly.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const enabled = interaction.options.getString('state', true) === 'on';
  const result = await service.setEnabled(enabled);
  void postProximityLog(interaction.client, {
    tag: 'VcCheck',
    body: `${interaction.user.username} (${interaction.user.id}): Received \`/vc checks ${enabled ? 'on' : 'off'}\``,
  });
  await interaction.editReply('VC checks are now **' + (enabled ? 'on' : 'off') + '**. Checks default to on after a bot restart.' +
    (!enabled && result.pendingReleases ? ' Some releases are pending; the bot will retry automatically.' : ''));
}

function listText() {
  const entries = getVcWhitelist();
  if (!entries.length) return 'The VC whitelist is empty.';
  const lines = entries.slice(0, 40).map((entry, index) => `${index + 1}. ${formatVcWhitelistEntry(entry)}`);
  if (entries.length > 40) lines.push(`…and ${entries.length - 40} more.`);
  return `VC whitelist (${entries.length}):\n${lines.join('\n')}`;
}

async function handleWhitelist(interaction) {
  const action = interaction.options.getString('action') || (interaction.options.getUser('user') || interaction.options.getString('roblox') ? 'add' : 'list');
  if (action === 'list') {
    await interaction.reply({ content: listText(), flags: MessageFlags.Ephemeral });
    return;
  }

  const user = interaction.options.getUser('user');
  const roblox = interaction.options.getString('roblox');
  if (!user && !roblox) {
    await interaction.reply({ content: 'Pick a Discord member and/or type their in-game Roblox username.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const identity = user ? (await getIdentityCache()).byDiscord?.[user.id] : null;
  const payload = {
    discordId: user?.id,
    robloxId: identity?.robloxId,
    username: roblox || identity?.robloxUsername,
    addedBy: interaction.user.id,
  };

  if (action === 'remove') {
    const removed = await removeVcWhitelist(payload);
    void postProximityLog(interaction.client, {
      tag: 'VcCheck',
      body: `${interaction.user.username} (${interaction.user.id}): Received \`/vc whitelist\` remove · ${user ? `${user.username} (${user.id})` : roblox} · removed ${removed}`,
    });
    await interaction.editReply(removed
      ? `Removed from the VC whitelist. They can be jailed or PMed again if they are not in voice.`
      : 'That person was not on the VC whitelist.');
    return;
  }

  const result = await addVcWhitelist(payload);
  interaction.client.vcChecks?.tick?.();
  void postProximityLog(interaction.client, {
    tag: 'VcCheck',
    body: `${interaction.user.username} (${interaction.user.id}): Received \`/vc whitelist\` add · ${user ? `${user.username} (${user.id})` : roblox}`,
  });
  await interaction.editReply(
    (result.created ? 'Whitelisted' : 'Updated whitelist for')
    + ` ${formatVcWhitelistEntry(result.entry)}. They will not be jailed or PMed by VC checks.`,
  );
}

export default {
  data: new SlashCommandBuilder().setName('vc').setDescription('Manage in-game voice channel checks.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false)
    .addSubcommand(sub => sub.setName('checks').setDescription('Turn automatic voice checks on or off.')
      .addStringOption(option => option.setName('state').setDescription('Enable or disable checks').setRequired(true)
        .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })))
    .addSubcommand(sub => sub.setName('whitelist').setDescription('Stop VC checks from jailing or PMing a player.')
      .addUserOption(option => option.setName('user').setDescription('Discord member to whitelist'))
      .addStringOption(option => option.setName('roblox').setDescription('In-game Roblox username').setMinLength(3).setMaxLength(20))
      .addStringOption(option => option.setName('action').setDescription('Add, remove, or list').addChoices(
        { name: 'add', value: 'add' },
        { name: 'remove', value: 'remove' },
        { name: 'list', value: 'list' },
      ))),
  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId ||
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You must have Administrator permission in the Clearwater server to use this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommandName(interaction) === 'whitelist') {
      await handleWhitelist(interaction);
      return;
    }
    await handleChecks(interaction);
  },
};
