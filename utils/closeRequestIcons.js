import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const ICON_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'close-request');

/** White glyph icons on the close request card, uploaded once as the bot's own application emojis. */
export const CLOSE_REQUEST_ICONS = Object.freeze({
  warning: { name: 'cr_warning', file: 'warning.png' },
  reason: { name: 'cr_pin', file: 'pin.png' },
  requestedBy: { name: 'cr_id_card', file: 'id-card.png' },
  requestedAt: { name: 'cr_clock', file: 'clock.png' },
});

const loaded = new Map();

/** `<:name:id> ` for an icon once it is loaded, or '' so the card still reads cleanly without it. */
export function closeRequestIcon(key) {
  const tag = loaded.get(key);
  return tag ? `${tag} ` : '';
}

/** Finds the icons among the bot's application emojis, uploading any that are missing. */
export async function loadCloseRequestIcons(client) {
  const manager = client?.application?.emojis;
  if (!manager) return loaded;
  const existing = await manager.fetch();
  for (const [key, icon] of Object.entries(CLOSE_REQUEST_ICONS)) {
    let emoji = existing.find((entry) => entry.name === icon.name);
    if (!emoji) {
      try {
        emoji = await manager.create({ attachment: await readFile(path.join(ICON_DIR, icon.file)), name: icon.name });
      } catch (error) {
        logger.warn(`Close request icon ${icon.name} could not be uploaded: ${error?.message || error}`);
        continue;
      }
    }
    loaded.set(key, `<:${emoji.name}:${emoji.id}>`);
  }
  return loaded;
}

/** Test hook: set or clear loaded icons. */
export function setCloseRequestIcons(entries = {}) {
  loaded.clear();
  for (const [key, tag] of Object.entries(entries)) loaded.set(key, tag);
}
