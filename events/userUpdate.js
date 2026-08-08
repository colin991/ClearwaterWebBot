import { Events } from 'discord.js';
import { readInternetStore, saveInternetStore, upsertInternetUser } from '../utils/internetStore.js';

export default {
  name: Events.UserUpdate,
  async execute(_previousUser, user) {
    const store = await readInternetStore();
    if (!store.users[user.id]) return;

    upsertInternetUser(store, {
      id: user.id,
      username: user.username,
      displayName: user.globalName || user.username,
      avatarUrl: user.displayAvatarURL({ extension: 'png', size: 64 }),
    });
    await saveInternetStore(store);
  },
};
