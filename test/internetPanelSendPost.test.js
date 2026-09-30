import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'internet-panel-'));
process.chdir(tmp);
const storeFile = path.join(tmp, 'data', 'clearwater-internet.json');

const {
  handleDiscordInternetInteraction,
  INTERNET_PANEL_POST_CUSTOM_ID,
} = await import('../utils/discordInternetPanel.js');
const { ensureDiscordInternetAccount } = await import('../utils/discordInternetStore.js');

const actor = {
  id: '123456789012345678',
  username: 'poster',
  displayName: 'Poster',
  avatarUrl: 'https://cdn.discordapp.com/avatars/123456789012345678/a.png',
};

function buttonInteraction(customId) {
  const events = [];
  return {
    events,
    customId,
    user: {
      id: actor.id,
      username: actor.username,
      globalName: actor.displayName,
      displayAvatarURL: () => actor.avatarUrl,
    },
    member: { displayName: actor.displayName },
    isButton: () => true,
    isModalSubmit: () => false,
    isStringSelectMenu: () => false,
    showModal: async (modal) => {
      events.push({ type: 'modal', storeExists: existsSync(storeFile), modal });
    },
    reply: async (payload) => { events.push({ type: 'reply', payload }); },
  };
}

test('Send Post opens its modal before any Internet store work', async () => {
  const interaction = buttonInteraction(INTERNET_PANEL_POST_CUSTOM_ID);
  assert.equal(await handleDiscordInternetInteraction(interaction, {}), true);
  assert.equal(interaction.events.length, 1);
  assert.equal(interaction.events[0].type, 'modal');
  assert.equal(interaction.events[0].storeExists, false);
  assert.equal(interaction.events[0].modal.data.title, 'Send a Post');
  assert.equal(existsSync(storeFile), true);
});

test('default account check skips the store write when nothing changed', async () => {
  await ensureDiscordInternetAccount(actor);
  const before = statSync(storeFile).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await ensureDiscordInternetAccount(actor);
  assert.equal(statSync(storeFile).mtimeMs, before);
});
