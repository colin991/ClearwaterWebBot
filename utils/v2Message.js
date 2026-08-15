import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';

/**
 * Build a Components V2 message (no classic embed, no left accent bar).
 * @param {string} text Markdown body (max 4000)
 * @param {{ ephemeral?: boolean, replace?: boolean, files?: import('discord.js').AttachmentBuilder[] }} [options]
 */
export function v2Message(text, {
  ephemeral = false,
  replace = false,
  files,
} = {}) {
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(text || '\u200b').slice(0, 4000)),
    );

  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;

  const payload = {
    components: [container],
    flags,
  };

  if (replace) {
    payload.content = null;
    payload.embeds = [];
  }
  if (files?.length) payload.files = files;
  return payload;
}

/**
 * Shape classic embed fields into a V2 text container (no accent color).
 */
export function v2Card({
  title = '',
  description = '',
  fields = [],
  footer = '',
  intro = '',
  ephemeral = false,
  replace = false,
  files,
} = {}) {
  const parts = [];
  if (intro) parts.push(String(intro));
  if (title) parts.push(`## ${title}`);
  if (description) parts.push(String(description));
  for (const field of fields) {
    if (!field?.name) continue;
    parts.push(`**${field.name}**\n${field.value == null || field.value === '' ? '—' : field.value}`);
  }
  if (footer) parts.push(`-# ${footer}`);
  return v2Message(parts.filter(Boolean).join('\n\n'), { ephemeral, replace, files });
}

/**
 * Attach extra builders (action rows, media, etc.) onto a no-accent V2 container.
 * @param {string} text
 * @param {(container: ContainerBuilder) => void} decorate
 * @param {{ ephemeral?: boolean, files?: import('discord.js').AttachmentBuilder[] }} [options]
 */
export function v2Container(text, decorate, { ephemeral = false, files } = {}) {
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(text || '\u200b').slice(0, 4000)),
    );
  if (typeof decorate === 'function') decorate(container);

  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;

  const payload = { components: [container], flags };
  if (files?.length) payload.files = files;
  return payload;
}
