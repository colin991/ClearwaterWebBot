import { PermissionFlagsBits } from 'discord.js';
import { readInternetStore, saveInternetStore } from './internetStore.js';

let storeMutationQueue = Promise.resolve();

export function mutateDiscordInternetStore(task) {
  const run = storeMutationQueue.then(async () => {
    const store = await readInternetStore();
    const result = await task(store);
    await saveInternetStore(store);
    return result;
  });
  storeMutationQueue = run.catch(() => {});
  return run;
}

export function internetActor(interaction) {
  const user = interaction.user;
  return {
    id: user.id,
    username: user.username,
    displayName: interaction.member?.displayName || user.globalName || user.displayName || user.username,
    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
  };
}

export function isInternetStaff(interaction, client = interaction.client) {
  if (client.config?.ownerDiscordIds?.includes(interaction.user.id)) return true;
  const roles = interaction.member?.roles?.cache;
  if (client.config?.ownerRoleIds?.some((roleId) => roles?.has?.(roleId))) return true;
  return interaction.memberPermissions?.has?.(PermissionFlagsBits.ModerateMembers) === true;
}

export async function dmInternetUser(client, userId, content) {
  if (!/^\d{16,22}$/.test(String(userId || ''))) return false;
  try {
    const user = await client.users.fetch(String(userId));
    await user.send({ content: String(content).slice(0, 1900), allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}
